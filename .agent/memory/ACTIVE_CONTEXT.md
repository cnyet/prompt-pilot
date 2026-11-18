# Active Context

> Last updated: 2026-11-18T14:10:00Z

## Current Task
- 首次服务器部署闭环完成：backend-architect（deploy.sh + entrypoint 备份守卫 + DEPLOYMENT.md）→ devops 预检 GO-WITH-RISK → 部署执行全绿 → 独立 verifier **Accept**（10/10 断言）。详见 session-summary 2026-11-18 续节。
- 服务器终态：容器 prompt-pilot Up，镜像 prompt-pilot:64e1868（amd64/linux，Id sha256:af1d7fe0…70abd），**绑 0.0.0.0:3100（公网 + 安全组 IP 白名单，用户 2026-11-18 拍板，免隧道）**，数据 /var/lib/prompt-pilot（app.db + 滚动备份），状态目录 /var/lib/prompt-pilot-deploy，源码 /opt/prompt-pilot-src。
- 白名单切换闭环：deploy.sh BIND_ADDR 参数化 + verify 条件断言 + 探活恒走回环（服务器 mihomo 代理拦截 curl 0.0.0.0 返 502，已修）；用户已加安全组规则；**本机公网实测四页面 200 + 12 内置模板（2026-11-18）**。访问地址 http://<host>:3100（IP 运维本机保管）。
- 本地未提交 6 文件：scripts/deploy.sh（新）、scripts/docker-entrypoint.sh（+16 备份守卫）、docs/DEPLOYMENT.md（重写+增补）、README.md、docs/HANDOVER.md、.claude/docs/runtime.md。HEAD=64e1868=origin/main，零新提交。

## Verification
- 部署：build 约 4.5 分钟零 OOM（swap 吸收峰值）；12 模板/四页面 200/RestartCount=0/OOMKilled=false；restart 持久化 + 备份守卫实际生效；优雅退出 0.435s ExitCode 143；AC-15 503 NO_MODEL；AC-17 词边界零命中；3110 隧道可达后关闭；既有容器 healthy，nginx/swap/daemon 未动。
- 本地：bash -n / shellcheck 零告警 / typecheck 0；幂等、破坏性变更拒止、备份守卫三段实演通过。

## Deferred / Blocked
- 待用户：设置页录入模型密钥（公网 /settings）→ 补验 AC-1/4/13/14 真实链路。
- 待授权：本地 6 文件 commit+push（Verifier Accept 非 push 许可）。
- 观察项：Prisma openssl-1.1.x 警告（功能正常，建议 Dockerfile 补 openssl）；AC-17 措辞 vs camelCase apiKey 字段名口径偏差（无泄漏）；悬空镜像约 2.7G 未清理（需批准，不动 community-affairs 相关）；certbot renew timer inactive（既有）。
- 本机 Docker daemon 仍坏；dev server 3100 已停（exit 143），需要时重启。

## Hard Constraints
- types.ts 冻结；不升级 Next；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署隔离：不动 community-affairs/community-db、nginx/Certbot；安全组仅维护 3100 白名单规则（用户控制台操作）；**3100 严禁对 0.0.0.0/0 全网放行**（应用无鉴权，白名单是唯一边界）；不加 swap、不改 daemon、不装软件；OOM 即停零重试；备用隧道只用 3110。
- 新的 commit/push 需新的明确授权。
- SSH host key 已带外核验固定（ED25519，2026-11-18）；连接方式运维本机保管，不入库。

## Next
- 用户录入密钥后补验真实模型链路；或授权提交本地 6 文件；或处理观察项（openssl / AC-17 口径 / 悬空镜像清理）。