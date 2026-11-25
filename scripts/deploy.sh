#!/usr/bin/env bash
# PromptPilot 服务器侧部署脚本。在 ECS 本机执行，脚本自身不做任何 SSH / 远程动作。
#
# 子命令：
#   precheck          只读采集 Docker / 内存 / 磁盘 / 端口 / 既有容器，输出部署判据
#   build [src-dir]   在源码目录构建 linux/amd64 镜像，日志写源码目录之外
#   run [tag]         建数据目录、停旧容器、启动新容器（保留上一镜像供回滚）
#   verify            探活真实路由：12 条内置模板、四个页面、容器健康、既有容器
#   rollback          用上一镜像重启并复测；数据库恢复只提示人工路径，不自动覆盖
#   status            只读查看容器、镜像、部署状态与资源余量
#
# 主机相关参数一律环境变量或参数传入，脚本不含服务器地址、域名与凭据：
#   SRC_DIR / IMAGE_TAG / CONTAINER_NAME / IMAGE_REPO / BIND_ADDR / HOST_PORT
#   DATA_DIR / STATE_DIR / LOG_DIR / BUILD_TIMEOUT / READY_TIMEOUT / CURL_MAX_TIME
#   NEIGHBOR_CONTAINERS（空格分隔的既有容器名，只读核验，绝不触碰）
#
# 停止条件（继承已批准部署计划）：
#   构建日志命中 OOM / Killed / exit 137 即停，零重试；仅 SecurityFatalError
#   允许原样重试同一命令一次。不加 swap、不改 Docker daemon、不给 build / run
#   加 --memory / --cpus / 内存类 --build-arg 绕过。既有容器与 nginx 一律不碰。
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-prompt-pilot}"
IMAGE_REPO="${IMAGE_REPO:-prompt-pilot}"
# 公网模式设 BIND_ADDR=0.0.0.0，且必须在安全组把 3100 限制为 IP 白名单（见 docs/DEPLOYMENT.md）。
BIND_ADDR="${BIND_ADDR:-127.0.0.1}"
HOST_PORT="${HOST_PORT:-3100}"
CONTAINER_PORT=3100
DATA_DIR="${DATA_DIR:-/var/lib/prompt-pilot}"
STATE_DIR="${STATE_DIR:-/var/lib/prompt-pilot-deploy}"
LOG_DIR="${LOG_DIR:-/tmp}"
SRC_DIR="${SRC_DIR:-}"
IMAGE_TAG="${IMAGE_TAG:-}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-1200}"
READY_TIMEOUT="${READY_TIMEOUT:-180}"
CURL_MAX_TIME="${CURL_MAX_TIME:-15}"
NEIGHBOR_CONTAINERS="${NEIGHBOR_CONTAINERS:-community-affairs community-db}"
EXPECTED_BUILTIN=12

# 服务器本机探活恒走回环：BIND_ADDR=0.0.0.0 时 curl 0.0.0.0 会被系统代理拦截（502）。
BASE_URL="http://127.0.0.1:${HOST_PORT}"
OOM_PATTERN='Killed|signal: killed|exit code: 137|OOM|out of memory|Cannot allocate memory|JavaScript heap out of memory|FATAL ERROR.*heap|std::bad_alloc'

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] 失败：%s\n' "$*" >&2; exit 1; }

# 统计 JSON 文本里的模式出现次数；无命中时 grep 退出码 1 不算错误。
count_matches() {
  { grep -o "$1" || true; } | wc -l | tr -d '[:space:]'
}

check_neighbors() {
  # 只读核验既有容器仍在运行；任何情况下不停止、不重启、不改动它们。
  local fail=0 name running
  read -r -a neighbor_list <<< "$NEIGHBOR_CONTAINERS"
  for name in "${neighbor_list[@]}"; do
    running="$(timeout 15 docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo missing)"
    if [ "$running" = "true" ]; then
      log "既有容器 $name 运行中（只读核验，不触碰）"
    else
      log "不满足：既有容器 $name 状态为 $running"
      fail=1
    fi
  done
  return "$fail"
}

