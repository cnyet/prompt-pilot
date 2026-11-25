# Active Context

> Last updated: 2026-11-24T08:40:00Z

## Current Task
- 两项修复均已部署闭环：① 17b0601 截断根因（通用适配层下发 thinking.type=disabled + length 成因 max_tokens_with_reasoning）；② 18e9613 抽屉继续优化动画与滚动（scan-line/stream-caret 补抽屉；滚动条件改非进行中→starting，工作台同修）。均已 push；最新服务器镜像 prompt-pilot:cf30f19（隐藏端点 + 价格表）上线 verify 全绿。遗留清理、AC-13/14 本地补验、宿主 OOM 审查整改闭环（见续节）。详见 session-summary 2026-11-24/25 各节。无未提交产品变更（.claude/settings.json 会话前既有改动未触碰）。
- 根因备忘：hy4-flash-free（DB 设置覆盖 env）经 opencode 网关默认开思维链且 reasoning 计入 max_tokens；旧代码通用适配层不发 thinking 开关 → 思维链吃满 8192 预算、可见输出 0 → 截断。网关只认 thinking:{"type":"disabled"}，必带 x-opencode-session；宿主直连网关被 403/1010，探针在容器内跑。
- 服务器终态：镜像 e309888（锚点断层修复）+ 30fe0f4（deploy.sh restart=always 固化），三容器 always（脚本已同步，新容器自带），live-restore=true，vm.swappiness=10；绑 0.0.0.0:3100（公网 + 安全组 IP 白名单），数据 /var/lib/prompt-pilot，源码 /opt/prompt-pilot-src；回滚镜像 cf30f19；磁盘 52%/18G；db 备份 20261124×2/20261125×2；daemon.json.bak-20261125。
- 最新修复（2026-11-25）：AppShell 根 overflow-hidden→clip（锚点滚动撑离 fixed 根 104px 致断层空白），bsk 几何实测 + 截图验证。
- 宿主 OOM 全停审查闭环（2026-11-25）：四环故障链与整改见 session-summary 当日节；always 策略经 docker 重启实弹验证。

## Verification
- 本轮：typecheck 0 / vitest 542/542（两轮）；部署 verify 全绿（两次）；线上 optimize e2e：tokensOut 1384 / reasoning 0 / stop / 9.45s（给记录 cmwudoctc0004pi01jjo5so8s 追加迭代，已告知）；bsk 实测抽屉 scan-line/caret/滚动全中（本地 dev 库追加第 3–7 轮沙箱数据）。
- 历史断言 10/10 Accept 见 session-summary 2026-11-18 续节。

## Deferred / Blocked
- 观察项：Prisma openssl 警告；AC-17 camelCase 口径；悬空镜像 + 回滚镜像 64e1868/fb6874d、旧源码目录 /opt/prompt-pilot-src-prev-fb6874d、两侧 /tmp 传输包与构建日志（清理需批准）；certbot timer inactive；Tabs 移动模拟竖向滚动条；design.json sidecar 漂移；本地 dev DB 验证记录待清理。
- AC-13/14 已本地夹具法补验全绿；线上触发待用户给真实单价（hy4-flash-free / deepseek-v4.1-flash 元/百万 token）加 ARK_MODEL_PRESETS 并部署。
- 用户侧：HBR 备份窗口改凌晨（阿里云控制台）；1.8Gi 升内存根除超卖；dockerd 1.2–1.5GB 膨胀观察。
- .env 644→600 命令交用户执行（Agent 禁读写 .env）。
- 本机 Docker daemon 仍坏；dev server 3100 仍在运行（可停）。

## Hard Constraints
- types.ts 冻结；不升级 Next；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署隔离：不动 community-affairs/nginx/Certbot 配置（2026-11-25 授权 start 恢复与 restart=always）；3100 严禁 0.0.0.0/0 全网放行；不加 swap、不装软件；OOM 即停零重试；备用隧道只用 3110。红线修订：2026-11-25 用户显式授权 live-restore=true 与 vm.swappiness=10（原「不改 daemon/不调 sysctl」被取代，备份已留）。
- pre-tool hook 禁 rm 工作区外路径：服务器源码替换用新目录解包 + mv 改名，不做 rm。
- SSH：部署机 ED25519 已带外固定；连接命令见仓库外运维备忘（密钥同目录 prompt-pilot-deploy.md）与本机 .env 的 PP_DEPLOY_SSH（.env 对 Agent 禁读禁写）；`aliyun` ssh 别名是另一台机器，勿用；host key 变更告警即停重新核验。

## Next
- 无进行中任务。hosts 映射已复核删除。可接新任务；清理类动作需用户批准。