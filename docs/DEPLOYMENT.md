# 部署指南（PromptPilot）

> 状态：已部署（2026-11-18，镜像 prompt-pilot:64e1868，独立验收 Accept）。
> 范围：复用现有 ECS，仅自用。访问模式经用户 2026-11-18 拍板改为**公网 + 安全组 IP 白名单**：
> 容器绑 `0.0.0.0:3100`，安全组 3100 入站只放行指定出口 IP；不申请域名、不配 HTTPS、不新增 nginx 配置、不新建云资源。
> 服务器地址、SSH 密钥路径、白名单 IP 由运维本机保管，不写入本文档。
> 连接命令记录在本机 `.env` 的 `PP_DEPLOY_SSH`（gitignored，不入库）与运维本机备忘；本文档只留指针。

## 部署形态

- 镜像：`node:24-bookworm-slim` 三阶段构建，`--platform=linux/amd64`，运行时 `next start -p 3100`（非 standalone）。
- 构建位置：**服务器内直接构建**（2026-11-17 授权，因本机 Docker daemon 损坏）。服务器内存仅 1.8Gi，构建 OOM 即停，不加 swap、不改 daemon、不装软件。
- 数据：SQLite `file:/var/lib/prompt-pilot/app.db`，宿主目录 bind mount，替换镜像或容器不影响数据。
- 访问：白名单内网络直接打开 `http://<host>:3100`；备用 SSH 隧道 `ssh -N -L 3110:127.0.0.1:3100 <host>` → `http://127.0.0.1:3110`（本机 3100 被 dev server 占用时隧道只用 3110，用完关闭）。见「公网访问与 IP 白名单」。

## 服务器要求与共存

| 项 | 要求 / 现状 |
|---|---|
| Docker | 26.x，服务 active |
| git | 服务器对 GitHub SSH 未配信任，默认走 scp 干净源码包 + sha256 校验；宿主无需 Node（全部在镜像内） |
| 磁盘 / 内存 | 剩余约 10G / 总量 1.8Gi、可用约 1.1Gi；已有 2G swapfile（不改动）；构建与镜像体积需控制 |

既有服务一律不触碰：容器 `community-affairs`（3001）、`community-db`（5432）、nginx 80/443 与 Certbot 配置。应用不经 nginx 反代，SSE 由服务端响应头直接送达。

## 项目侧文件

- `Dockerfile`：base（corepack 固定 pnpm@10.14.0，放行 Prisma 构建脚本）→ builder（`pnpm install --frozen-lockfile` → `db:generate` → `build`，不访问数据库）→ runner（只带 `.next/`、生产依赖与目标平台重新生成的 Prisma client）。
- `scripts/docker-entrypoint.sh`：首启 `prisma db push`（不带 `--accept-data-loss`，破坏性变更报错即停）+ `pnpm db:seed`（12 条内置模板按 slug 幂等 upsert）；已有数据库时先在数据目录留一份滚动备份 `app.db.pre-push.bak`（含 WAL 侧车文件，仅最近一份）；任一步失败不启动服务；末尾 `exec "$@"` 让 `next start` 正确接收 SIGTERM。
- `scripts/deploy.sh`：服务器侧执行的部署脚本（bash），子命令 `precheck / build / run / verify / rollback / status`，详见下方「部署脚本」小节。脚本不含任何服务器地址与凭据，主机相关参数一律环境变量或参数传入。
- `.dockerignore`：整体排除 `data/`、`.env*`、`.git/`、`node_modules/`、`.next/` 等。本机数据与密钥不进镜像、不进传输包。
- `prisma` CLI 在 dependencies（6.19.3），运行阶段可用。

## 数据库与迁移

本项目用 Prisma `db push` 声明式同步 SQLite，没有 `prisma/migrations/` 目录；schema 唯一事实源是 `prisma/schema.prisma`。

### 首启初始化

- 全新空库：容器首启时 entrypoint 执行 `prisma db push` 建表，再 `pnpm db:seed` 写入 12 条内置模板，随后才启动 `next start`。任一步失败容器不启动。
- 幂等性：`db push` 对已同步的 schema 是空操作；seed 按 `slug` upsert，重复执行只恢复内置模板内容，不新增行，自定义模板（`slug=null`）不受影响。因此容器重启、镜像替换都不需要人工干预数据库。
- schema 变更前守卫：数据目录已有 `app.db` 时，entrypoint 在 `db push` 之前复制一份滚动备份 `app.db.pre-push.bak`（连同 `-wal` / `-shm` 侧车文件，如有）。只保留最近一份，每次启动覆盖，磁盘占用有界。此时应用尚未启动，数据库无进程写入，文件复制安全。

### 后续 schema 演进流程

