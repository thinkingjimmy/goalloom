# 时间列显隐

> 2026-10-04 负责人确认：右上角 Search 与 Settings 之间增加列图标菜单；仅六个时间列，至少保留一列。本规格替代日历 D4 与 Later 规格中的「时间列固定显示」规则。

## 产品规则

- Hugeicons 三列按钮打开右对齐菜单：年、半年、3个月／本季度、本月、本周、今天。名称随日历模式和五语言切换；Later 保留独立左上角开关。菜单宽度按当前最长的周期名，加上固定空隙和勾号列，不随勾选变化。勾号在右侧同一列；选中不使用周期面板的深色行，悬停未锁定的行只铺浅底。
- 初次六列全部显示；勾选即时生效，菜单保持打开。最后一个已勾选项不可取消，其勾号置灰。悬停或键盘聚焦该行时，行左侧出现「至少显示一列」。方向键、Home／End 导航，Enter／Space 切换，Escape 关闭并返回按钮；外部点击或 Tab 离开关闭。
- 偏好保存在本机，不进入工作区、历史、备份或导出；Later 与时间列互不覆盖。无效／空配置恢复六列；本机存储不可写时当前会话继续可用。
- 隐藏不改变任务位置、状态、关联或流程。保持列挂载，保留草稿、滚动、完成折叠组及浏览周期；隐藏列不能聚焦、拖放或成为连线端点。
- 可见时间列重新等分时间区，Later 展开时等宽；共用 320px 最小宽度，窄窗口仅时间区横向滚动。显隐即时定位，不新增布局动画。
- 搜索可打开隐藏列详情，关闭后保持隐藏。明确的列内新建／定位先显示目标列，不把条目改放到其他尺度。

## 工程契约

- `useColumns` 提供 `setVisible(horizon: Horizon, visible: boolean)`，守住至少一列；新偏好 `goalloom.visiblePlanningColumns` 与原 Later 偏好 `goalloom.hiddenColumns` 独立。
- 菜单复用 Icon、Popover 和 picker 列表结构，并在列菜单上覆盖宽度、浅色选中态和悬停提示。使用 `menuitemcheckbox`、`aria-checked`、可保留焦点的 `aria-disabled`，以及悬停或键盘聚焦时才可见的 `tooltip`。
- App 打开带明确 horizon 的起草窗口时，先显示该目标列；右键下一步沿用真实起草与关联事务。普通搜索详情仍保持原显隐偏好。
- Board 的时间列保持挂载，隐藏列使用 `hidden`／`inert` 并禁用写入／拖放。BoardLayout 在隐藏前记录滚动并在重新显示后还原，按可见列数设置宽度。
- 所有已选未来周期继续读取；显隐不改变未来数据读取身份。现有几何、虚拟列表、反馈和关系线的 inert 边界继续生效；浮动 Popover 的锚点进入 inert 列时关闭弹层，键盘隐藏同样生效。

## 实现前失败场景

- Targeted draft regression (1.5 release): the removed detail shortcut leaves board next-step drafting able to create into a hidden horizon without showing it. Opening a composer with an explicit horizon must reveal that horizon; creation keeps its period and parent, while ordinary search/details preserve visibility preferences.
- 按钮缺失、位置错误、菜单包含 Later、模式名称／语言漏译；列菜单使用周期面板的固定宽度或深色选中行；勾号不在同一列；最后一列的提示在未悬停时一直显示，或悬停后不出现。
- 点击一项就关闭菜单、最后一列可隐藏、方向键／Space 冒泡触发看板动作、Escape／Tab 丢失焦点。
- Later 开关覆盖时间列选择、重启丢失选择、旧隐藏值意外恢复、无效或不可写的存储阻塞使用。
- 隐藏卸载列，丢失草稿、滚动或完成折叠；隐藏未来周期清空数据或重置选择；隐藏期间换期后误恢复旧周期的滚动位置。
- 隐藏任务仍能聚焦／投放／连线，或键盘隐藏后任务关系弹层仍可操作；搜索详情自动展开或把焦点交给隐藏内容；明确新建被改放到其他尺度。
- 隐藏后列宽仍按七列计算、首个可见列仍带左分隔线、窄窗口整体溢出；Later 动画被列显隐打断后留下变换。

## 验收

- [x] `pnpm test:columns`：真实 Electron、隔离工作区；报告、基线失败证据和截图位于 `output/tests/column-visibility/`。
- [x] 快速检查、构建及开发文档中的共享看板布局受影响功能 E2E。
- [ ] Windows 11 负责人手动验收；源码 Electron 验收不代表安装包验收。

[PROTOCOL]: Update this header when making changes, then check README.md.
