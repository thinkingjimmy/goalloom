# 流程洞察：断点、空列、复盘与右键菜单

> 顶部筛选不只是过滤：单流程筛选时在断链处给 ＋，一键补下一步；空列给一张起草卡；周期末在列头提供周/月复盘；待办右键菜单分组；设置 › 洞察可自定义起草与复盘的偏好。设计稿：Design 画布「目标聚焦 Insight 方案」（负责人 2026-09-27 确认）。

## 产品规则

### 断点 ＋（仅顶部筛选单个流程时）

- 「全部」视图不出 ＋；筛选某条流程时，本流程中「当前周期、未完成、未归档」的条目，若在当前周期没有任何活跃下级，在它右侧的列分隔线上出一个流程色 ＋（与行首行中线对齐，不压下一列内容）。只提示最近一级：本周还没有下级时，今天列不为它出 ＋。Later 与今天列条目不出 ＋；目标列整列为空时不出逐项 ＋，由空列卡代替。
- 跳级：本流程中直接挂在「本月」下的「今天」条目（跨过本周）按同一上级分组，在该月计划右侧的列分隔线上出一个橙色 ＋（跨列虚线本身不变）。
- 单击 ＋：由模型起草一条标题并直接创建，与普通待办无异，不二次确认、无 Toast；上级已关联，目标周期为下一列的当前周期；若当前周（或月）今天结束，则写入下一周期，＋ 变为「下周 · 标题 →」去向标记，点击跳转查看。
- 单击跳级 ＋：起草一个本周里程碑并在一个事务内创建，今天的这几项改挂到它下面（解除与月计划的直接关联），一次撤销完整还原。
- ⇧ 单击，或未连接可用的模型：打开全局新建窗口（⌘N），只预填上级与周期，其余与平常新建一致；跳级另预填「下级：今天 N 项」。
- 首次出现断点时给一次引导（第一个 ＋ 加重 + 说明卡），点「知道了」或点任一 ＋ 后不再出现；引导状态只存本机，可在设置 › 洞察「再看一次」。

### 空列

- 某一计划列在当前周期整列为空、且它的上一列有未完成条目时，列内显示一张卡：「本周还是空的」「为 N 项各起一步」「自己写」。不出逐项 ＋。
- 「为 N 项各起一步」打开新建窗口的多条草稿（最多 8 条），每条带上级，可取消勾选，↵ 一次写入；「自己写」打开只预填周期的新建窗口。新月份的本月列次按钮为「开始月复盘」。

### 复盘

- 周复盘入口在本周列头：本周最后一天出现「今天结束 · 复盘」，下一周第一天出现「上周复盘」；最后一天已复盘或点了「这周跳过」，次日不再出现（最多连续两天）。月复盘同理在本月列头。
- 周与月同一天结束时只出一个入口（本月列头「本周 + 本月 · 复盘」），步骤合并。
- 周复盘：回顾（模型小结 + 目标×周期矩阵）→ 本周收尾（今天冲刺 / 顺延下周 / 归档）→ 排下周（为断链起草，可改、可取消）→ 完成（抽屉内结果清单，列头标「已复盘」）。月复盘：回顾（3 个月目标进度）→ 本月收尾 → 排下月（每个 3 个月目标至少一项）。合并：回顾 → 收尾 → 排下月 → 排下周。
- 没有可用模型时：回顾无小结只留矩阵；排下周/下月为每条断链给空位，写了才创建。

### 右键菜单（CM2）

- 分组：「移到下周（日期）」「移到… ▸（接下来三个同尺度周期）」；「拆下一步」（有更短计划列时，与断点同一路径）「关联上级…」（打开详情的关联选择）；「完成」「删除」（有关联时先确认，移到回收站、可撤销）。不显示条目标题头。「选择日期…」未做。

### 设置 › 洞察

- 开关：断点 ＋、周复盘 · 月复盘；断点引导「再看一次」。
- 关于我（只存本机）、拆解「一步有多大」（最小一步 / 1 小时内 / 半天）与补充要求、复盘语气（直接 / 温和 / 提问式）与优先关注（断链 / 过载 / 跳级 / 模糊目标）、「试一试」即时生成（不写入）、查看完整提示词（系统规则只读，用户偏好以「用户偏好」追加）。

## 模型

- Jev（TypeSafe System One）只做选择/判断，不能写标题。起草与复盘小结走 OpenRouter chat completions，模型 `~deepseek/deepseek-flash-latest`，必须关闭推理（`reasoning.enabled: false`）并要求 JSON；复用「智能输入」里保存并同意的 OpenRouter Key，智能输入需对当前工作区启用。
- 断层 / 跳级 / 临期 / 过载等信号由代码计算，模型只负责措辞；提示词中文，用户偏好追加在末尾。
- 实测（2026-09-27，本机 key）：关推理后标题 0.8–2.6s、复盘 1.2–2s，偶发 10s；开推理时 9/12 空输出。

## 工程契约