1. 改 `prisma/schema.prisma` 前先备份 `/var/lib/prompt-pilot/app.db`（含密钥与全部记录，脱敏保管）。entrypoint 的滚动备份只兜底最近一次启动，不能替代部署前的人工备份。
2. 构建新镜像并 `run`：entrypoint 自动执行 `db push`。新增表、新增可空列等非破坏性变更直接通过。
3. 破坏性变更（删列、改类型、收紧约束）：`db push` 不带 `--accept-data-loss`，会报错并阻止启动。此时容器不启动、数据不动；须人工评估影响，确认备份可用后，再决定是否在受控环境手动执行带 `--accept-data-loss` 的同步。脚本与 entrypoint 都不自动加该参数。
4. 回滚镜像不等于回滚 schema：旧镜像的 entrypoint 对着已被新 schema 改过的库再跑 `db push`，可能报不兼容。需要回退数据时按「备份、回滚与卸载」的人工路径恢复备份，`deploy.sh rollback` 只回滚镜像并提示该路径，绝不自动覆盖数据库。

### 数据迁移结论

- 默认路径：服务器全新空库 + seed 12 条内置模板。本机 `data/app.db` 含用户记录与设置页模型密钥，默认不迁移到服务器。
- 如确需迁移本机数据：须另行授权，并先走脱敏评估（剥离 `AppSetting` 中的密钥值、评估记录正文是否适合上服务器），不在本部署范围内。
- 密钥注入与数据迁移是两件事：部署后在设置页录入密钥即可，不需要搬库。

## 部署脚本（scripts/deploy.sh）

在服务器源码目录外执行（脚本本身不做 SSH，由运维在服务器上调用）。风格与 entrypoint 一致：失败即停、不打印密钥、不触碰既有服务。

| 子命令 | 行为 | 关键判据 |
|---|---|---|
| `precheck` | 只读采集 Docker 版本、架构、MemAvailable、swap 现状、`/` 与 Docker 根目录磁盘余量、3100 监听、既有容器状态 | Docker 不可用、磁盘低于 3GiB、3100 被其他进程占用、既有容器非运行：停止。MemAvailable 低于 800MiB 只标高风险，不阻断（授权一次构建，OOM 即停） |
| `build [src-dir]` | `docker build --platform=linux/amd64 -t prompt-pilot:<commit>`，tag 取 git 短哈希或 `IMAGE_TAG`；日志写 `LOG_DIR`（默认 `/tmp`，强制在源码目录之外）；有界超时（默认 1200s） | 日志命中 OOM / Killed / exit 137 形态：立即非零退出，零重试。仅 `SecurityFatalError` 原样重试同一命令一次。构建后断言 linux/amd64、Env 无 `*KEY*` / `*SECRET*` / `*TOKEN*` 变量（只输出计数，不回显值） |
| `run [tag]` | `mkdir -p` 数据目录；旧容器存在时先记录其镜像到 `previous-image` 再停删；`docker run -d --name prompt-pilot --restart always -p ${BIND_ADDR}:3100:3100 -v /var/lib/prompt-pilot:/var/lib/prompt-pilot`（`BIND_ADDR` 默认 127.0.0.1，公网白名单模式设 0.0.0.0）；有界等待就绪（默认 180s） | 不加 `--memory` / `--cpus`，不注入密钥。端口仍被其他进程占用即停。restart=always 是 2026-11-25 宿主 OOM 整改：daemon 崩溃/重启后容器必须自动拉起（配合 daemon.json live-restore=true） |
| `verify` | curl 真实路由：`/api/templates` 断言 12 条内置模板（`"builtin":true` 计数），`/studio` `/library` `/templates` `/settings` 均 200；`docker inspect` 断言 `RestartCount=0`、`OOMKilled=false`、端口绑定与 `BIND_ADDR` 一致（回环模式拒绝公网绑定）；既有容器仍在运行 | 任一不满足即非零退出。总数超过 12 时提示存在自定义模板，内置断言不受影响 |
| `rollback` | 停新容器，用 `previous-image` 重启，复测 verify 全部关键项 | 无上一镜像记录即停。数据库恢复只打印人工操作路径（停容器、留存当前库、用备份覆盖、重启复测），绝不自动覆盖数据 |
| `status` | 只读查看容器、镜像、部署状态文件、数据库是否存在、磁盘与内存余量 | 无写入 |

主机相关参数全部可覆盖：`CONTAINER_NAME`、`IMAGE_REPO`、`BIND_ADDR`、`HOST_PORT`、`DATA_DIR`、`STATE_DIR`（部署状态文件目录，默认 `/var/lib/prompt-pilot-deploy`，与数据目录分离）、`LOG_DIR`、`SRC_DIR`、`IMAGE_TAG`、`BUILD_TIMEOUT`、`READY_TIMEOUT`、`CURL_MAX_TIME`、`NEIGHBOR_CONTAINERS`。脚本内不出现任何服务器 IP、域名、密钥路径与凭据。

停止条件与已批准部署计划一致：构建或运行 OOM 即停并报告，零重试（`SecurityFatalError` 单次原样重试除外）；不加 swap、不改 Docker daemon、不装软件、不停既有容器、不改 nginx / Certbot。所有网络与等待场景有界退出（curl `--max-time`、build `timeout`、就绪轮询上限）。

## 部署步骤