port_listened() {
  ss -ltn "sport = :${HOST_PORT}" 2>/dev/null | tail -n +2 | grep -q .
}

cmd_precheck() {
  local fail=0
  command -v docker >/dev/null 2>&1 || die "docker 命令不存在"
  command -v ss >/dev/null 2>&1 || die "ss 命令不存在，无法核验端口"
  command -v curl >/dev/null 2>&1 || die "curl 命令不存在，无法探活"

  local docker_version
  docker_version="$(timeout 15 docker version --format '{{.Server.Version}}' 2>/dev/null)" \
    || die "Docker daemon 不可用（探测超时或报错）"
  log "Docker Server 版本：$docker_version"

  local arch
  arch="$(uname -m)"
  if [ "$arch" = "x86_64" ]; then
    log "架构 $arch，linux/amd64 为原生构建，无需模拟"
  else
    log "高风险：架构 $arch 非 x86_64，amd64 构建将走模拟，速度与内存风险升高"
  fi

  local mem_kb mem_mib
  mem_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
  mem_mib=$((mem_kb / 1024))
  if [ "$mem_mib" -lt 800 ]; then
    log "高风险：MemAvailable=${mem_mib}MiB（低于 800MiB）。按授权仍可尝试一次构建，OOM 即停"
  else
    log "MemAvailable=${mem_mib}MiB"
  fi
  log "swap 现状（只读，绝不新增）：$(awk '/^SwapTotal:/ {print $2" kB"}' /proc/meminfo)"

  local docker_root path free_k
  docker_root="$(timeout 15 docker info --format '{{.DockerRootDir}}')"
  for path in / "$docker_root"; do
    free_k="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
    if [ "$free_k" -lt $((3 * 1024 * 1024)) ]; then
      log "不满足：$path 剩余 $((free_k / 1024))MiB（低于 3GiB），磁盘写满会连累既有服务"
      fail=1
    else
      log "磁盘 $path 剩余 $((free_k / 1024 / 1024))GiB"
    fi
  done

  if port_listened; then
    if timeout 15 docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
      log "端口 ${HOST_PORT} 由本应用容器占用（重部署场景，run 会先停旧容器）"
    else
      log "不满足：端口 ${HOST_PORT} 被其他进程监听"
      fail=1
    fi
  else
    log "端口 ${HOST_PORT} 空闲"
  fi

  check_neighbors || fail=1

  [ "$fail" -eq 0 ] || die "预检未通过，停止部署（不加 swap、不改 daemon、不停既有容器）"
  log "预检通过，可以构建"
}

run_build_once() {
  # $1=tag $2=源码绝对路径 $3=日志文件 $4=追加标记（重试时 >>）
  local rc=0
  if [ "$4" = "append" ]; then
    timeout --signal=INT --kill-after=30s "$BUILD_TIMEOUT" \
      docker build --platform=linux/amd64 --progress=plain \
      -t "${IMAGE_REPO}:${1}" "$2" >>"$3" 2>&1 || rc=$?
  else
    timeout --signal=INT --kill-after=30s "$BUILD_TIMEOUT" \
      docker build --platform=linux/amd64 --progress=plain \
      -t "${IMAGE_REPO}:${1}" "$2" >"$3" 2>&1 || rc=$?
  fi
  return "$rc"
}

