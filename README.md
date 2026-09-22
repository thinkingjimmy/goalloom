# Goalloom

**把三个月的方向，连接到今天的行动。**

个人本地 Todo，把时间看板与目标关联放在一起：

```text
Later → 3个月 → 本月 → 本周 → 今天
```

时间列回答「什么时候做」，关联回答「为什么做」。

**技术栈：** Electron · React · TypeScript · Vite · shadcn/ui · Tailwind CSS · Hugeicons · SQLite。

**状态：** 文档 v0.5；私人仓库已建立，尚无应用实现、安装包或实机测试。品牌为 Goalloom，用户已购买 `goalloom.com`。首版仅 macOS / Windows 本地桌面，无账号、云同步或关联进度汇总。

| 文档 | 用途 |
| --- | --- |
| [产品需求](docs/PRD.md) | 功能、状态与入口、时间边界、历史 / 顺延、待定事项 |
| [技术方案与开发 TODO](docs/TODO.md) | 工程约束、数据契约、分阶段任务与验收 |
| [开发代理约定](AGENTS.md) | 文档维护、代码组织、执行与权限规则 |

产品规则只在 PRD 维护，技术与验收只在 TODO 维护。本次评审补全语义与安全边界，不把 D06 / D07 的候选方案当成已确认决定。旧版评估和变更过程保留在 Git 历史，不新增重复规格；测试结果写入 PR / commit。两张参考图保留在 `docs/references/`，仅供私人设计讨论。