以下步骤可手动逐条执行，也可用 `scripts/deploy.sh` 的对应子命令（precheck → build → run → verify）；代码同步（步骤 2）与隧道（步骤 6）仍由运维手动完成。

1. 预检（只读）：`docker info`、`free -h`、磁盘余量、确认 3100 无监听、既有容器在运行。
2. 取代码：`git clone --depth 1 --branch main <origin> /opt/prompt-pilot-src`；git 不可达时改用干净源码包 scp 传输，两侧 sha256 全等。
3. 构建：`docker build --platform=linux/amd64 -t prompt-pilot:<commit> .`，日志放 clone 目录之外。日志命中 OOM / `Killed` / `137` 立即停，零重试，不改构建参数绕过。
4. 建数据目录：`mkdir -p /var/lib/prompt-pilot`。
5. 启动：

   ```bash
   docker run -d --name prompt-pilot --restart always \
     -p 3100:3100 \
     -v /var/lib/prompt-pilot:/var/lib/prompt-pilot \
     prompt-pilot:<commit>
   ```

   不加 `--memory` / `--cpus`：硬上限会把正常 `next start` 误杀成伪 OOM 并触发重启循环。
   公网模式（当前）绑 `0.0.0.0:3100`，前提是安全组 3100 已限制为 IP 白名单；回环模式改 `-p 127.0.0.1:3100:3100`。
6. 白名单内网络直接探活 `http://<host>:3100`；必要时备用 3110 隧道。按下方清单验证。
7. 记录镜像 digest、db 备份路径与部署时间；不记录密钥、IP 与密钥路径。

## 密钥注入

- 默认：部署后在设置页录入，落 SQLite 随 bind mount 持久化，容器重建不丢。
- 可选：root-only（0600）env 文件配 `docker run --env-file`。
- 两者同配时设置页值优先（设置页 > 环境变量 > 代码默认值，见 `lib/settings/store.ts`）。
- 镜像只固化非机密默认值（`ARK_BASE_URL`、`ARK_MODEL_GENERATE`、`DATABASE_URL`）；密钥不进镜像、不进 git、不进文档。

## 验证清单

探活必须打真实 Next.js 路由，不以静态桩 200 判定就绪。

- `/api/templates` 返回 12 条内置模板；`/studio` `/library` `/templates` `/settings` 均 200。
- 无密钥时生成与优化禁用并给出原因与设置入口（AC-15）；库、模板、复制、导出可用。
- SSE 流式经公网或隧道逐段到达，长流不截断。
- 重启容器后数据仍在；`docker inspect` 得 `RestartCount=0`、`OOMKilled=false`。
- 既有容器仍在运行，3001 / 5432 可访问，nginx 与 Certbot 配置未变。
- 客户端产物不含 `sk-`、`Bearer` 与 API key 变量名（AC-17，分模式核验）。

## 备份、回滚与卸载

- 部署前备份 `/var/lib/prompt-pilot/app.db`（含密钥与全部记录），脱敏保管。ECS 系统盘是唯一副本，无快照。entrypoint 的 `app.db.pre-push.bak` 滚动备份只是最近一次启动前的兜底快照，不能替代部署前的人工备份。
- 回滚：停新容器 → 用上一镜像 tag 重启 → 必要时恢复 db 备份 → 复测验证清单。保留上一镜像 tag。`deploy.sh rollback` 自动完成镜像回滚与复测；数据库恢复只提示人工路径，不自动覆盖。注意镜像回滚不回滚 schema，见「数据库与迁移」。
- 卸载：停并删容器、删镜像；按需保留或删除 `/var/lib/prompt-pilot`。不动 ECS 资源与既有服务。

## 公网访问与 IP 白名单

2026-11-18 用户拍板：免隧道直接访问，采用公网绑定 + 安全组 IP 白名单，不做应用层鉴权。

- 容器绑 `0.0.0.0:3100`；安全组入站规则 TCP 3100 授权对象仅为运维出口 IP（/32，可多条）。规则由运维在阿里云控制台维护，不写入本文档。
- 应用无登录鉴权（单用户工具设计）：白名单是唯一的访问边界。**严禁把 3100 对 0.0.0.0/0 全网放行**：录入密钥后任何访问者都可用模型额度、读写删除全部记录。
- 出口 IP 变化（换网络、运营商重拨）会导致无法访问：更新安全组白名单即可，无需改容器。
- 回退到回环模式：`BIND_ADDR=127.0.0.1 deploy.sh run`（旧容器自动记录到 previous-image），并删除安全组 3100 规则。
- 将来若需全网公开：另开阶段补域名、HTTPS 与应用层鉴权，重新评估 nginx 共存；当前白名单模式不覆盖该场景。

## 红线

- IP、域名、密钥路径、白名单地址与任何凭据不写入仓库文档与 memory。
- 不加 swap、不改 Docker daemon、不装软件、不停既有容器、不改 nginx / Certbot；安全组仅允许维护 3100 白名单规则（运维控制台操作），不做其他改动。
- 构建或运行 OOM 即停并报告，不擅自改系统或构建配置。
- 3100 不得对全网放行；白名单是唯一访问边界。