cmd_build() {
  [ -n "$SRC_DIR" ] || die "build 需要源码目录：第一个参数或 SRC_DIR 环境变量"
  [ -f "$SRC_DIR/Dockerfile" ] || die "$SRC_DIR 下没有 Dockerfile"

  local tag="$IMAGE_TAG"
  if [ -z "$tag" ]; then
    tag="$(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    [ -n "$tag" ] || die "无法从 git 取 commit 短哈希（源码包无 .git），请显式传 IMAGE_TAG"
  fi

  mkdir -p "$LOG_DIR" "$STATE_DIR"
  local src_abs log_abs
  src_abs="$(cd "$SRC_DIR" && pwd)"
  log_abs="$(cd "$LOG_DIR" && pwd)"
  case "$log_abs/" in
    "$src_abs/"*) die "日志目录必须位于源码目录之外，避免被 COPY . . 纳入构建上下文" ;;
  esac
  local log_file
  log_file="${log_abs}/prompt-pilot-build-${tag}-$(date +%Y%m%d-%H%M%S).log"
  log "构建 ${IMAGE_REPO}:${tag}，超时上限 ${BUILD_TIMEOUT}s，日志：$log_file"

  local rc=0
  run_build_once "$tag" "$src_abs" "$log_file" new || rc=$?

  # OOM 判定即停，零重试；不改系统配置，不加内存绕过参数。
  if grep -qEi "$OOM_PATTERN" "$log_file"; then
    tail -n 20 "$log_file" >&2 || true
    die "构建日志命中 OOM / Killed / exit 137 形态，立即停止，零重试"
  fi

  if [ "$rc" -ne 0 ]; then
    if grep -q 'SecurityFatalError' "$log_file"; then
      log "命中 SecurityFatalError，按计划原样重试同一命令一次（不改 Dockerfile）"
      rc=0
      run_build_once "$tag" "$src_abs" "$log_file" append || rc=$?
      if grep -qEi "$OOM_PATTERN" "$log_file"; then
        tail -n 20 "$log_file" >&2 || true
        die "重试日志命中 OOM 形态，立即停止，零重试"
      fi
      if [ "$rc" -ne 0 ]; then
        tail -n 40 "$log_file" >&2 || true
        die "SecurityFatalError 重试后仍失败（rc=$rc），停止"
      fi
    else
      tail -n 40 "$log_file" >&2 || true
      die "构建失败（rc=$rc），停止；完整日志见 $log_file"
    fi
  fi

  local arch os
  arch="$(docker image inspect -f '{{.Architecture}}' "${IMAGE_REPO}:${tag}")"
  os="$(docker image inspect -f '{{.Os}}' "${IMAGE_REPO}:${tag}")"
  { [ "$arch" = "amd64" ] && [ "$os" = "linux" ]; } || die "镜像平台为 ${os}/${arch}，不是 linux/amd64"

  # Env 核验只输出计数，不回显具体值，避免误打印凭据。
  local secret_env_count
  secret_env_count="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${IMAGE_REPO}:${tag}" \
    | { grep -cEi '(KEY|SECRET|TOKEN)=' || true; })"
  [ "$secret_env_count" = "0" ] || die "镜像 Env 含疑似凭据变量名（计数 $secret_env_count），停止"

  docker image inspect -f '镜像 Id={{.Id}} 体积={{.Size}} 平台={{.Os}}/{{.Architecture}}' "${IMAGE_REPO}:${tag}"
  printf '%s\n' "${IMAGE_REPO}:${tag}" > "$STATE_DIR/last-built-image"
  log "构建完成，tag 已记录到 $STATE_DIR/last-built-image"
}

resolve_image() {
  local ref="$IMAGE_TAG"
  if [ -z "$ref" ] && [ -f "$STATE_DIR/last-built-image" ]; then
    ref="$(cat "$STATE_DIR/last-built-image")"
  fi
  [ -n "$ref" ] || die "未指定镜像：传 tag 参数 / IMAGE_TAG，或先执行 build"
  case "$ref" in
    *:*) ;;
    *) ref="${IMAGE_REPO}:${ref}" ;;
  esac
  docker image inspect "$ref" >/dev/null 2>&1 || die "镜像 $ref 本地不存在，先执行 build"
  printf '%s\n' "$ref"
}

