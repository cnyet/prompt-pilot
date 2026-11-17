# 现有 ECS 部署方案（PromptPilot）

> 状态：**项目侧前置已实施，仅静态与本地验证**。已对目标 ECS 做只读核验；未部署、未改动服务器、未创建云资源、未提交。
> 目标由用户定为「**复用现有 ECS 直连部署**」，不走 ROS 新建资源栈。
> 范围由用户定为「**不对外开放、仅自用、暂不申请域名**」：容器只绑 `127.0.0.1:3100`，
> 本机经 SSH 隧道访问；不新增 nginx server block、不申请域名与 HTTPS 证书、不加公网鉴权。

## 1. 结论与适用范围

- 用户已提供一台现有 ECS 的 SSH 密钥登录方式（密钥路径与公网 IP 由运维本机保管，不写入仓库文档）。
- 目标是复用这台已有 ECS，不走 ROS 新建资源栈，也没有资源栈状态文件；本机同样没有部署状态文件。
  因此本方案只用 SSH/SCP、Docker 与 SSH 隧道，不调用云 API，不依赖热更新或资源回收脚本。
- **不对外开放、仅自用、暂不申请域名**（用户 2026-11-16 定）：应用只在服务器回环地址监听，
  本机通过 SSH 本地端口转发访问；不新增对外入口，不改既有 nginx 与 Certbot 配置。
- 服务器上已有另一套服务在运行，部署必须与之共存、不干扰；本方案不触碰 80 / 443。
- 路径：本地构建镜像 → 传输 → `docker load` → 容器运行（仅 `127.0.0.1:3100`）→ 本机 SSH 隧道访问。
- 不新建 ECS / EIP / VPC / 安全组 / RDS / OSS 桶，不新开安全组入站端口，没有新增计费资源，
  无需费用确认门禁。

## 2. 服务器现状（2026-11-16 只读核验）

全程只跑只读命令，未改动服务器，未输出任何凭证值。

| 项 | 实测 |
|---|---|
| 系统 | Alibaba Cloud Linux 3（OpenAnolis Edition），内核 5.10.134-19.6.al8.x86_64 |
| 身份 | `root` |
| Node / npm / yarn | **均 absent** |
| pnpm | 10.28.2（与项目 `packageManager` 10.14.0 不同，本方案不依赖宿主 Node） |
| Docker | 26.1.3，服务 active |
| Docker Compose | v2.27.0 |
| nginx | 1.24.0，服务 active |
| git / sqlite3 | 2.43.7 / 3.26.0 |
| `aliyun` CLI | 3.3.14（服务器上有，本机没有） |
| 磁盘 | 40G 总量，已用 28G，**剩余 11G（73%）** |
| 内存 | 1.8Gi 总量，可用约 1.2Gi |

端口与已有服务：

- 80 / 443 由 nginx 占用（IPv4 与 IPv6）；3100 无监听。本机探测：80 → 404，443 → 400，3100 → 无响应。
- 已有容器：`community-affairs`（`0.0.0.0:3001->3000/tcp`）、`community-db`
  （`postgres:16-alpine`，`127.0.0.1:5432->5432/tcp`）。**不要停止、删除或改端口**。
- nginx 已有 `server_name <既有域名>` 的 server block，`proxy_pass http://127.0.0.1:3001`；
  443 的 SSL 由 Certbot 管理。本方案不新增配置，这段保持原样。

云端凭证（本地与服务器两侧）：

- 服务器非交互 shell 与 login shell 中，阿里云相关环境变量**均为 0 个**（第一次粗筛出现的
  `alias` 行是 `which` shell 函数的误匹配，已用纯变量名过滤复核）。
- `aliyun configure get region` 返回未设置；`sts GetCallerIdentity` 未取得有效身份响应。
  `/root/.aliyun` 目录存在但**凭证未就绪**。
- 本地：`aliyun` CLI absent；仓库 `.env` 已从 35 B 增至 168 B，但当前 shell 中相关变量 0 个，
  权限为 `644`（含云凭证应改 `600`，本轮未改）。`.env` / `.env.example` 内容因权限策略未读取，
  未重试、未绕过。
- **直连部署不需要 `aliyun` CLI 与 ROS 凭证**，本方案只走 SSH/SCP 与 Docker，不调用云 API。

由此得到两条硬约束：

