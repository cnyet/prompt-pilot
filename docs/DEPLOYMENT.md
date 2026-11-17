# 现有 ECS 部署方案（PromptPilot）

> 状态：**文档阶段**。已对目标 ECS 做只读核验；未部署、未改动服务器、未创建云资源、未提交。
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

- 镜像自带 Node 24 + pnpm 10.14.0 + `.next/` + 生成后的 Prisma client，`CMD` 为 `pnpm start`（3100）。
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

## 4. 项目侧前置改动（本轮未实施）

本轮只写方案，没有改动业务代码；以下四项需用户确认后另开阶段。

### 4.1 Dockerfile 与 .dockerignore

多阶段镜像：Node 24 + pnpm 10.14.0 → `pnpm install --frozen-lockfile` → `pnpm db:generate` →
`pnpm build`；运行阶段只带 `.next/`、生产依赖与生成后的 Prisma client。
`db push` 与 `db:seed` 在首次启动时执行（12 条内置模板按 slug `upsert` 幂等，可重复）。

`.dockerignore` 必须排除：`data/`、`.env`、`.env.*`、`.git/`、`.agent/`、`.claude/`、
`.superpowers/`、`.scratch/`、`.impeccable/`、`.next/cache/`，以及任何本地部署状态文件。

不能直接把源码丢到宿主上 `yarn install --production` 再 `next start`：宿主无 Node（项目要
>=24），`--production` 会跳过 prisma CLI 与 tailwind 等 devDeps，且必须执行 `prisma generate` /
`next build` / `db push` / `db:seed`，没有 `.next/` 时 `next start` 必然失败。

### 4.2 产物洁净性：密钥与数据不得进镜像或传输包

`data/app.db` 含全部记录正文与设置页保存的 `ARK_API_KEY`（FR-8.1），仓库另有 4 个备份库；
`.env` / `.env.local` 也可能含密钥。`docker build` 的构建上下文必须是干净目录，
或由 `.dockerignore` 完整排除。`docker save` 产物只有镜像层，天然不含宿主机目录。
若用源码 tar 传输，同样先建干净暂存目录，且**不要把 tar 放进 OSS 或 git**。

### 4.3 密钥注入

镜像里只固化**非机密**默认值：`ARK_BASE_URL`、`ARK_MODEL_GENERATE`、`ARK_MODEL_OPTIMIZE`、
`DATABASE_URL=file:/var/lib/prompt-pilot/app.db`。

`ARK_API_KEY` **不进镜像、不进产物、不进聊天**。两条可选路径（本轮未定，见 §10）：

1. 部署后在设置页录入，密钥按 FR-8.1 落到已持久化的 SQLite 里，随宿主目录保留；
   设置页 > 环境变量的优先级已覆盖这条路径。
2. 在服务器写 root-only（0600）的 env 文件，`docker run --env-file` 注入；
   容器重建时仍有效，不能只在首次运行时临时 `-e` 传入。

### 4.4 与现有服务隔离

专用容器名、专用宿主目录 `/var/lib/prompt-pilot`；不新增 nginx 配置，不占用 80 / 443 /
3001 / 5432，不改 `community-affairs` 与 `community-db`，不覆盖 Certbot 管理的 443 段。

## 5. 部署步骤（直连）

| 步 | 动作 |
|---|---|
| 1 | 本地：`pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm build` → `docker build` → `docker save -o image.tar` |
| 2 | 用 SSH/SCP 把 `image.tar` 传到服务器临时目录；本地与服务器两侧校验 sha256；产物不进 git、不进 OSS |
| 3 | 服务器：`docker load -i image.tar`，**保留上一版 tag** 以便回滚 |
| 4 | 建 `/var/lib/prompt-pilot` 并设权限；首次执行 `prisma db push` + `pnpm db:seed` |
| 5 | 启动容器：`127.0.0.1:3100:3100`、`-v /var/lib/prompt-pilot:/var/lib/prompt-pilot`、可选 `--env-file`、`--restart unless-stopped` |
| 6 | 本机建立 SSH 本地端口转发（形如 `ssh -N -L 3100:127.0.0.1:3100 <host>`），确认隧道可用 |
| 7 | 逐层探活：容器内 `127.0.0.1:3100` → 服务器回环 `127.0.0.1:3100` → 本机隧道 `127.0.0.1:3100` → 四个页面 → SSE 流式 → 重启容器后数据仍在 |
| 8 | 记录镜像 digest、db 备份路径与部署时间；**不记录任何密钥、IP 与密钥路径** |
| 9 | 失败则按 §8 回滚 |

注意：探活必须打到 Next.js 的真实路由，不以任何中间层或静态桩的 200 判定应用就绪。

## 6. 上线验证

本地（构建镜像前）：按 `docs/HANDOVER.md` 第 7 节以 clean build 为准，并执行
`node ~/.claude/scripts/claude-project-harness-check.mjs .`、`pnpm run typecheck`、`pnpm test`。

线上（部署后）：

- 四个页面 `/studio` `/library` `/templates` `/settings` 在 1440 与 390 宽度下无横向溢出，
  底部四项标签可达，键盘主路径可达。
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
- **回滚清单**：停新容器 → 用上一版 tag 重启 → 必要时恢复 db 备份 → 复测 §6 的关键项。
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
| `Dockerfile` 与 `.dockerignore` | 未创建，需用户确认后单独阶段实施 |
| `ARK_API_KEY` 注入路径 | 未定（设置页录入 vs 服务器 root-only env 文件），见 §4.3 |
| 将来改为对外开放的前置 | 另开阶段补域名 / 证书覆盖、公网鉴权、nginx 共存方案；本阶段不做 |
| 服务器 `aliyun` CLI 凭证 | 未就绪（无 region、sts 无有效身份）；直连部署不依赖它 |
| `.env` 权限 | 本地为 `644`，含云凭证应改 `600`；本轮未改 |
| `.env` / `.env.example` 内容 | 权限策略阻止，未读取、未绕过、未重试，记为未验证项 |
| SQLite 单点 | ECS 系统盘唯一副本，无快照、无异地备份 |
| 磁盘与内存余量 | 剩余 11G / 可用 1.2Gi；镜像与构建产物需控制体积 |
| 真实 ARK 密钥端到端 | 未验证（流式 usage、错误码映射） |
| `.claude/docs/runtime.md` | 仍写「无部署流水线」，为控范围本轮未改，待同步 |

## 11. 参考

- 项目：`PRODUCT.md`、`DESIGN.md`、`CONTEXT.md`、`docs/HANDOVER.md`、
  `docs/ARCHITECTURE.md`、`.claude/docs/runtime.md`、`package.json`、`prisma/schema.prisma`、
  `lib/llm/registry.ts`、`lib/engine/sse-v3.ts`、`.gitignore`。
