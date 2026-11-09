# 12 — 导出两种格式

**What to build:** 一键导出 Markdown 与 OpenAI messages 两种格式，产物语法合法，变量占位符按格式处理，粘进 SDK 就能跑。

**Blocked by:** 01 — 离线生成打通到页面

**Status:** ready-for-agent

- [ ] Markdown 导出结构可直接阅读，变量以双花括号保留
- [ ] OpenAI messages 导出是合法 JSON，含角色与变量清单
- [ ] 两种格式都不生成语法非法的字符串（用解析器验证）
- [ ] 导出可一键复制，并给出"已复制"反馈
- [ ] 含字面量花括号的内容不会被误当成变量
