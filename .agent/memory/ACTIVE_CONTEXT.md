# Active Context

> Last updated: 2026-11-18T13:10:00Z

## Current Task
- /impeccable 审计修复任务闭环：F1-F7 + P3 + 渲染 R1 + hook 接线 + 41 孤儿 PNG 裁剪，全部完成。
- 用户授权后已提交并推送：代码 commit `f60bcfe`（57 文件：15 改 + 41 PNG 删 + .impeccable/config.json 新增）→ origin/main；记账 commit 为 git log 最新一笔。工作区干净。
- 本会话收口，用户将开新会话继续部署。

## Verification（推送前新鲜）
- harness 24/0/0 RC0；typecheck RC0；vitest 59 文件 537 用例全过；contrast min 4.70:1；diff --check clean。
- PNG：27 张被引用保留、0 断链；hook wired，2 条 pinned 误报 file-scoped ignore 已登记。
- dev server 后台 bzwn8buw8（/tmp/pp-dev.log）/studio 200，新会话如需复用先探活。

## Deferred / Blocked
- 服务器部署（计划 ~/.claude/plans/shimmying-gliding-puppy.md）：阻塞在 SSH host key 变更（remote ED25519 ≠ pinned ECDSA known_hosts:8），需用户单独授权核验方式，不得绕过。
- 部署基线更新为 f60bcfe：Dockerfile/.dockerignore/scripts/docker-entrypoint.sh 三件套相对 b269c9f 未变；计划步骤 2「HEAD 必须等于 b269c9f」改为核对当前 main HEAD。
- 本机 Docker daemon 仍坏（本地实构建不可行，计划已改服务器内构建）。
- HANDOVER:37 harness 25 为 2026-11-14 dated 历史快照，不改写。

## Hard Constraints
- types.ts 冻结；不升级 Next；不读 .env 内容；密钥只存 SQLite 只回末四位；不写 IP/域名/凭据进文档/memory；测试 test.db/e2e.db 不碰 app.db；界面禁旧术语/感叹号/em dash/emoji/空词；未知「—」未评分「未评分」未设置「未设置」。
- 部署回环隔离：不动既有容器 community-affairs/community-db、nginx/Certbot/安全组；不加 swap、不改 daemon、不装软件；OOM 即停；本机隧道只用 3110，不 kill 3100 dev server。
- 新的 commit/push 需新的明确授权；本轮授权已随 f60bcfe 用尽。Verifier Accept 非发布许可。

## Next
- 新会话第一动作：向用户确认 SSH host key 核验方式（带外核对远端指纹或授权更新 known_hosts），获单独授权后按计划继续服务器部署（无密钥版/回环隔离/服务器直接构建）。