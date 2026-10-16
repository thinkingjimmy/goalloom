# Goalloom 项目结构

## 📁 根目录结构

```
goalloom/
├── apps/                    # 应用层
│   ├── desktop/            # Electron 桌面应用（主要产品）
│   ├── mobile/             # React Native 移动端（独立安装）
│   └── website/            # Next.js 官网（独立 pnpm 根）
├── packages/               # 共享包
│   ├── contracts/          # TypeScript 类型定义
│   ├── crypto/             # 加密工具
│   ├── local-store/        # 本地存储抽象
│   ├── schema/             # 数据 schema
│   ├── store-core/         # 核心存储逻辑
│   ├── sync/               # 同步协议
│   └── tests/              # 跨包测试
├── supabase/               # 同步服务端（AGPL-3.0）
├── docs/                   # 项目文档
├── scripts/                # 仓库级脚本
└── [配置文件]              # 根配置
```

## 🏗️ Desktop 应用结构

```
apps/desktop/
├── src/
│   ├── domain/             # 业务领域逻辑（纯函数）
│   ├── main/               # Electron 主进程
│   │   ├── storage/        # SQLite 持久化
│   │   ├── workspace/      # 工作区服务
│   │   ├── sync/           # 同步服务
│   │   ├── window/         # 窗口管理
│   │   ├── smart/          # AI 服务
│   │   └── link-preview/   # 链接预览
│   ├── preload/            # 预加载脚本（IPC 桥接）
│   ├── renderer/           # 渲染进程（React UI）
│   │   ├── features/       # 功能模块（82 个文件）
│   │   │   ├── board/      # 看板
│   │   │   ├── items/      # 任务管理
│   │   │   ├── composer/   # 快速输入
│   │   │   ├── insight/    # 流程洞察
│   │   │   ├── assistance/ # 任务辅助
│   │   │   ├── setup/      # 初始配置
│   │   │   ├── shell/      # 应用外壳
│   │   │   └── smart/      # 智能输入
│   │   ├── components/     # 共享组件（24 个文件）
│   │   │   ├── ui/         # shadcn 基础组件
│   │   │   ├── description/# 富文本编辑
│   │   │   ├── due-date/   # 日期选择
│   │   │   └── links/      # 链接处理
│   │   ├── state/          # 全局状态
│   │   ├── i18n/           # 国际化
│   │   ├── lib/            # 工具函数
│   │   └── assets/         # 静态资源
│   └── shared/             # 进程间共享代码
│       ├── contracts/      # IPC 契约
│       └── i18n/           # 共享 i18n
├── tests/                  # 测试（131 个文件）
│   ├── domain/             # 领域层单元测试
│   ├── main/               # 主进程测试
│   ├── renderer/           # 渲染进程测试
│   ├── integration/        # 集成测试
│   ├── fixtures/           # 测试夹具
│   └── [E2E 场景].mjs      # 46 个 E2E 测试脚本
├── scripts/                # 构建和评估脚本
│   ├── build/              # 打包脚本
│   ├── eval/               # AI 评测
│   ├── test.mjs            # 测试运行器
│   └── README.md
├── native/                 # 原生模块
└── resources/              # 应用资源（图标等）
```

## 📦 Packages 结构

所有 packages 均为 private monorepo 包：

- **contracts** - 共享 TypeScript 类型
- **crypto** - 端到端加密（含测试向量）
- **local-store** - 设备本地存储抽象
- **schema** - 数据模型与验证
- **store-core** - 核心存储逻辑（不依赖 SQLite）
- **sync** - 同步协议 v1 实现
- **tests** - 跨包集成测试（仅提供 @goalloom/* 链接）

## 📚 Docs 结构

```
docs/
├── features/               # 功能规格（产品 + 工程 + TODO）
│   ├── smart-input.md
│   ├── relation-lines.md
│   ├── shortcuts.md
│   ├── flow-insight.md
│   ├── updates.md
│   ├── calendar-modes.md
│   └── [其他功能].md
├── sync/                   # 同步协议文档
│   ├── protocol-v1.md
│   └── desktop.md
├── mobile/                 # 移动端文档
├── releases/               # 发布说明
├── images/                 # README 截图
├── development.md          # 开发文档（L1）
└── README.zh-CN.md         # 中文 README
```

## 🔧 配置文件说明

### 根目录配置
- `package.json` - 根工作区配置
- `pnpm-workspace.yaml` - Monorepo 配置
- `tsconfig.json` - TypeScript 配置
- `vitest.config.ts` - Vitest 配置
- `AGENTS.md` - 开发代理规则
- `CLAUDE.md` - 导入 AGENTS.md

### Desktop 配置
- `electron.vite.config.ts` - Vite 构建配置
- `electron-builder.yml` - 打包配置
- `components.json` - shadcn 配置

## 🚫 忽略的目录

以下目录不进入版本控制：
- `node_modules/` - 依赖
- `out/`, `output/`, `release/` - 构建产物
- `.DS_Store` - 系统文件
- `.cursor/`, `.claude/` - IDE 配置
- `todo/` - 临时笔记

## 🎯 架构原则

1. **分层清晰**：domain（纯逻辑）→ main（服务）→ renderer（UI）
2. **功能内聚**：features/ 按业务功能组织，components/ 存放共享组件
3. **测试完备**：131 个测试文件，覆盖单元/集成/E2E
4. **文档驱动**：每个功能一份规格（产品+工程+验收）
5. **Monorepo**：共享包独立，desktop 和 website 隔离安装

## 📝 命名约定

- 文件夹：kebab-case（`link-preview/`）
- React 组件：PascalCase（`FlowMark.tsx`）
- 工具函数：camelCase
- 测试文件：`*.test.ts` 或 `*.mjs`（E2E）
- 文档：kebab-case（`smart-input.md`）

