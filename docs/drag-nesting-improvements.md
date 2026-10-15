# 拖动嵌套交互优化

## 问题分析

原有实现存在以下问题导致难以准确创建二级 todo:

1. **热区太小**: 垂直方向仅在目标行上下各留 8px 的中间区域才触发嵌套
2. **水平判断过宽**: 整个行宽都算作有效区域,容易误触发
3. **视觉反馈不足**: 用户不清楚何时会触发嵌套操作

## 优化方案

### 1. 扩大垂直热区 (8px → 16px)

```typescript
// 之前: point.y >= bounds.top + 8 && point.y <= bounds.bottom - 8
// 之后: point.y >= bounds.top + 16 && point.y <= bounds.bottom - 16
```

将上下边距从 8px 增加到 16px,使中间可触发区域更大,更容易命中。

### 2. 优化水平判断区域

```typescript
// 只在左侧区域触发嵌套:左侧 60% 或至少 200px
const nestZoneWidth = bounds ? Math.max(200, (bounds.right - bounds.left) * 0.6) : 200
const middle = point.x >= bounds.left && point.x <= bounds.left + nestZoneWidth
```

**设计理由**:
- 将嵌套手势集中在标题/缩进区域
- 保持边缘区域用于重新排序
- 避免在行右侧误触发嵌套

### 3. 清晰的视觉反馈

```css
/* 目标行显示 2px 边框 + 背景高亮 */
.task-row[data-nesting-target='true'] { 
  outline: 2px solid var(--focus) !important; 
  outline-offset: -2px;
  background: var(--hover) !important;
  transition: outline 0.15s ease, background 0.15s ease;
}
```

**视觉设计**:
- 2px 蓝色边框清楚标识目标父任务
- 背景高亮增强可见性
- 平滑过渡动画
- 不影响其他行布局

## 用户体验改进

| 方面 | 优化前 | 优化后 |
|-----|--------|--------|
| 垂直热区 | 行高 - 16px | 行高 - 32px |
| 水平热区 | 整行宽度 | 左侧 60% / 至少 200px |
| 视觉反馈 | 无明显标识 | 边框 + 背景高亮 |
| 拖动体验 | 需要非常精确 | 更容易命中目标 |

## 技术细节

- 保持 6px 拖动激活阈值不变
- 兼容键盘导航和辅助功能
- 不影响边缘重新排序逻辑
- 视觉反馈使用 CSS 过渡动画
- 保持 `transform: none` 规则防止其他行移动

## 测试覆盖

- `tests/subtasks.mjs`: 原生拖动手势、键盘菜单、嵌套继承
- `tests/ordering.mjs`: 拖动重排序与嵌套的区分
- `tests/relation-drag.mjs`: 关系拖动不受影响

[PROTOCOL]: Update this header when making changes, then check README.md.
