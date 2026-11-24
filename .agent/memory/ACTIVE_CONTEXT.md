# Active Context

> Last updated: 2026-11-24T08:40:00Z

## Current Task
- 两项修复均已部署闭环：① 17b0601 截断根因（通用适配层下发 thinking.type=disabled + length 成因 max_tokens_with_reasoning）；② 18e9613 抽屉继续优化动画与滚动（scan-line/stream-caret 补抽屉；滚动条件改非进行中→starting，工作台同修）。均已 push，服务器镜像 prompt-pilot:18e9613 上线 verify 全绿。详见 session-summary 2026-11-24 两节。无未提交产品变更（.claude/settings.json 会话前既有改动未触碰）。
- 根因备忘：hy4-flash-free（DB 设置覆盖 env）经 opencode 网关默认开思维链且 reasoning 计入 max_tokens；旧代码通用适配层不发 thinking 开关 → 思维链吃满 8192 预算、可见输出 0 → 截断。网关只认 thinking:{"type":"disabled"}，必带 x-opencode-session；宿主直连网关被 403/1010，探针在容器内跑。
- 服务器终态：容器 prompt-pilot Up（RestartCount=0 / OOMKilled=false），绑 0.0.0.0:3100（公网 + 安全组 IP 白名单），数据 /var/lib/prompt-pilot，源码 /opt/prompt-pilot-src；回滚镜像 17b0601（previous-image）；db 备份 app.db.pre-deploy-20261124.bak 与 -ui.bak。

## Verification
- 本轮：typecheck 0 / vitest 542/542（两轮）；部署 verify 全绿（两次）；线上 optimize e2e：tokensOut 1384 / reasoning 0 / stop / 9.45s（给记录 cmwudoctc0004pi01jjo5so8s 追加迭代，已告知）；bsk 实测抽屉 scan-line/caret/滚动全中（本地 dev 库追加第 3–7 轮沙箱数据）。
- 历史断言 10/10 Accept 见 session-summary 2026-11-18 续节。

## Deferred / Blocked
- 观察项：Prisma openssl 警告；AC-17 camelCase 口径；悬空镜像 + 回滚镜像 64e1868/fb6874d、旧源码目录 /opt/prompt-pilot-src-prev-fb6874d、两侧 /tmp 传输包与构建日志（清理需批准）；certbot timer inactive；Tabs 移动模拟竖向滚动条；design.json sidecar 漂移；本地 dev DB 验证记录待清理。
- AC-13/14（成本页/预算）未专项补验；密钥已录入（设置页 llm.apiKey + hy4-flash-free），AC-1/4 已由本轮生成/优化实测覆盖。
- 本机 Docker daemon 仍坏；dev server 3100 仍在运行（可停）。

## Hard Constraints
- types.ts 冻结；不升级 Next；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署隔离：不动 community-affairs/nginx/Certbot；3100 严禁 0.0.0.0/0 全网放行；不加 swap、不改 daemon、不装软件；OOM 即停零重试；备用隧道只用 3110。
- pre-tool hook 禁 rm 工作区外路径：服务器源码替换用新目录解包 + mv 改名，不做 rm。
- SSH：部署机 ED25519 已带外固定；连接命令见仓库外运维备忘（密钥同目录 prompt-pilot-deploy.md）与本机 .env 的 PP_DEPLOY_SSH（.env 对 Agent 禁读禁写）；`aliyun` ssh 别名是另一台机器，勿用；host key 变更告警即停重新核验。

## Next
- 无进行中任务。hosts 映射已复核删除。可接新任务；清理类动作需用户批准。