1. 宿主无 Node 且内存仅 1.8Gi，**`next build` 不放服务器上跑**；镜像在本地构建好再传。
2. 80 / 443 / 3001 / 5432 已被占用，应用只绑 `127.0.0.1:3100`，不经 nginx 反代；
   既有 nginx 与 Certbot 配置保持原样。

## 3. 部署形态与端口

- 镜像自带 Node 24 + pnpm 10.14.0 + `.next/` + 生成后的 Prisma client，`CMD` 为 `next start -p 3100`（3100）。
- 宿主映射 `127.0.0.1:3100:3100`，**不对公网暴露容器端口**；服务器安全组无需为 3100 新开入站规则。
- SQLite 用绝对路径 `file:/var/lib/prompt-pilot/app.db`，宿主目录 bind mount 到容器；
  路径在应用目录之外，替换镜像或容器都不影响数据。
- 本机访问用 SSH 本地端口转发，形如 `ssh -N -L 3100:127.0.0.1:3100 <host>`；
  `<host>` 与密钥路径由运维本机保管，不写入仓库文档。浏览器打开 `http://127.0.0.1:3100`。
  隧道走已授权的 SSH 通道，不需要域名、HTTPS 证书或额外公网鉴权。
- 不新增 nginx server block，既有域名与 Certbot 段一行不动。因此没有反向代理层：SSE 由服务端
  已设的 `X-Accel-Buffering: no` / `no-cache, no-transform` 直接送达，不存在
  `proxy_read_timeout` 截断风险。
- 域名与 HTTPS：**本阶段不申请域名、不配置 HTTPS**。若将来改为对外开放，需另开阶段补域名 /
  证书覆盖与公网鉴权，并重新评估 nginx 共存方案（见 §7 与 §10）。

## 4. 项目侧前置改动（已实施）

本节范围仅是本地项目侧前置文件：已按用户 2026-11-17 的四项拍板落地，只做静态与本地验证。
服务器部署、镜像传输、容器运行与 `docker load` 仍未执行，也未提交；amd64 实构建列为上线前置未验证项（见 §10）。
`Dockerfile`、`.dockerignore`、`scripts/docker-entrypoint.sh` 为新增文件；`package.json` 把 `prisma` 从
devDependencies 移入 dependencies（固定 6.19.3，未改动约束），`pnpm-lock.yaml` 随之只更新该依赖分类。

### 4.1 Dockerfile 与 .dockerignore

`Dockerfile` 已落地，三阶段同用 `node:24-bookworm-slim`（Debian glibc / OpenSSL 3，对应 Prisma
`debian-openssl-3.0.x`），并固定 `--platform=linux/amd64`：本机是 darwin-arm64，目标 ECS 是 x86_64，
Prisma native 引擎必须在目标平台阶段内生成，绝不复制本机 `.prisma` / `@prisma/client` 产物。

- 基础阶段 `base`：corepack 固定 `pnpm@10.14.0`；写一份 `pnpm-workspace.yaml` 的
  `onlyBuiltDependencies`（`@prisma/client` / `@prisma/engines` / `prisma`）放行 pnpm 10 默认拦截的
  构建脚本，把目标平台 native 引擎固化进镜像，运行时不再联网下载。
- 构建阶段 `builder`：`pnpm install --frozen-lockfile`（构建需 devDependencies）→
  `pnpm db:generate` → `pnpm build`。本阶段不带 `.env`、不设数据库地址，也不访问数据库；
  `prisma generate` 无需 `DATABASE_URL`，`next build` 的数据库访问是请求期的惰性读取。
- 运行阶段 `runner`：只带 `.next/`、生产依赖、`package.json`、`next.config.ts`、`prisma/`
  （schema 与 seed.ts）与在本阶段重新生成的目标平台 Prisma client；`prisma` CLI 已移入 dependencies。
  `CMD ["next", "start", "-p", "3100"]`，不启用 standalone，不加 `outputFileTracingIncludes`，
  不注入任何 agent 标记变量，不升级 Next.js。
- `ENTRYPOINT` 为 `scripts/docker-entrypoint.sh`：首启 `prisma db push`（不带
  `--accept-data-loss`，破坏性变更报错即停，须人工备份确认）与 `pnpm db:seed`（12 条内置模板按
  slug 幂等 upsert，自定义模板不受影响，可重复执行），任一步失败都不启动服务，末尾 `exec "$@"`
  让 `next start` 成为 PID 1 正确接收 SIGTERM。镜像 `EXPOSE 3100`，实际只映射宿主回环。

