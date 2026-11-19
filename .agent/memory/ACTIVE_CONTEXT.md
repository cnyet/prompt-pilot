# Active Context

> Last updated: 2026-11-19T03:55:00Z

## Current Task
- 工作台 polish 已部署闭环：commit fb6874d（扫描线 + 停止 destructive + twMerge 字号组修复）已 push，服务器镜像 prompt-pilot:fb6874d 上线，verify 与补充验收全绿（详见 session-summary 2026-11-19 续节）。无未提交产品变更。
- 服务器终态：容器 prompt-pilot Up（RestartCount=0 / OOMKilled=false），绑 0.0.0.0:3100（公网 + 安全组 IP 白名单），数据 /var/lib/prompt-pilot，源码 /opt/prompt-pilot-src；回滚镜像 64e1868 已记录；db 备份 app.db.pre-deploy-20261119.bak。

## Verification
- 本轮：typecheck 0 / vitest 537/537；部署 verify 全绿 + AC-17 词边界零命中 + pp-scan/destructive 在产物 + 数据持久 + 本机公网直连 200。
- 历史断言 10/10 Accept 见 session-summary 2026-11-18 续节。

## Deferred / Blocked
- 待用户：公网 /settings 录入模型密钥 → 补验 AC-1/4/13/14。
- hosts 映射会话末仍在，用户选「我自己删」（命令已给），下会话复核一次即可，不代执行。
- 观察项：Prisma openssl 警告；AC-17 camelCase 口径；悬空镜像约 2.7G + 回滚镜像 64e1868（清理需批准）；certbot timer inactive；Tabs 移动模拟竖向滚动条；design.json sidecar 漂移；本地 dev DB 验证记录待清理。
- 本机 Docker daemon 仍坏；dev server 3100 仍在运行（可停）。

## Hard Constraints
- types.ts 冻结；不升级 Next；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署隔离：不动 community-affairs/nginx/Certbot；3100 严禁 0.0.0.0/0 全网放行；不加 swap、不改 daemon、不装软件；OOM 即停零重试；备用隧道只用 3110。
- SSH：部署机 ED25519 已带外固定；连接命令见仓库外运维备忘（密钥同目录 prompt-pilot-deploy.md）；`aliyun` ssh 别名是另一台机器，勿用；host key 变更告警即停重新核验。

## Next
- 无进行中任务。等用户录入密钥后补验 AC-1/4/13/14；或接新任务。