remove_container_if_exists() {
  if timeout 15 docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    local prev
    prev="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER_NAME")"
    printf '%s\n' "$prev" > "$STATE_DIR/previous-image"
    log "记录上一镜像供回滚：$prev"
    timeout 60 docker stop --time 30 "$CONTAINER_NAME" >/dev/null || die "停止旧容器超时或失败"
    docker rm "$CONTAINER_NAME" >/dev/null
  fi
}

start_container() {
  local ref="$1"
  mkdir -p "$DATA_DIR"
  # 不加 --memory / --cpus：硬上限会把正常 next start 误杀成伪 OOM 并触发重启循环。
  # 不注入密钥：无密钥版按 AC-15 禁用模型操作，密钥由设置页事后录入。
  # restart=always（2026-11-25 宿主 OOM 整改）：除非显式 stop，daemon 重启后必须
  # 自动拉起；unless-stopped 会把 daemon 崩溃时 graceful 停掉的容器当作手动停止，
  # 导致宿主 OOM 后全站过夜不可用（live-restore 已同时在 daemon.json 开启）。
  docker run -d --name "$CONTAINER_NAME" --restart always \
    -p "${BIND_ADDR}:${HOST_PORT}:${CONTAINER_PORT}" \
    -v "${DATA_DIR}:${DATA_DIR}" \
    "$ref" >/dev/null
  printf '%s\n' "$ref" > "$STATE_DIR/current-image"
  log "容器已启动：$ref，数据目录 $DATA_DIR"
}

wait_ready() {
  local waited=0
  while [ "$waited" -lt "$READY_TIMEOUT" ]; do
    if curl -fsS --max-time 5 "$BASE_URL/api/templates" >/dev/null 2>&1; then
      log "服务就绪：/api/templates 可达（约 ${waited}s）"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  docker logs --tail 30 "$CONTAINER_NAME" >&2 || true
  die "等待就绪超时（${READY_TIMEOUT}s），容器日志尾部见上"
}

cmd_run() {
  local ref
  ref="$(resolve_image)"
  mkdir -p "$STATE_DIR"
  remove_container_if_exists
  if port_listened; then
    die "端口 ${HOST_PORT} 仍被其他进程占用，停止（不触碰占用方）"
  fi
  start_container "$ref"
  wait_ready
  log "下一步执行 verify 做完整探活"
}

cmd_verify() {
  local fail=0 body builtin total code p
  body="$(curl -fsS --max-time "$CURL_MAX_TIME" "$BASE_URL/api/templates")" \
    || die "GET /api/templates 失败（服务未就绪或路由异常）"
  builtin="$(printf '%s' "$body" | count_matches '"builtin":true')"
  total="$(printf '%s' "$body" | count_matches '"id":"')"
  if [ "$builtin" -eq "$EXPECTED_BUILTIN" ]; then
    log "内置模板 ${builtin} 条（期望 ${EXPECTED_BUILTIN}），列表共 ${total} 条"
    if [ "$total" -ne "$EXPECTED_BUILTIN" ]; then
      log "提示：总数含自定义模板，内置数量断言不受影响"
    fi
  else
    log "不满足：内置模板 ${builtin} 条，期望 ${EXPECTED_BUILTIN}"
    fail=1
  fi

  for p in /studio /library /templates /settings; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX_TIME" "$BASE_URL$p" || echo 000)"
    if [ "$code" = "200" ]; then
      log "页面 $p 返回 200"
    else
      log "不满足：页面 $p 返回 $code"
      fail=1
    fi
  done

  local running restarts oom
  running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo missing)"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$CONTAINER_NAME" 2>/dev/null || echo -1)"
  oom="$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER_NAME" 2>/dev/null || echo unknown)"
  if [ "$running" = "true" ] && [ "$restarts" = "0" ] && [ "$oom" = "false" ]; then
    log "容器健康：Running=true RestartCount=0 OOMKilled=false"
  else
    log "不满足：Running=$running RestartCount=$restarts OOMKilled=$oom"
    fail=1
  fi

  local ports
  ports="$(docker port "$CONTAINER_NAME" 2>/dev/null || true)"
  case "$ports" in
    *"${BIND_ADDR}:${HOST_PORT}"*) log "端口绑定：$ports" ;;
    *) log "不满足：端口绑定异常（$ports）"; fail=1 ;;
  esac
  if [ "$BIND_ADDR" = "127.0.0.1" ]; then
    case "$ports" in
      *0.0.0.0*|*'[::]'*) log "不满足：回环模式出现非回环绑定"; fail=1 ;;
    esac
  else
    log "提示：公网模式（BIND_ADDR=$BIND_ADDR），必须配合安全组 IP 白名单，见 docs/DEPLOYMENT.md"
  fi

  check_neighbors || fail=1

  [ "$fail" -eq 0 ] || die "验证未通过，按停止条件报告，不擅自改配置"
  log "验证通过"
}