`.dockerignore` 已落地，整体排除 `data/`（含 5 个含记录正文与密钥的本机库）、`.env` / `.env.*`、
`.git/`、`.agent/`、`.claude/`、`.superpowers/`、`.scratch/`、`.impeccable/`、`.next/`（整体而非仅
cache）、`node_modules/`、`.npm-cache/`、`.pnpm-store/`、`.npmrc`、`.nvmrc`、`.editorconfig`、
`.gitattributes`、`.github/`、`docs/assets/`、`tests/`、`*.tsbuildinfo`、`coverage/` 与根文档。
`.npmrc` 实测只有 `store-dir` / `cache-dir` 两个键，无凭据，但指向本机目录，故排除；镜像内
`pnpm install` 用镜像默认 store，不依赖本机路径。保留的最小集合：
`package.json`、`pnpm-lock.yaml`、`next.config.ts`、`postcss.config.mjs`、`tsconfig.json`、
`next-env.d.ts`、`prisma/`、`app/`、`components/`、`lib/`、`scripts/`（含入口脚本）、`.dockerignore`。

不能直接把源码丢到宿主上 `yarn install --production` 再 `next start`：宿主无 Node（项目要
>=24），`--production` 会跳过 prisma CLI 与 tailwind 等 devDeps，且必须执行 `prisma generate` /
`next build` / `db push` / `db:seed`，没有 `.next/` 时 `next start` 必然失败。

### 4.2 产物洁净性：密钥与数据不得进镜像或传输包

`data/` 下 5 个本机库（app.db 与 4 个 bak）含全部记录正文与设置页保存的模型密钥（FR-8.1）；
`.env` / `.env.local` 也可能含密钥。`.dockerignore` 已整体排除 `data/` 与 `.env*`，镜像定义、
入口脚本与 `.dockerignore` 三份新文件里密钥变量零出现，也没有任何密钥值。`.npmrc` 实测无凭据，
只有两个指向本机目录的路径键，已排除，镜像内安装不依赖本机 store 或 cache（见 §4.1）。

洁净门禁（构建镜像前，本地执行）：`git status --short` 核对无 `data/`、`data/*.db*`、`.env*`、
密钥类文件被新增或改动；逐项核对 `.dockerignore` 覆盖与 Dockerfile 静态项（多阶段、
linux/amd64、目标平台内 `db:generate`、非 standalone、入口初始化、只固化非机密默认值）。
`docker save` 产物只有镜像层，天然不含宿主机目录。若用源码 tar 传输，同样先建干净暂存目录，
且**不要把 tar 放进 OSS 或 git**。

### 4.3 密钥注入

镜像里只固化**非机密**默认值：`ARK_BASE_URL`、`ARK_MODEL_GENERATE`、
`DATABASE_URL=file:/var/lib/prompt-pilot/app.db`。优化模型**不固化**：未单独配置时按 FR-8.3
回落复用生成模型；需要单独指定时，在设置页或 `--env-file` 配置 `ARK_MODEL_OPTIMIZE`。
模型密钥**不进镜像、不进产物、不进聊天**，镜像定义里不带任何密钥默认值。

注入路径已由用户 2026-11-17 拍板，三条事实：

1. **默认：部署后在设置页录入**。密钥按 FR-8.1 落到已持久化的 SQLite 里，随宿主 bind mount
   目录保留；不引入服务器凭证文件，容器重建不丢。
2. **可选进阶：root-only（0600）的 env 文件配 `docker run --env-file` 注入**。容器重建时仍有效，
   不能只在首次运行时临时 `-e` 传入。
3. **两条同时配置时，设置页写入的值优先**，与 `lib/settings/store.ts` 的
   「设置页 > 环境变量 > 代码默认值」一致。

变量名与其映射见 `lib/settings/store.ts`；本阶段不注入、不读取、不回显任何真实密钥值。

### 4.4 与现有服务隔离

专用容器名、专用宿主目录 `/var/lib/prompt-pilot`；不新增 nginx 配置，不占用 80 / 443 /
3001 / 5432，不改 `community-affairs` 与 `community-db`，不覆盖 Certbot 管理的 443 段。

## 5. 部署步骤（直连）

