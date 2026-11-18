# Todo Tracker

## In Progress
- （无。部署 + 公网白名单访问全部闭环；待用户：设置页录入模型密钥 + 本地 6 文件 commit/push 授权。）

## Pending
- [ ] 用户录入模型密钥后补验真实链路（AC-1/4/13/14）| Priority: P1 | Created: 2026-11-18 | Blocker: 密钥由用户在公网 /settings 录入
- [ ] 上线前置剩余项：公网/隧道下 SSE 长流、真实密钥端到端（AC-1/4/13/14）、宿主重启后 unless-stopped 自启、hadolint。已验项移入 Done（amd64 实构建/首启 seed/持久化/Prisma 调用/SIGTERM）| Priority: P1 | Created: 2026-11-17 | Updated: 2026-11-18 | Blocker: 模型密钥由用户在设置页录入
- [ ] 观察项处置：Dockerfile 补 openssl 消 Prisma 回退警告；AC-17 口径明确（凭据值 + snake_case 零命中）或改 camelCase 字段名；悬空镜像约 2.7G 清理（需批准，不动 community-affairs 相关）| Priority: P2 | Created: 2026-11-18
- [ ] 把本地 `.env` 权限从 644 改 600（配置改动走备份→改→校验）；直连部署不依赖 `aliyun` CLI，服务器上 CLI 凭证未就绪仅在需要调云 API 时处理 | Priority: P1 | Created: 2026-11-16
- [ ] 删除 `.superpowers/sdd/2026-11-14-v3-phase-6/` 工作区（用户确认后）；「提交全部累积未提交改动」部分已随 `522f25f` 消解，勿再按旧描述重提 | Priority: P2 | Created: 2026-11-14 | Updated: 2026-11-17
- [ ] 真实网关密钥端到端验证（生成 → 优化 usage → 成本页，v3 语义）| Priority: P1 | Created: 2026-11-10 | Blocker: 无 ARK/opencode 真实密钥
- [ ] 为 DeepSeek V4.1 Flash / GPT 5.6 Luna 补价格表或设置覆盖 | Priority: P1 | Created: 2026-11-11
- [ ] 可选：处理 Phase 6 final review 的 4 条 deferred minors（HANDOVER mock fault、mock 输出 v2 词、ARCHITECTURE 备份措辞、`.env.example` 权限阻塞）| Priority: P2 | Created: 2026-11-14
- [ ] 恢复 design-parser.mjs（本机缺失）或改用替代结构校验 | Priority: P2 | Created: 2026-11-13
- [ ] 同步 DESIGN.md Template Card 段（异构网格 / 禁止等尺寸网格 / Featured 金边）与 `.impeccable/design.json` 到统一网格实现（Template Card 段同步仍待办；DESIGN.md:327 的 960px 单列漂移本轮 F3 修复中）| Priority: P2 | Created: 2026-11-17 | Updated: 2026-11-18

## Blocked
- （无。原「本地 Docker 实构建」阻塞项已被服务器内构建路径取代，见 Done。）

## Done
- [x] 本地 6 文件 commit+push：用户自行提交 20282dc（11 文件含 memory）并推送 origin/main | Completed: 2026-11-18
- [x] 本地 Docker 实构建与容器验证：改由服务器内构建完成（amd64 实构建/首启/持久化/SIGTERM 全验，独立 Accept）；本机 daemon 仍坏但不再阻塞交付 | Completed: 2026-11-18