- `src/domain/smart/insight.ts`：纯函数。`draftPrompt` / `reviewPrompt` 组装 system + user，`parseDraft` / `parseReview` 校验并清洗模型输出（标题去首尾标点、≤40 字、按任务 id 对齐），`gaps` 等信号计算供 renderer 与 prompt 共用。
- `src/main/smart/insight.ts`：`chatAdapter(fetch?)`，POST `https://openrouter.ai/api/v1/chat/completions`，超时 15s，错误复用 `classifyFailure('openrouter', …)`。
- `SmartInputService.handle` 新增 `draft` / `review` 动作（`smartActionSchema`），回复 `draft` / `review`（`smartReplySchema`）；门控 = 智能输入已对当前 generation 启用 + OpenRouter Key 已保存且同意；共享 429 冷却；不缓存、不落盘、不记录正文。
- `insertBetween` 命令：在一个事务内创建里程碑（挂在原上级下）、把指定下级改挂到里程碑、解除它们与原上级的边；周期规则与 DAG 校验复核；一次撤销。
- `createPlan` 条目可带 `period`（`current` / `date`），用于复盘写入下一周期。
- renderer：`state/insight.ts` 本机偏好（localStorage `goalloom.insight`），`features/insight/` 断点层、空列卡、复盘抽屉；新建窗口接受预填（上级、周期、草稿列表）。
- Draft and review mount effects share one pending request across StrictMode replay; each subscription ignores responses after its cleanup. Draft failures always end loading and leave editable rows with visible feedback. `pnpm dev` watches main/preload so generation actions and renderer callers remain on the same contract; previously started non-watching processes require a restart.

## 实现前失败场景

- 信号：未来/历史周期视图误出 ＋；已完成/归档/删除条目出 ＋；多父条目重复出 ＋；Later 参与；隐藏列导致 ＋ 落到错误列；虚拟行未挂载时锚点丢失。
- 写入：连点生成两条；生成期间版本变化（上级被编辑/删除）；周期在生成中翻过；跳级事务部分成功；撤销不完整或误删用户后续编辑。
- 模型：Key 缺失/未同意/智能关闭时仍请求；推理开启导致空输出；返回非 JSON、空标题、超长、重复同级、带 emoji；429 后连续请求；超时无反馈；workspace 替换后旧请求写入。
- 复盘：入口在第三天仍出现；跳过后次日仍出现；周月同日出两个入口；收尾写入已结束周期；排下周写入当前周期。
- 隐私：正文进入日志；关于我进入工作区/导出。
- Development regression: StrictMode replays mount effects, losing draft/review results or sending duplicate requests; a late response overwrites typed text or a reopened composer; failures leave loading active or hide the manual fallback; Settings generation changes workspace data; a renderer update calls an older main/preload contract when the development process is not watching those builds.

## TODO

- [x] M1 规格、`draft`/`review` 模型通道、提示词与解析、本机偏好
- [x] M2 断点 ＋、跳级 `insertBetween`、⇧ 预填新建、首次引导
- [x] M3 空列卡与批量起草
- [x] M4 右键菜单 CM2（「选择日期…」除外）
- [x] M5 周 / 月 / 合并复盘（合并与月复盘仅按规则实现，桌面脚本在复盘日才覆盖对应分支）
- [x] M6 设置 › 洞察
- [x] 五语言文案
- [ ] 月复盘与周月合并复盘的真实日期桌面验收（生产无测试时钟；需在月末当天运行 `pnpm test:insight`）
- [ ] Windows 11 人工验收由所有者执行

## 验收

- [x] `pnpm test:insight-generation`: development and production renderer lifecycle, seven-item drafting, manual edits, close/reopen isolation, visible failure fallback, Settings retry without writes and review completion; repeatable reports/screenshots under `output/tests/insight/generation/`.
- [x] `pnpm typecheck`、`pnpm test`（17 文件 / 120 例）。
- [x] `pnpm test:insight`（2026-09-27 周日，本周最后一天，macOS 26.4 arm64、Electron 44.4.4 源码运行）：空列卡批量/自己写、断点 ＋ 位置与一次性引导（重载后不再出现）、预填新建（最后一天写入下周并留去向标记）、跳级 insertBetween 与一次撤销、周复盘四步并排入下周、设置 › 洞察；报告与截图 `output/tests/insight/`。
- [x] `pnpm test:insight-live`（真实 OpenRouter）：批量起草 1.8s、断点单击直接创建 0.6s、复盘小结 1.8s；`output/tests/insight/live-report.json`。
- [x] 回归：`pnpm test:periods`（右键首项仍为顺延）、`pnpm test:composer`、`pnpm test:language`（设置 8 个面板无漏译）、`pnpm test:ui`、`pnpm test:feedback` 通过。
- [x] `pnpm test:relations`: relation and breakpoint overlays use distinct React keys; returning to all flows removes the old lines, and hover/focus previews and relationship editing pass.

[PROTOCOL]: Update this header when making changes, then check README.md.