| 步 | 动作 |
|---|---|
| 1 | 本地：按 §6 跑 clean build 与三项检查、`git status --short` 洁净门禁 → `docker build --platform=linux/amd64 -t <tag> .` → `docker save -o image.tar <tag>`；`install` / `db:generate` / `build` 都在 Dockerfile 构建阶段内完成 |
| 2 | 用 SSH/SCP 把 `image.tar` 传到服务器临时目录；本地与服务器两侧校验 sha256；产物不进 git、不进 OSS |
| 3 | 服务器：`docker load -i image.tar`，**保留上一镜像 tag** 以便回滚 |
| 4 | 建 `/var/lib/prompt-pilot` 并设权限；`prisma db push` 与 `pnpm db:seed` 由入口脚本在容器首启自动执行，无需手动，失败即不启动服务 |
| 5 | 启动容器：`127.0.0.1:3100:3100`、`-v /var/lib/prompt-pilot:/var/lib/prompt-pilot`、可选 `--env-file`、`--restart unless-stopped` |
| 6 | 本机建立 SSH 本地端口转发（形如 `ssh -N -L 3100:127.0.0.1:3100 <host>`），确认隧道可用 |
| 7 | 逐层探活：容器内 `127.0.0.1:3100` → 服务器回环 `127.0.0.1:3100` → 本机隧道 `127.0.0.1:3100` → 四个页面 → SSE 流式 → 重启容器后数据仍在；另加「SSH 隧道下的 SSE 长流探针」，属之后获准阶段的待验项（见 §10），本阶段不执行 |
| 8 | 记录镜像 digest、db 备份路径与部署时间；**不记录任何密钥、IP 与密钥路径** |
| 9 | 失败则按 §8 回滚 |

注意：探活必须打到 Next.js 的真实路由，不以任何中间层或静态桩的 200 判定应用就绪。

## 6. 上线验证

本地（构建镜像前）：按 `docs/HANDOVER.md` 第 7 节以 clean build 为准，并执行
`node ~/.claude/scripts/claude-project-harness-check.mjs .`、`pnpm run typecheck`、`pnpm test`、
`git diff --check`。再加**产物洁净门禁**：`git status --short` 核对无 `data/`、`data/*.db*`、
`.env*`、密钥类文件被新增或改动；逐项核对 `.dockerignore` 覆盖（含 `.npmrc` 无凭据但含本机路径已排除）
与 Dockerfile 静态项；确认三份新文件与镜像定义里密钥变量零出现。本轮只做静态与本地验证，
不启动 Docker daemon、不做 amd64 实构建（见 §10）。

线上（部署后）：

- 四个页面 `/studio` `/library` `/templates` `/settings` 在 1440 宽度下无横向溢出，键盘主路径可达。
- AC-15 无密钥时生成与优化禁用且给出原因与设置入口；AC-16 断网时仍可浏览库与模板；
  AC-17 客户端产物不含 `sk-`、`Bearer` 与 API key 变量名（分模式核验，不用裸 `grep "sk-"`）。
- 模板页三类各不少于 4 个真实模板（seed 的 12 条已写入）。
- 流式输出经 SSH 隧道仍逐段到达，长流不被中间层截断。
- 重启容器后 `data` 仍在（验证 §3 的绝对路径与挂载生效）。
- **确认既有服务未受影响**：3001 与 5432 仍可访问，`community-affairs` / `community-db` 仍在运行；
  nginx 80 / 443 与 Certbot 配置未被改动。
- `prefers-reduced-motion` 下动效归零。

## 7. 安全

- 产品是单用户本机工具（PRODUCT.md 非目标：无鉴权、无权限、无多租户）。设置页可写密钥、
  可删除全部记录。若公网可达，任何人都能耗用模型额度、读写与删除数据。
- **本阶段不对外开放**：容器只绑服务器回环 `127.0.0.1:3100`，安全组不新开入站端口，
  访问只经已授权的 SSH 隧道。因此上一条的公网暴露风险不成立，无需公网鉴权方案。
- 不申请域名、不配置 HTTPS 证书；不改既有域名的 443 / Certbot 续期配置。
  隧道内流量由 SSH 加密，浏览器到 `127.0.0.1:3100` 的连接不出本机。
- FR-11 / NFR-12：不引第三方分析脚本与远程日志；出站只需能访问 `ARK_BASE_URL`。
- SSH 私钥、AK/SK、`ARK_API_KEY` 一律不写入仓库文档与 memory；服务器上含凭证的文件保持 0600。
- 若将来改为对外开放，须先补域名与 HTTPS 证书覆盖、nginx 层 HTTP 基本鉴权或 IP 白名单，
  并重新复核本节；这不是当前阶段的范围。

## 8. 备份、回滚与卸载

