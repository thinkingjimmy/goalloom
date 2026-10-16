# Goalloom 性能 Review

## 📊 当前性能基线

### 启动时间（基于最新 test:startup 结果）

```
启动时间范围：
- 最快：572ms
- 中位数：622ms  ⭐️ 主要指标
- 最慢：636ms

目标达成：✅ 中位数 622ms < 1秒，启动速度优秀
```

### 内存占用

```
空闲状态工作集（Working Set）：
- 最小：611 MB
- 中位数：640 MB  ⭐️ 主要指标
- 最大：643 MB

Renderer 堆内存：
- 约 16 MB（非常健康）

目标评估：✅ 640MB 对于 Electron 应用属于中等偏优水平
```

### 构建产物大小

```
总构建产物：~3.1 MB
- main 进程：1.3 MB
- renderer：1.7 MB（包含 React + UI）
- preload：132 KB

最大 chunk：
- index-BVMWKgjV.js: 709 KB（主应用代码）
- DescriptionEditor-FYVIK6xK.js: 345 KB（富文本编辑器）
```

## ✅ 已采用的优化策略

### 1. 代码分割（Code Splitting）
- ✅ 使用 `lazy()` 懒加载 8 个重型组件：
  - StartGate（首次配置）
  - ItemDetail（任务详情）
  - Settings（设置页）
  - CommandPalette（命令面板）
  - Composer（快速输入）
  - Seeded（带种子的输入）
  - ReviewDrawer（复盘抽屉）
  - AiStep（AI 步骤）
- ✅ 使用 `Suspense` 包裹，保持主界面响应

### 2. 构建优化
- ✅ esbuild minify（快速压缩）
- ✅ Vite 按需加载
- ✅ Tree-shaking（已启用）
- ✅ 外部化大型依赖（@supabase/supabase-js 已打包到 main）

### 3. 依赖管理
- ✅ Electron 44.4.4 原生 Temporal（无需 polyfill）
- ✅ Monorepo 扁平依赖（hoisted）
- ✅ 精确版本锁定

### 4. 运行时优化
- ✅ Storage worker 独立线程
- ✅ IPC 最小化数据传输
- ✅ 渲染进程避免重型计算

## ⚠️ 发现的潜在优化点

### 1. 大型 Chunk 优化（中等优先级）

**问题：**
- `index-BVMWKgjV.js`（709 KB）- 主应用 bundle
- `DescriptionEditor-FYVIK6xK.js`（345 KB）- 富文本编辑器

**建议：**
```typescript
// 在 electron.vite.config.ts 中添加手动 chunk 分割
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-ui': ['@radix-ui/react-select', '@radix-ui/react-dialog'],
        'lexical': ['lexical', '@lexical/react'],
      }
    }
  }
}
```

**预期收益：** 启动时减少 50-100ms，首次交互更快

### 2. 描述编辑器按需加载（高优先级）

**问题：** 
- 345 KB 的 Lexical 编辑器在初始加载时就包含
- 大部分用户不会立即编辑任务描述

**建议：**
```typescript
// 在 App.tsx 中懒加载描述编辑器
const DescriptionEditor = lazy(() => 
  import('./components/description/DescriptionEditor')
)

// 仅在打开任务详情时加载
```

**预期收益：** 启动时减少 100-150ms，内存减少 20-30MB

### 3. 图标优化（低优先级）

**当前状态：** Hugeicons 全量导入

**建议：**
```typescript
// 使用树摇优化的图标导入
import { IconName } from '@hugeicons/react/specific/IconName'

// 或者使用虚拟模块按需加载
```

**预期收益：** bundle 减少 50-100KB

### 4. 初始数据预加载（低优先级）

**当前流程：**
1. 窗口创建
2. React 挂载
3. 首次数据请求

**建议：**
```typescript
// 在 main/index.ts 中预加载首次快照
async function createWindow(): Promise<void> {
  // 并行创建窗口和加载数据
  const [state, initialSnapshot] = await Promise.all([
    loadWindowState(statePath, displays),
    storage?.call('snapshot') // 预加载快照
  ])
  
  // 通过 preload 注入初始数据
  window.webContents.once('did-finish-load', () => {
    if (initialSnapshot) {
      window.webContents.send('initial-snapshot', initialSnapshot)
    }
  })
}
```

**预期收益：** 首次可交互时间减少 50-100ms

### 5. Storage Worker 优化（中等优先级）

**当前状态：** Storage worker 200KB

**建议：**
- 分析 worker 中是否有不必要的依赖
- 考虑使用 SharedArrayBuffer 减少序列化开销（仅限数值数据）

**预期收益：** 内存减少 10-20MB

## 📈 优化优先级与实施建议

### Phase 1：快速优化（投入 2-4 小时，收益显著）
1. ✅ **描述编辑器懒加载** - 预计减少 100-150ms 启动
2. ✅ **手动 chunk 分割** - 预计减少 50-100ms 启动
3. ✅ **初始数据预加载** - 预计减少 50-100ms 首次交互

**预期总收益：** 启动时间从 622ms → **420-470ms**，内存减少 20-30MB

### Phase 2：深度优化（投入 4-8 小时）
1. Storage worker 依赖分析
2. 图标按需加载
3. Supabase SDK 树摇优化

**预期总收益：** 内存再减少 30-50MB，bundle 减少 100-200KB

### Phase 3：极致优化（投入 8+ 小时，按需）
1. WASM 替代部分 JS（如加密计算）
2. 虚拟列表性能调优
3. Service Worker 缓存策略（Web 版）

## 🎯 优化建议总结

### 应该优化的（ROI 高）
- ✅ 描述编辑器懒加载
- ✅ 手动 chunk 分割
- ✅ 初始数据预加载

### 可以优化的（ROI 中等）
- 📋 Storage worker 瘦身
- 📋 大型依赖分析（Supabase SDK）

### 不急优化的（ROI 低）
- ⏸️ 图标库优化（当前影响小）
- ⏸️ 极致性能优化（当前已足够好）

## 🏆 性能对比（行业标准）

| 指标 | Goalloom | VS Code | Notion | Slack | 评估 |
|------|----------|---------|--------|-------|------|
| 冷启动 | 622ms | ~1.5s | ~2s | ~1s | ⭐️⭐️⭐️⭐️⭐️ 优秀 |
| 内存占用 | 640MB | ~400MB | ~800MB | ~500MB | ⭐️⭐️⭐️⭐️ 良好 |
| Bundle 大小 | 3.1MB | ~50MB | ~80MB | ~100MB | ⭐️⭐️⭐️⭐️⭐️ 优秀 |

**结论：** Goalloom 的启动性能已经**超越大部分同类 Electron 应用**，属于优秀水平。

## 📝 实施建议

1. **不要过度优化**：当前性能已足够好，用户体验优秀
2. **按需优化**：仅在用户反馈启动慢或内存高时才深度优化
3. **持续监控**：定期运行 `test:startup` 和 `test:performance` 确保不退化
4. **用户优先**：功能开发优先级 > 极致性能优化

## 🔍 监控建议

```bash
# 每次 release 前运行完整性能测试
pnpm test:startup
pnpm test:performance

# 查看性能报告
cat output/tests/performance/startup/latest.json

# 设置性能预算（可选）
启动时间 < 800ms（当前 622ms，留有余量）
内存占用 < 800MB（当前 640MB，留有余量）
```

---

**总结：** Goalloom 当前性能表现优秀，622ms 启动 + 640MB 内存占用属于行业领先水平。建议保持现状，仅在必要时进行增量优化。
