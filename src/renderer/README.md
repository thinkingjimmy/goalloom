# renderer/

> 父级：[项目地图](../../README.md)。只消费 `window.goalloom` 的 React 视图。

```text
renderer/
├── App.tsx                  # 明示不可录入的 M1 开发预览、连接状态和主题切换
├── main.tsx                 # React 挂载
├── index.html               # 本地页面入口，生产 CSP 由协议响应头下发
├── env.d.ts                 # 有限 preload API 的 Window 声明
├── styles.css               # Tailwind、浅/深主题、焦点和减少动效
├── components/icons/index.tsx # 唯一 Hugeicons 显式导入入口
├── components/ui/button.tsx # shadcn 风格 Radix/CVA Button，无第二图标库
├── components/ui/LICENSE    # shadcn 原始 MIT 声明，随构建许可证汇总交付
└── lib/
    ├── colors.ts            # 八组固定配对色板与稳定 ID 哈希
    ├── messages.ts          # 集中文案；首版语言仍待 D09 确认
    └── utils.ts             # Tailwind class 合并
```

当前是工程预览，不代表已完成首次配置、看板或可靠持久化。缺少 preload 时明确报错。业务规则属于 domain/main，UI 不伪造写入成功。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