- 部署前备份 `/var/lib/prompt-pilot/app.db`（含密钥与全部记录），脱敏保管；
  ECS 系统盘是唯一副本，无快照、无异地备份。
- **回滚清单**：停新容器 → 用上一镜像 tag 重启 → 必要时恢复 db 备份 → 复测 §6 的关键项。
  本方案不改 nginx 配置，无需 reload。
- **卸载**：停并删容器、删镜像；没有新增 nginx block 需要清理，无需 reload；
  按需要保留或删除 `/var/lib/prompt-pilot`。本方案没有创建云资源，**不要手动删 ECS 相关资源**。
- 任何回滚或卸载动作前，先确认 §2 的两个既有容器没有被动到。

## 9. 费用

- 复用现有 ECS，**无新增 ECS / EIP / VPC / 安全组 / RDS / OSS 计费资源**，无需询价确认门禁。
- 成本来自已有服务器的资源占用（磁盘剩余 11G、内存可用 1.2Gi，需留意镜像与 `.next/` 占用）
  与模型 API 调用，后者由应用内成本账本记录。

## 10. 决策状态、未决项与残余风险

| 项 | 状态 |
|---|---|
| 对外范围 | **已决（2026-11-16）**：不对外开放、仅自用；容器只绑 `127.0.0.1:3100`，本机 SSH 隧道访问 |
| 新站的域名 / 子域 / HTTPS 证书覆盖 | **已决（2026-11-16）**：暂不申请域名、不配置 HTTPS |
| 公网鉴权方案 | **已决（2026-11-16）**：无公网入口，不需要公网鉴权 |
| 基础镜像与目标平台 | **已决（2026-11-17）**：`node:24-bookworm-slim`，构建与运行同一基座，`--platform=linux/amd64` |
| 运行时形态 | **已决（2026-11-17）**：不启用 standalone，保留 `next start -p 3100`；`prisma` CLI 移入 dependencies，入口脚本首启 `db push` + `db:seed` |
| `Dockerfile`、`.dockerignore`、`scripts/docker-entrypoint.sh` | **已实施（2026-11-17）**：三份新文件已落地，仅静态与本地验证；amd64 实构建未做，见下方未验证项 |
| 模型密钥注入路径 | **已决（2026-11-17）**：设置页录入为默认，root-only 0600 env 文件配 `--env-file` 为可选进阶；同配时设置页值优先，见 §4.3 |
| `.claude/docs/runtime.md` | **已同步（2026-11-17）**：「无部署流水线」已改写为 Docker 镜像交付说明 |
| 将来改为对外开放的前置 | 另开阶段补域名 / 证书覆盖、公网鉴权、nginx 共存方案；本阶段不做 |
| 服务器 `aliyun` CLI 凭证 | 未就绪（无 region、sts 无有效身份）；直连部署不依赖它 |
| `.env` 权限 | 本地为 `644`，含云凭证应改 `600`；本轮未改 |
| `.env` / `.env.example` 内容 | 权限策略阻止，未读取、未绕过、未重试，记为未验证项 |
| SQLite 单点 | ECS 系统盘唯一副本，无快照、无异地备份 |
| 磁盘与内存余量 | 剩余 11G / 可用 1.2Gi；镜像与构建产物需控制体积 |
| amd64 实构建与镜像架构核对 | **本轮未验证，上线前置**：未启动 Docker daemon，未跑 `docker buildx build --platform linux/amd64`，未核对镜像架构 |
| 容器内首启与 12 条模板 | **本轮未验证，上线前置**：`db push` + `db:seed` 只在本地 scratch 目录验证；容器内首启未实测 |
| 重启持久化与 Prisma 实际调用 | **本轮未验证，上线前置**：bind mount 重启后数据仍在、容器内真实 Prisma 调用未实测 |
| SSH 隧道下的 SSE 长流探针 | **本轮未验证，上线前置**：属之后获准阶段的待验项，见 §5 第 7 步 |
| 真实密钥端到端 | **本轮未验证，上线前置**：未注入真实密钥，流式 usage 落库、限流与额度错误码映射未实测 |

## 11. 参考

- 项目：`PRODUCT.md`、`DESIGN.md`、`CONTEXT.md`、`docs/HANDOVER.md`、
  `docs/ARCHITECTURE.md`、`.claude/docs/runtime.md`、`package.json`、`prisma/schema.prisma`、
  `lib/llm/registry.ts`、`lib/engine/sse-v3.ts`、`.gitignore`。
