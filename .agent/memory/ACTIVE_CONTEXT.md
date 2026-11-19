# Active Context

> Last updated: 2026-11-19T02:49:35Z

## Current Task
- 工作台 polish 完成待部署：输入锁定扫描线 + 停止按钮 destructive + twMerge 字号组根因修复。6 个产品文件未提交：DESIGN.md、app/globals.css、components/studio-v3/PromptComposer.tsx、components/studio-v3/ResultActions.tsx、components/ui/Button.tsx、lib/utils.ts。用户已授权单独部署，**在新会话执行**：commit 这 6 文件 → scp 同步 → deploy.sh → verify。详见 session-summary 2026-11-19 与 handoff-20261119-104935。
- 服务器终态不变：容器 prompt-pilot Up，镜像 prompt-pilot:64e1868，绑 0.0.0.0:3100（公网 + 安全组 IP 白名单），数据 /var/lib/prompt-pilot，源码 /opt/prompt-pilot-src。origin/main=e05af97，本地多一笔未 push 的 memory 记账（随新会话产品 commit 一起 push）；产品基线 20282dc。

## Verification
- polish：typecheck 0 / vitest 537/537 / harness check pass；bsk 浅/深/移动实测锁定、扫描线、停止对比度约 6.9:1、中断保留（细节见 summary 2026-11-19）。
- 部署历史断言 10/10 Accept 见 session-summary 2026-11-18 续节。

## Deferred / Blocked
- 待用户：公网 /settings 录入模型密钥 → 补验 AC-1/4/13/14（本地 dev DB 有密钥，服务器未知）。
- 用户要求删本机 hosts 映射，sudo 命令已给、执行未确认，新会话先问一句。
- 观察项：Prisma openssl 警告；AC-17 口径；悬空镜像约 2.7G（需批准）；certbot timer inactive；Tabs 移动模拟竖向滚动条（既有几何）；design.json sidecar 漂移；本地 dev DB 验证记录待清理。
- 本机 Docker daemon 仍坏；dev server 3100 运行中（上会话背景任务，可停）。

## Hard Constraints
- types.ts 冻结；不升级 Next（dev nudge 同样不执行）；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署隔离：不动 community-affairs/nginx/Certbot；3100 严禁 0.0.0.0/0 全网放行；不加 swap、不改 daemon、不装软件；OOM 即停零重试；备用隧道只用 3110。
- 本次 commit 授权仅限上述 6 产品文件 + 会话末记账笔；普通 push 全局放行。
- SSH host key 带外核验固定；连接方式运维本机保管，不入库。

## Next
- 新会话第一动作：读 handoff-20261119-104935 → git status/diff 核对 → 跑一次 pnpm test → commit 6 产品文件 → scp + deploy.sh + verify（四页面 200 / 12 模板 / 停止配色 / AC-17）。