cmd_rollback() {
  [ -f "$STATE_DIR/previous-image" ] || die "没有上一镜像记录（$STATE_DIR/previous-image），无法自动回滚镜像"
  local prev
  prev="$(cat "$STATE_DIR/previous-image")"
  docker image inspect "$prev" >/dev/null 2>&1 || die "上一镜像 $prev 本地不存在，无法回滚"
  log "回滚到上一镜像：$prev"
  remove_container_if_exists
  start_container "$prev"
  wait_ready
  cmd_verify
  log "镜像回滚完成。数据库不会自动恢复；如新镜像已做 schema 变更且需回退数据，人工执行："
  log "  1. docker stop $CONTAINER_NAME"
  log "  2. 先另行留存当前 $DATA_DIR/app.db，再用 app.db.pre-push.bak 覆盖（含 -wal / -shm 侧车文件，如有）"
  log "  3. docker start $CONTAINER_NAME，重新执行 verify"
}

cmd_status() {
  log "容器状态（只读）"
  docker ps -a --filter "name=${CONTAINER_NAME}" --format '{{.Names}} {{.Status}} {{.Ports}}' || true
  local name
  read -r -a neighbor_list <<< "$NEIGHBOR_CONTAINERS"
  for name in "${neighbor_list[@]}"; do
    docker ps -a --filter "name=^${name}$" --format '{{.Names}} {{.Status}}' || true
  done
  log "本应用镜像"
  docker images "$IMAGE_REPO" --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}' || true
  local f
  for f in current-image previous-image last-built-image; do
    if [ -f "$STATE_DIR/$f" ]; then
      log "$f = $(cat "$STATE_DIR/$f")"
    else
      log "$f = —"
    fi
  done
  if [ -f "$DATA_DIR/app.db" ]; then
    log "数据库存在：$DATA_DIR/app.db"
  else
    log "数据库尚未创建（首启由 entrypoint 初始化）"
  fi
  df -h / | tail -n 1
  awk '/^MemAvailable:/ {print "MemAvailable: "$2" kB"}' /proc/meminfo
}

usage() {
  cat >&2 <<'EOF'
用法：scripts/deploy.sh <子命令> [参数]
  precheck          只读预检（Docker / 内存 / 磁盘 / 端口 / 既有容器）
  build [src-dir]   构建镜像（tag 取 git 短哈希或 IMAGE_TAG；日志写 LOG_DIR）
  run [tag]         启动容器（默认取最近构建 tag；保留上一镜像供回滚）
  verify            探活真实路由与容器健康
  rollback          回滚到上一镜像并复测（数据库恢复只提示人工路径）
  status            只读查看状态
环境变量见脚本头部注释；脚本不含任何服务器地址与凭据。
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    precheck) cmd_precheck ;;
    build) SRC_DIR="${1:-$SRC_DIR}"; cmd_build ;;
    run) IMAGE_TAG="${1:-$IMAGE_TAG}"; cmd_run ;;
    verify) cmd_verify ;;
    rollback) cmd_rollback ;;
    status) cmd_status ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
