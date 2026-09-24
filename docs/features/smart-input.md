# Goalloom 智能输入需求文档

**版本：** Smart Input v1.4（功能规格，替代 v1.3）  
**日期：** 2026-09-23  
**只读代码基线：** `thinkingjimmy/goalloom@dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0`  
**交付范围：** 全局输入、Jev 双渠道、Onboarding、计划创建与同代次撤销、完整导出恢复及迁移前保护。  
**实施状态（2026-09-23）：** 代码与自动化已完成，见 §11 勾选与 §14 实施记录；两渠道真实 Key 联调（A02）、标注样例评估（T01）与双平台安装包验收（T02）待负责人执行。

## 0. 阅读与文档归属

**当前数据版本：schema v5。** 本文 v3 描述智能输入首次引入计划事务的历史里程碑；现行代码兼读 v1–v5，启动将 v1–v4 经保护备份后原子迁移到 v5，保留 v4 外观和 v5 复选框偏好。

本文是供产品、开发和评审共同使用的唯一功能规格，已按 D01 入库为 `docs/features/smart-input.md`。§1–4 为体验与业务规则，§5–10 为工程契约，§11–12 为任务和验收。

当前基线已在 `7f0fc66` 删除旧 PRD/TODO，但 README 和 AGENTS 仍引用它们，这是需要修复的仓库状态，不应把已删除文档当作当前文件，也不应恢复过时的任务勾选状态。[C9]

**按功能规格维护（D01 已完成）：** 本功能保留为这一份 `docs/features/smart-input.md`，AGENTS/README 的文档归属与入口已同步指向它；AGENTS 保留通用业务、安全、权限约束，去除了不存在的 PRD/TODO 链接，未恢复旧规范或旧勾选状态。本功能的产品/TODO/验收不再另建重复文件。

## 1. 目标、已定方向与范围

**写下想法，输入窗口直接变成可确认的行动预览。**

右下角「＋」及应用内 Cmd/Ctrl+N 打开全局输入窗口。已启用 Jev 时，原文直接作为 state，一次默认请求并行回答独立问题；代码计算具体值、组成预览，用户确认后写入。没有 Jev 时，普通保存一条 Later。

| 已确定的产品决定 | 实施要求 |
| --- | --- |
| 未配置或关闭 Jev → Later | 不增加离线分类器；不解析时间、不拆分、不自动关联；默认只创建一个 Later 条目 |
| Onboarding 可以配置 Jev | 保留可跳过的配置机会；不是必填 Key 才能进入产品 |
| TypeSafe 原生 + Vercel AI Gateway | 首发同时支持，分别使用自己的 Key，一次启用一个服务 |
| 原文直接交给 Jev | 不先用关键词/其他模型理解一次，不固定「先分类再填字段」两轮 |
| 预览可编辑、确认后才写入 | 不在输入或判断阶段修改条目、关系、历史 |
| 多父 DAG、单一主位置、现有流程 | 不为减少请求而把持久化或手动关联能力改为单父 |
| Electron / React / shadcn / Tailwind / Hugeicons | 复用当前桌面和极简看板，不移植 Next.js 或 localStorage 方案 |

包含：单任务、用户明确写出的清单与关联计划、时间与目标建议、手动设为新流程、双渠道配置、失败降级、整批事务、同代次撤销与整库数据恢复。

不包含：通用聊天、生成用户没有写出的执行步骤、自然语言修改/删除已有任务、任意 UI 代码生成、计算器/记账/投票、自动分配流程颜色。具体未来周期排期、时刻提醒、重复任务、进度汇总与云同步仍后置；整库恢复后撤销旧用户操作、给只读活动记录新增撤销入口也不属于本功能。

## 2. 入口与降级

| 入口/状态 | 行为 |
| --- | --- |
| 全局「＋」/Cmd/Ctrl+N，未配置/主动关闭 | 普通 composer；确认后单条 Later，不调用模型或本地语义识别 |
| 全局「＋」/Cmd/Ctrl+N，服务已启用 | 智能 composer；自动判断、可编辑预览、显式确认 |
| 已启用但调用失败 | 保留原文与手动修改；「重试」「先存到 Later」，不自动保存或换服务 |
| 列头「＋」 | 保留当前 QuickAdd：指定列、连续输入、加入/创建流程 |
| 条目详情「拆解下一步」 | 保留既有带上级的显式创建，不改接无上下文的全局入口 |

全局入口不隐式继承当前聚焦列、流程筛选或选中任务。普通模式不增加列/流程选择；需要这些能力时使用列头入口或保存后编辑。首次更新用可关闭提示说明：「全局＋用于收集或智能整理；列头＋仍在对应列快速录入。」这是本次已选择的入口调整，不称为无行为变化升级。

**键盘路径与已知代价：** 不增加普通 composer 的五列分段选择，也不把全局 Cmd/Ctrl+N 改回聚焦列。列头「＋」保持可聚焦的原生按钮，Enter/Space 启动对应列 QuickAdd，显示焦点与列名，并保留流程选择和连续输入。当前 Tab 顺序会经过前方列的任务行及其控件，到达「今天」列的路径长度随前面可聚焦任务与控件数量增长；可达不等于高效，也不能宣传为保留了原有一键效率。B02/V02 按空看板、小量任务和大量任务分别记录实际 Tab 步数，不用固定少量示例掩盖规模影响。[C5][C14]

**后置候选：聚焦列快速录入快捷键。** 将来可另定一个不与全局 Cmd/Ctrl+N、文本编辑或系统快捷键冲突的入口；本次仅记录候选，不指定键位、不增加实现任务，也不改变无 Jev 时单条 Later 的已定行为。

**普通保存/先存 Later：** 一次只存一个条目，标题取第一非空行且不超过500字符；长文本/多行原文完整保留在说明，保存前可编辑并展示。不因出现“今天”而改变位置，也不因换行拆成多项。智能草稿已手动修改时，先预览降级为单条的差异，确认前保留原草稿，不静默丢弃。

已有当前有效预览遇网络错误，可冻结为手动草稿后确认；没有有效预览时只允许普通 Later 或重试。主动关闭 Jev 后恢复普通模式，保留未保存输入并明确展示保存目标；不把旧智能结果继续当成在线判断。

## 3. Onboarding、设置与设备配置

### 3.1 新用户和已有用户

首次流程为：**写下三个月的方向 → 确认日历 → 可选启用 Jev → 看板**。三步共用同一外框：顶部显示进度与语言，底栏左侧为说明，按钮统一在右下。

1. **方向**：一句话写下接下来三个月最想推进的事，可点示例填入，也可「先跳过」。方向在日历确认前只是会话草稿，不写入工作区。
2. **日历**：一句话里三个可改的胶囊——时区、每周开始、「3个月」起点（今天 / 本月初 / 本季度初 / 自选日期，均不晚于工作区今天）；下方显示剩余天数与下一周期开始日，以及与真实看板相同列头和空状态的只读预览，方向以「待确认」行放进 3个月。「确认并开始」才锁定日历。确认成功后，方向作为普通条目创建在 3个月并设为流程根（独立、可撤销的操作）；创建失败不回滚日历，按常规错误提示处理。
3. **Jev（可选）**：先展示不调用服务的预设示例动画与「暂时跳过」「连接 Jev」；仅选择连接才展开服务和 Key 表单，「测试并启用」放在底栏右下。测试通过直接进入看板，不再额外试用；任何时候都可跳过。不强制注册、跳出购买或填写 Key，不改变日历确认及锁定语义。

连接表单包含 TypeSafe 原生/AI Gateway 单选、密码输入框、只读模型说明、官方密钥入口、数据接收方与费用说明、默认未勾选的发送同意，以及「测试并启用」。Gateway 只需 Gateway Key，不要求 TypeSafe Key 或部署 Vercel 网站。[R3][R4]

测试使用固定非私人样例，真实完成一次判断并验证响应 schema；Key 字符串长度、模型列表和示例动画都不等于调用成功。**认证、账户验证、权限、额度、限流与语义质量分别反馈**，题目答错不能提示 Key 无效。若服务返回 `customer_verification_required`，显示「AI Gateway 账户需要完成验证，请到该账户的官方控制台查看要求」，保留凭据，不将所有403都归为无效Key。只有供应商明确要求付款方式时才提示到官方页面处理，Goalloom不收集银行卡资料、不代替用户购买额度。429或明确的rate-limit错误进入限流状态，不自动擦除Key。

账户验证要求和限流额度以实际账户及响应为准；不把第三方测试的免费档速率或某次促销截止日期写成长期产品承诺。连接失败始终可跳过；验证通过前不把服务标为已成功启用。具体错误归类和脱敏见§7.1。

示例动画只是预设演示，不生成任务。已有用户升级时默认关闭，从「设置 → 智能输入」启用；普通 composer 可以显示一次可关闭的设置入口，但不拦截录入，不反复要求配置。

### 3.2 配置变更与暂停

设置提供开关、服务、Key 更换/删除、测试、连接状态、隐私与私测提示。两服务可各存凭据，一次只选一个。新凭据/服务测试并保存成功前，旧可用配置保持不变；一个服务的 Key 不发送给另一服务。

设备侧配置至少包含 `activeProvider`、每服务 `credentialRef`、`providerRevision`、`enabledForGeneration`。只有凭据可用、已同意、`enabledForGeneration === workspace.generation` 才自动发送。关闭设为空；整库恢复/重置产生新 generation，自动失配并暂停智能发送，重新启用时显式绑定当前 generation。**这项开关不进入 workspace 表、任务导出或数据库迁移，也不改变自动顺延的 pausedAfterRestore。**

Key/服务更换取消旧请求、保留手动草稿并使建议过期。连接测试受配置修订保护，后发的关闭/删除/更换优先于旧测试回执。跨服务切换后已有输入需用户明确重新发送，不悄悄转发给新处理方；尚未启用时输入的普通草稿同理。后续新输入按已同意的配置自动判断，不增加每次都必点的“识别”按钮。

## 4. 预览、时间与流程

### 4.1 稳定输入、三种预览

居中弹窗包含固定多行输入、动态预览、服务状态及确认按钮；不更换输入控件或抢光标，保存后仍是当前单行任务。预览为单任务、任务清单、关联计划；仅属布局，不增加持久化任务类型。

示例：「今天优化登录页，周五前完成，关联『官网改版』」为单任务、今天位置、明确截止日、候选上级；「本月发布内测版；本周完成登录功能；今天写文案」可显示三个草稿和可调整关系。不同时间尺度本身不等于父子关系，缺证据时不自动连结。

Enter 换行，Cmd/Ctrl+Enter 确认当前按钮；IME 组合输入不提交/不启动新云请求。列内原 Enter 创建不变。手动字段和手动结构优先，后续判断不能覆盖；原文大改后无法映射时保留手动内容并提示整理。候选结果与输入、手动修订、上下文均匹配时才可用。

关闭未保存内容可保留当前会话草稿或放弃；退出提醒未保存，整库替换清理旧草稿。保存失败不清输入、不关闭窗口。保存成功只清理已提交的输入修订；保存期间及随后的权威快照刷新期间新输入的文字继续保留。迟到判断只处理当前修订，不重新添加已手动移除的草稿；保留已选上级、待确认上级建议及当前候选的身份和版本。模型的选项分布不足以形成明确建议时，展示选择或保留普通输入；确定性校验通过仍必须由用户确认。

### 4.2 时间语义

| 表达 | 行为 |
| --- | --- |
| 今天/本周/本月/当前这一轮做 | Choice 建议当前对应列，展示实际范围 |
| 周五前完成/截止某日 | 作为 dueDate，不能反推执行列 |
| 无执行时间 | unspecified → 明示「暂不安排 · Later」 |
| 明天做/下周做/某时提醒/每天重复 | 明示未支持部分并保留原文，手动决定；不改成今天或假装建立提醒 |
| 完成登录页/删除按钮样式 | 新任务内容，不操作已有实体 |

日期按本次固定 referenceTime、工作区 IANA 时区和现有日历代码计算；不是按服务的“今天”或宿主机器另一个时区。`weekStart` 使用 ISO 星期1–7：先求包含参考日的工作区周起日 W，“本周五”是 `W + ((5 - weekStart + 7) % 7)` 个日历日。例如周六开周时，周三所指的本周五是两天后；本周已过去的星期不自动换成下周。单独“周五”才取不早于参考日的最近周五。所有解释展示绝对日期；歧义/缺年份/是否包含当天不确定时可修正。

预览保存 horizon、具体 periodId 和日期。提交复核仍属于当前周期；跨日/周/月后刷新预览再确认，不静默调期。不能可靠提取日期或标题元信息时保留原句；不得吞掉否定词、说明或用户未同意删除的内容。

### 4.3 上级与手动新流程

新项可有多个已有/本批上级。同名目标显示位置和状态；已归档候选可显式选择并标记，不解除归档；已删除不可选。未选中的流程筛选不自动成为上级。

每个无上级的新草稿提供可选的 **「设为新流程」**。用户手动选择0–7中未占用的颜色，默认不勾选；Jev 不创建颜色或主动改变此选择。有任何上级的草稿不能同时是有色根：需用户明确移除上级后再设色，不能为设色自动删关系。给已设色根增加上级前，同样要求先明确移除其颜色。

每个未删除有色根独占一色，归档根仍占用，所以最多8个；草稿中新申请的颜色也需相互排斥，提交事务再次检查。无空闲色时可不设色保存，或由用户在现有入口管理流程，不抢占旧颜色。不设色的任务仍在全部看板可见，只没有独立的顶栏流程快捷筛选。[C5]

有色父根可拥有多个新下级；它们沿现有 DAG 推导流程颜色。批量计划可包含多个合法有色根，必须满足全局8色与无上级约束。该手动控制只属于智能/手动调整后的结构化预览，不改变普通模式固定单条 Later。

## 5. Jev 判断设计与明确预算

### 5.1 默认一轮，无前置语义分类器

```text
原始输入 + 工作区日期 + 有限原文片段/日期/目标候选
                         ↓
             一次 Jev 请求，并行判断独立问题
                         ↓
          代码复制原文、计算日期、校验并更新预览
                         ↓
                   用户确认 → worker事务
```

「＋」已表示创建，不再先识别创建/修改/删除。原文直接作为 state；辅助代码可枚举无损片段、日期值或读取候选，但不先断定它们的业务意图。每题 instructions 明确引用 state 的字段和假设，同轮问题互相看不到答案；已知候选的问题可同轮询问，代码只消费实际适用分支。[R1][R2]

Choice 用于布局、位置、片段角色、日期用途等单选；Noul 用于**每一对上级→下级关系**的独立判断。Choice 的次高概率不是额外上级。Score 非首版必需，不能拿来生成任意数量任务或日期。两渠道的UI与判断策略只依赖统一的概率数据，不读取供应商独立的 `confidence`。TypeSafe 原生会返回该字段，而Gateway evaluation的Choice答案不以它为契约；不能补造一个同名字段。[R1][R7]

**统一判断指标：** 对有效Choice分布在代码中计算最大选项概率、前两名差值和归一化熵集中度，算法见§6.1。这些是分布描述，不是正确率，也不宣称等于TypeSafe的confidence公式。Noul/boolean保留“是”的概率，接近0.5表示是非难分。按字段、问题版本和渠道分别评估阈值；低支持或缺分布只影响相关字段，不让无关分支阻断整个草稿。

多事项默认用换行、分号、明确列表标记形成可保留原文的候选槽位，逗号仅为弱边界。所有片段保留“不独立/修饰/不明确”解释；“整理反馈，周五前完成”不能多出一条伪任务。标题复制原文或用户修改，不生成新步骤。

### 5.2 预算不靠单父化解决

**应用预算为一次输入修订累计最多64题（包括可选补充请求），不是每个片段64题，也不是服务商上限。** 默认最多8个候选槽位、8个任务、8个自动日期候选。超出核心解析能力时提示分批或手动整理，保留全部原文，不能静默删句。

设 S 为槽位数（单任务 S=1），D 为日期候选数：

| 问题组 | 题数 | 定义 |
| --- | --- | --- |
| 全局布局 | 1 | single/list/plan/unclear，与其他题同轮 |
| 每槽位角色、执行列、截止候选选择 | 3S | 截止选择从原文日期候选及none/unclear选一项；题目自含上下文，候选槽位尚非已确定事项 |
| 每日期候选用途 | D | deadline/execution/other/unclear，覆盖日期被错误拿作截止的情况 |
| 三类未支持要求 | 3 | 提醒、重复、具体时刻；作为各自警示，不吞掉可保存的任务 |
| 上级关系对 | R | 逐对Noul，包括已有目标与本批条目；只问剩余预算允许的对 |

**总数 `Q = 1 + 3S + D + 3 + R ≤ 64`。** 最大 S=8、D=8 时，核心36题，关系最多28题。8项×8个已有候选再加本批56个有向对，一共需156题，不能全问。即使把本批关系压成8道单父Choice，也仍要108题，且会改变多父语义；首版不采用这种替代。

**分配顺序：** 先完整保留核心题；已由用户明确选定的边无需再问；关系按原文明确点名的候选对优先，再按条目轮转分配给已有候选和本批候选，避免前几项耗光预算。候选发现可以使用原文引用、用户选择和位置索引，不先做另一套语义分类。预算耗尽的边返回 `not_evaluated`，不能记为false或“无关联”；预览显示“部分关系未自动评估，可手动补充”，所有合法的多父关系仍可手动建立。

“最多8个流程根”只约束非删除有色根，不限制普通目标总量。允许集合小、正文预算够时，所有可用根可以同时放入上下文；但**放入上下文不等于已向每个任务评估该根**。非流程目标按显式引用/用户搜索加入有限候选，不发送全库，不强制取前六个。

### 5.3 补充请求与覆盖

常规单任务、已知片段/候选只请求一次。仅当第一轮确定新分组、确实需要新状态才能定义后续问题时，可追加一次具名补充请求；记录原因并继续受累计64题约束。预算耗尽不为“问完所有关系”自动拆更多请求，改为手动确认。每轮实际问题清单由调度器先计算、校验再发送。补充轮同样检查序列化 payload/token 预算并预留供应商封装空间，裁剪的关系标为未评估。

工程默认：原文4,000字符、题目64、每道Choice不超过32个选项（含兜底）、序列化请求64 KiB以内，并设置24,000估算输入token的安全预算。总payload包括state、questions、criteria；字节数/题数不能替代token测算，接入测试须验证所选服务的实际计量方式与限制，预算估算无法可靠覆盖时降低payload或要求缩短，不保证“64题必定能塞下”。模型目录和当前协议限额是A01/A02复核项，不把任何“32K”宣传直接当成32K原文或所有问题无限扇出的保证。adapter按§6.1读取实际 `usage`，输入token估算仅供发送前预算，实际值缺失时记null而非0；统计不回传任务正文。[R5][R7]

成本/大小超限的裁剪顺序为：移除未被任何题使用的候选摘要→减少低优先级关系题及对应候选→提示分批/手动整理。不能截断原文、删核心事项或把被裁掉的关系当作模型否定。

## 6. 双渠道配置与响应适配

### 6.1 本版确定的调用路径与统一答案

语义问题定义只有一份，两个小型adapter转换各自请求/响应；不为统一接口假设供应商字段相同。

| 配置 | TypeSafe 原生 | Vercel AI Gateway |
| --- | --- | --- |
| 凭据 | TypeSafe API Key | AI Gateway API Key |
| 协议 | `@typesafe-ai/sdk` 的 systemOne | HTTPS `POST /v1/evaluate` |
| 固定地址 | `https://api.typesafe.ai` | `https://ai-gateway.vercel.sh/v1/evaluate` |
| 显式requestedModel | `jev-latest` | `typesafe-ai/jev` |
| Choice数据 | `choice`、`probabilities`；原生额外confidence不进入统一业务答案 | `choice`、`probabilities`；不读取或要求confidence |
| 是非数据 | `noul`概率 | `probability`概率，问题类型为boolean |
| 输入用量 | `usage.input_tokens` | `usage.inputTokens` |
| 模型元数据 | 响应model | 文档定义的routing元数据中的canonicalSlug；不是模型发布版本 |

provider、protocol、endpoint和requestedModel是应用预设，不允许用户任填，不跨服务复用Key，不改成chat/completions。兼容路径地位见§6.2。[R1][R3][R7]

```ts
export const JEV_PROVIDERS = {
  typesafe: {
    protocol: 'typesafe-system-one',
    baseURL: 'https://api.typesafe.ai',
    model: 'jev-latest',
  },
  'vercel-gateway': {
    protocol: 'gateway-evaluate',
    endpoint: 'https://ai-gateway.vercel.sh/v1/evaluate',
    model: 'typesafe-ai/jev',
    providerOptions: { gateway: { only: ['typesafe-ai'] } },
  },
} as const;
```

原生SDK显式设置apiKey、defaultModel、`retry: { maxRetries: 0 }`、8秒timeout和`logLevel: 'off'`，调用 `systemOne(request, { signal })`。Gateway使用同样取消/截止和日志规则，将内部Noul映射为boolean。示例是配置形状，不包含真实凭据，也不代表已通过两渠道网络测试。

**统一答案契约：** Choice保留 `choice: string` 和供应商原值 `probabilities: Record<string, number> | null`，boolean保留 `probability: number`；均无跨渠道 `confidence` 字段。核对question ID、choice属于请求选项、概率均为有限0–1值、分布键恰好覆盖请求选项；缺失分布记null，相关指标为null、建议待确认，不把选中项补成概率1。非法数值或缺/多选项不能通过归一化补救。[R7]

**概率和按实际精度校验，不用固定总容差。** K是本题请求选项数（含none/unclear，本应用2–32），d是本响应有效的十进制概率舍入位数。按最近舍入至d位的契约，每项误差界为 `e = 0.5 × 10^(-d)`；总和S的允许偏差为 `τ_sum = K × e + ε`，其中 `ε = 1e-6` 仅用于数值误差。先验证 `abs(S - 1) ≤ τ_sum`，再使用分布。K=32、d=2时舍入误差预算是0.16（总容差0.160001）；不能把这一宽度用于d=3或未知精度。这里的“半个最小单位”依赖最近舍入假设，不能拿去兼容未知截断/裁剪算法。[R11]

**精度来源与缺省：** 优先使用所选HTTP协议实际返回并验证的 `rounding.probabilityDecimals`；仅接受0–15的整数，不能由用户输入设定或从JSON数字显示的小数位反推。没有响应声明时，只可采用绑定provider/protocol/model兼容范围的已核实adapter默认；记录来源为response或adapter。官方TypeSafe适配器对其当前API声明d=2，可作为原生通道核查依据，不证明所有Gateway响应永远都是两位小数。[R12] 两者均无可信依据时使用ε作严格和检查；若超出ε，只标记分布精度未确认、禁用依赖分布的自动预填并允许手动选择，不猜d、不误报Key失效。元数据非法或与锁定协议冲突时标记响应契约错误。`probabilityDecimals`是输出精度声明，不自行向HTTP请求添加未定义的舍入参数。

**选项一致性与原值保留：** 总和误差预算不能用来容忍选错标签。与官方验证器一致，`choice`在返回分布中的值必须满足 `max(p) - p[choice] ≤ ε`；同一最近舍入函数可造成并列，不应把较小值说成最大值。保留供应商原分布及舍入来源，不原地重写。总和S大于0且分布已校验时，才以副本 `q_i = p_i / S` 计算下面的熵指标；不会据此声称恢复了舍入前的真实概率。全零等无可用概率信息的分布不归一化、不生成确定指标；原choice仍可作为未确认建议。[R11]

对通过上述校验、总和大于0的原分布p及归一化副本q，本地计算：

- `topProbability = max(p)`，`margin = p第一名 - p第二名`，均基于保留的供应商舍入值；并列时margin为0，不任意宣称唯一确定。
- `concentration = 1 - H(q) / ln(K)`，其中 `H(q) = -Σ q_i ln(q_i)`，`0 ln 0`记为0；仅为浮点误差夹到[0,1]。这是从舍入后分布派生的近似指标，不是供应商confidence或精确的舍入前熵。
- 同时传递effectiveProbabilityDecimals/precisionSource给判断策略；临界阈值落在相应舍入误差范围内时转待确认，不把两位小数当无限精度。不要用K项总和容差衡量单个选项或margin的不确定性。
- 不按单一concentration自动建立关系或写库；候选数量/含义不同不可直接视为同一准确率，按具体字段评估topProbability、margin及兜底选项。多父仍使用独立是非概率。

**元数据单独保存于受限诊断结果，不混进任务字段：** `requestedModel`、`routingCanonicalSlug`、明确返回时才有的 `modelVersion`、`inputTokens`、requestId和请求耗时。Gateway按选定HTTP协议固定解析 `usage.inputTokens` 与routing的canonicalSlug；A01以官方HTTP样例/实际响应冻结完整嵌套路径，不假设routing必在根部，也不把SDK封装的 `response.modelId`当成服务实际回传。若canonicalSlug为 `typesafe-ai/jev`，它只证明规范化标识，不能伪装成具体版本。字段缺失记null/“未提供”；元数据缺失不使一个合法业务判断变成Key无效。[R7]

A02/V30覆盖K与d变化、分布缺失、精度缺失/非法、零和、合法舍入误差、真正超限、未知选项及choice不为最大值；同一p在不同声明精度下可有不同合法性。覆盖用量缺失及routing形状，固定样例只留受限诊断字段，不保存请求正文、Key或任意供应商元数据。

### 6.2 TypeSafe 兼容入口的地位

Vercel官方另提供 `https://ai-gateway.vercel.sh/typesafe`，示例仅改变Key/baseURL，保留systemOne/noul及响应形状。因此不能断言v1.1使用SDK默认别名必然失败；但这也不是所有别名组合永久兼容的保证。[R3]

该路径作为未来可替换Gateway adapter的工程选项，不作为第三服务，不在本版同时维护。若团队决定采用它，先在固定SDK版本与所选model下验证实际请求/响应，更新provider配置与测试；不得把原生evaluation的模型约定未经验证搬到兼容路由。首发支持Gateway的承诺不后置。

## 7. 进程、请求与凭据

### 7.1 与SQLite串行队列隔离

**Jev client、连接测试、重试和HTTP等待在main进程独立异步服务/IPC通道中，不进入 `src/main/storage/worker.ts` 的串行RPC队列。** 当前worker以Promise队列逐个等待handle完成；把await fetch放进去，即使HTTP异步也会阻塞后续所有存储RPC。[C3]

需要读取目标或日历时只发短只读RPC，取得快照即释放队列，再调用云端；HTTP期间不持有SQLite事务、SAVEPOINT或全局写锁。renderer分别维护 `analysisPending` 与现有 `workspaceBusy`，前者不能让全应用误显示“保存中”或禁用正常数据库操作。`createPlan` 只在用户确认后走现有worker→Repository事务。

默认防抖600ms；同一草稿只保留一条有效请求链，IME期间不启动。请求携带requestId、draftSessionId、inputRevision、manualRevision、generation、providerRevision、contextRevision和referenceTime。新增文本、服务切换、关闭或整库替换使旧结果失效；已手动修改字段不能被过期结果覆盖。关闭只取消本应用使用结果，不承诺供应商未收到内容/未计费。

错误由adapter按供应商明确的错误type/code与HTTP状态共同分类，先匹配具体账户/额度/限流原因，再处理一般认证或权限；不只按403或429猜原因，不向用户回显可能含输入的原始body。

| 归一化状态 | 触发依据与动作 |
| --- | --- |
| account_verification_required | 明确的`customer_verification_required`或同义官方错误；提示官方账户验证，保留Key，无自动重试 |
| rate_limited | 429或明确rate-limit类型；尊重Retry-After，无该头时使用应用冷却；冷却内新按键不立即重发 |
| quota_exhausted | 明确余额/额度错误；提示检查账户，不与瞬时限流混用、不自动充值 |
| authentication_failed / permission_denied | 真正认证/权限错误；修改Key或权限，不把账户验证误归此类 |
| unavailable / malformed_response | 断网、超时、5xx、非法答案；保留草稿，可重试或先存Later |
| uncertain | 合法答案但概率支持不足；手动确认，不作为连接故障 |

默认无Retry-After的限流冷却为30秒（应用参数，不是供应商配额）。403带账户验证类型优先归账户验证；429带明确额度类型优先归额度；未知4xx提示未能调用并给出脱敏状态，不擅自断言Key失效。只打开预设官方控制台链接，不跟随错误body里的任意URL。无跨服务自动容灾。相同有效修订缓存仅限当前会话，包含上下文/问题/模型/服务配置，以及候选身份、版本、位置、颜色和预览周期；generation 变化清空。缓存上限为32项、序列化结果合计512 KiB，不能驱逐用户手改草稿或会话撤销。重试识别不改变数据库命令幂等ID。

### 7.2 最小发送与设备凭据

只发送当前原文、必要工作区日期、保留原文的候选片段、被允许的目标标题/状态/位置及临时候选ID；不附目标完整说明，不发送历史、回收站、文件或整库。候选标题也属私人信息，配置时明确同意处理方：TypeSafe路径由TypeSafe处理；Gateway先由Vercel再路由Jev。仅智能窗口和用户触发的连接测试能调用。

**Gateway路由限制：** 正式HTTP请求包含 `providerOptions.gateway.only: ['typesafe-ai']`，不用order冒充排他限制。A02用固定样例确认本版evaluation协议接收该字段并遵守限制；明确的unsupported警告、返回路由不在允许集合或该配置被拒绝时，报告路由策略错误，不静默删字段重试。可见routing元数据缺失时记录未提供，不宣称已从该响应额外验证实际提供方。[R8]

**零保留不默认承诺：** 本版不发送 `zeroDataRetention`，不提供“已开启零保留”的文案；模型目录未明确声明支持不等于已证明不支持。A02可用固定非私人样例验证选项的协议接受情况，但HTTP 200也不是合同保留政策的证明。只有官方能力/处理方政策与真实调用均核实、另行确认该需求后才启用；一旦明确要求ZDR，失败时不得移除约束降级继续发送。[R5][R8]

Key由main的OS保护凭据层加密保存，不进入业务SQLite、localStorage、应用导出/数据库备份或Git；renderer粘贴后经有限IPC提交并清空，后续只读遮罩。禁SDK/HTTP正文、Authorization、完整响应日志；固定HTTPS、校验证书，不给renderer通用fetch代理或任意endpoint。

**macOS私测已知风险：** 当前README说明包未签名/未公证；unsigned或ad-hoc构建可能因系统无法稳定识别应用身份，在更新后再次请求Keychain权限或无法使用原加密凭据。不是断言每次升级都会丢Key，也不能承诺“改成ad-hoc就解决”。[C9][R6]

拒绝授权、暂时无法读取和损坏/失效凭据需区分提示；保留加密文件、允许重试/重新授权，确实不可用再重填。禁止自动明文回退，不能把OS权限错误误报为远端401。私测连接页提示升级可能需重新授权或填写；正式分发前使用有效且一致的签名身份，实际跨版本验证，未获授权不代用户购买签名服务。Windows按实际DPAPI边界测试。记录所有结果，不以开发模式能加密证明升级可靠。[R6]

## 8. createPlan、效果和回执

### 8.1 最小命令扩展

保留 `create`、`link`、普通UndoSession；新增受限 `createPlan` 接受1–8个新项及已有/本批上级引用。每项包含稳定draftId、title/description、dueDate、horizon、previewPeriodId、parentRefs，以及仅用户手选时非空的flowColor。

`parentRefs`使用以下可判别形式；既有上级必须携带预览确认时的版本，不能因缺失而补成提交时最新版本。[C10]

```ts
type ParentRef =
  | { kind: 'existing'; itemId: string; expectedVersion: number }
  | { kind: 'draft'; draftId: string };
```

`expectedVersion`必须是正整数；同一既有itemId若被多个新项引用，提交包中的expectedVersion须一致。worker在任何本批写入/touch前，对去重后的既有端点统一复核一次版本、状态与关系约束，再在同事务写入；不得创建第一个子项后因自身touch递增父版本而把第二个子项误判为过期。事务开始前的真实外部变化仍返回stale，要求刷新预览/重新确认；本批draft引用只校验ID、图及拓扑，不伪造expectedVersion。

提交包包含既有 `operationId`、`generation`，以及明确的草稿/日期依据。main重新校验已配置工作区、日期仍有效、标题/大小、端点存在、归档标记、DAG无环、颜色0–7/互斥/有色根无上级；只允许新增边的下级属于本批，不改既有条目状态/计划/颜色/旧关系。已有端点被触碰时可按现有实现增加内部version/updatedAt，这不算替用户编辑其业务内容。

调用既有 `Repository.execute` 的请求hash/回执与事务，不在renderer循环create/link充当原子创建。同一确认冻结同一命令对象、operationId和draftId；失败未知时查原回执/重试，不重新生成IDs或改变数组顺序。新数据库ID只在首次成功处理内生成。已有请求hash语义保持不变。[C4]

### 8.2 每项一个create效果，按拓扑序

1. 校验整批图并稳定拓扑排序：父在子前，同级用原草稿顺序。每个新项只记录一个已有的 `kind: 'create'` 效果；`effectsVersion`仍为1，不新增一组同项create+relations效果。
2. 新建的每条边只属于**下级的 `initialRelations`**。无论上级是既有还是本批，都不能同时重复归给父效果。创建下级时上级已存在，在同事务建立新项/位置/入边和created事件。
3. 所有效果与created事件均覆盖同一组唯一新item IDs，effect数组按拓扑序。事件index和全局seq按实际写入连续保存，不混同effectIndex与逆向执行顺序。
4. 任一步失败整批回滚，包括items、placements、relations、events、receipt及颜色占用；所有新项初始todo，Jev不控制done状态。

示例 `A→B、A→C、B→D、C→D`：A效果入边为空，B含AB，C含AC，D含BD/CD；effects为[A,B,C,D]，撤销为[D,C,B,A]。D先失效BD/CD，父B/C被撤销时只剩各自初始入边，能够复用现有create依赖检查。[C2]

**不得先把全部create效果对同一未变化图独立校验后拒绝父项。** 用现有SAVEPOINT在逆拓扑顺序逐步检查/逆转；后续遇冲突回滚整步。若采用预演，则须模拟相同的逐步图变化。额外外部下级或后续业务变化仍能阻断整个计划撤销。

### 8.3 itemIds与反馈的兼容契约

当前resultSchema、Repository/Context、App还原按钮均只有单个itemId，需一起扩展。[C1][C4][C7]

- 为新计划系列回执增加 `itemIds?: string[]`（长度不超过8、唯一、有序）；现有非计划操作可不写该字段，不改写旧操作JSON。
- 成功createPlan的itemIds必须等于拓扑effects的itemId序列；N=1时itemId取该值，N>1时itemId为null。成功撤销计划返回同一组itemIds、originalOperationId与本次公共删除来源restoreSource；计划撤销冲突时itemIds为空数组、itemId/restoreSource为空，避免残留中间结果产生还原入口。
- 读取旧回执使用兼容展示函数；**不能把旧rollover/arrangeBacklog的单个itemId当作完整批次**，继续使用其现有批次查询。不得为迁移在旧历史中补造多个效果或IDs。
- UndoSession仍一operation一栈项，不按itemIds拆成多步。`use-workspace`和App显示“已创建/已撤销N个事项”；单项沿用定向还原，多项只提供“查看回收站”，不能只还原数组第一项却提示全部成功。
- preload、runtime、query receipt、失败重试、transfer中的operation.result和相关测试统一读取新回执；TypeScript编译通过不是恢复链路已通过。

### 8.4 撤销与逐项还原

用户计划采用整体撤销；原操作效果不改写，逆操作仍无新的可撤销effects，按原effectIndex记录每个undo_effects标记，反向事件分别指向同一原operation且每个item恰有一个原效果。撤销任一项有依赖冲突时SAVEPOINT回滚全部，不使用自动顺延的部分跳过策略。

反向事件before/after记录真实事务状态，保留无关最新文字；旧周期todo的hold、版本增长、颜色释放继续复用既有规则。全部新项的deletedBy和失效边invalidatedBy使用本次统一逆操作ID，reason为delete，不冒充主动unlink。

`lifecycle.ts`已经按删除来源找回关系；先还原父或先还原子时，被另一端仍删除所阻止的边保留原失效来源，后还原的端点再尝试恢复。复用该逻辑，并增加同批多父、两种顺序及颜色被占用的回归，不新建另一套还原机制。[C6]

整批撤销后逐项还原按现有回收站规则，非法边提示不覆盖，颜色被新流程占用则遵守原还原规则。此能力不等于通用redo或保证所有关系无条件恢复。

**整库恢复后统一失效：** createPlan与其他用户操作遵循相同代次规则。`undoOperation`继续要求当前命令代次与当前工作区一致，且原用户operation.generation等于命令generation；整库恢复/重置成功清空会话撤销栈和旧Toast，不重建旧栈、不改写历史operation代次，也不给只读Activity新增撤销入口。以新代次向旧createPlan发undo也应拒绝，不能只为计划建立例外。旧回执的undoable表示原操作当时的性质，不代表恢复后仍有当前撤销权限，UI不能仅按该字段显示可执行按钮。[C2][C8]

导出/恢复仍必须保留旧计划、created/undo历史、marker、回执和关系；“能恢复数据”不等于“恢复后仍能撤销恢复前的用户操作”。恢复前已经发生的合法撤销事件可以被完整导入；恢复后的普通编辑/移动/回收站还原是当前代次新操作，可按既有规则使用。系统rollover的undoBatch沿用现有独立规则，本功能不扩大或缩小它的跨代次行为。[C12]

## 9. 导出、导入校验与版本迁移必须同时交付

现有导入器的operation白名单/created类型映射没有createPlan，且普通操作至多一个effect；直接只加创建命令会产生无法恢复的数据。[C1][C8]

### 9.1 有限扩展，不整体放松验证

| 位置 | 必须增加的规则 |
| --- | --- |
| validateKind | 新增createPlan→create；source=user；成功时1–8个且每项唯一；只对createPlan增加多效果例外，其余普通操作限制保持 |
| validateEvent | created允许createPlan；每个新项一个created且before=null，created与effects逐项对应，无额外事件/漏项 |
| validateEffect | createPlan的initialRelations只能为该效果新项的入边，边归属唯一；父为已有项或更早的新项，完整DAG和颜色约束保留 |
| validateImport的result检查 | itemIds唯一、真实、顺序/数量与计划effects相符；scalar itemId遵守单/多项规则；旧无数组回执仍可读取 |
| 逆操作与undo_effects | 保留“每反向event对应本item唯一原效果”，无需删除该检查；计划只能由整体undo逆转，成功必须覆盖全部原效果，不允许伪造部分成功或只写部分marker |
| 原始业务链 | 继续校验真实before/after、seq、时间、版本增长、末尾实体一致、关系来源；不为新功能跳过旧安全检查 |

计划边的createdAt、关联身份、无重复归属和对应源操作须检查；当前有效边可能在后续已被解除/删除，导入不能要求历史initialRelations中的边如今仍有效。逻辑验证应分“创建时的归属”和“当前合法图”，不混成一项。

### 9.2 v1/v2兼容与v3标识

**本功能把数据集语义版本升级到3，原因是createPlan及多ID回执，不是Jev开关或Key。** 新读取器支持旧v1/v2与新v3；旧格式按原约束验证，新格式增加计划例外。旧操作ID、requestHash、事件和回执保持原值；需要兼容字段时用非破坏的读取层，不重写过去的回执。

当前exportDataset依赖storage/schema的版本常量，SQLite读取也检查user_version；须协调 `storage/schema.ts`、`transfer/dataset.ts`、备份读取与datasetSchema，把本地兼容版本标识提升到3。即使无需新业务表，也不能仍标成旧版本并静默允许降级读取。[C8]

**迁移前调用顺序是新增工作，备份机制直接复用。** 当前worker仍是openDatabase→migrate→Repository→WorkspaceService，尚未执行迁移前保护；但 `BackupManager` 仅依赖SQLite连接和固定备份目录，可提前构造。`create(kind, workspace, now)`接收调用方传入的workspace，而非自行创建Repository；现有 `Store.workspace()` 的读取只涉及v1/v2共有字段。P05应调整启动编排并用v1/v2夹具验证这条依赖，不新建备份引擎、第二个备份目录或新回执格式。[C11][C13]

启动顺序固定为：

1. **只读探测。** 获取既有单实例/启动维护控制，尚不接受业务RPC、reconcile或云端草稿。对已经存在的文件用 `new DatabaseSync(path, { readOnly: true, allowExtension: false })` 读取真实user_version与schema身份；不能调用会设置journal_mode=WAL的 `openDatabase` 作探测，也不执行DDL、checkpoint或改变持久化PRAGMA。文件不存在才走新建分支；权限错误、损坏或只读打开失败不能当成新库覆盖。支持的新空库才初始化v3，未知/更高版本或非空未知schema拒绝。这里只承诺不主动改源schema/日记模式，不把只读连接描述成所有操作系统元信息和WAL/SHM状态都绝不变化。[C8][C11][R10]
2. **读取旧工作区。** 确认源为支持的v1/v2及必需表/工作区记录完整后，从同一只读连接读取并校验workspace；可复用 `new Store(sourceDb).workspace()`，不调用items、写入或依赖新schema的业务方法。已有旧schema即使任务为0、仅有配置/历史/回收站也须保护；源记录损坏时停止，不编造空workspace喂给备份器。版本已为当前v3则无需迁移保护，按正常启动；尚无workspace表的新库不能提前调用BackupManager.create。[C13]
3. **复用protective副本。** 对需升级库执行 `const backups = new BackupManager(sourceDb, existingBackupDirectory)`，再 `const record = await backups.create('protective', sourceWorkspace, now)`、`await backups.verify(record)`。直接沿用现有 `{id}.sqlite` / `{id}.json`、`backupRecordSchema`、consistentBackup、哈希/大小/完整性检查和last-result记录；另以只读方式核对副本user_version仍等于源版本，无需新增回执字段。源只读连接＋node:sqlite backup必须在锁定的Electron/Node中用真实v1/v2及未checkpoint的WAL验收。副本完整包含已提交WAL；snapshot实现中切为DELETE模式的是临时副本，不是源文件。不直接copyFile活跃数据库。[C13][R10]
4. **验证后才迁移。** 保留现有同一备份目录，不要求另建“迁移保护器”的目录/清单。成功保护后关闭源只读连接，再通过正常受控连接打开旧库，复核源版本及工作区generation/revision仍匹配已保护状态；本应用全程没有业务写入口，发现外部变动即停止并重新保护，不依赖过期副本。然后在一个迁移事务中完成v1/v2→v3结构、schema_migrations及user_version更新；v1中间步骤不得先独立提交。成功后构造Repository/WorkspaceService并开放业务；后者继续使用同一个固定备份目录即可，无需持有指向已关闭只读连接的BackupManager实例。正常连接的WAL初始化只发生在已确认支持且保护成功之后，不能提前用于版本探测。
5. **失败与恢复仍走已有通道。** create/verify/源版本检查失败都不得运行migrate；磁盘满或迁移失败保留旧业务数据、旧版本及有效保护副本，不开放写入。仅原子回滚迁移，不能删除旧库或把失败归为Jev凭据问题。`protective`不会被现有daily轮换删除，正常启动后应在现有设置备份列表可见，使用原有previewBackup/验证/确认/整库恢复路径；源v1/v2的读取兼容仍按本节交付。迁移失败时即使完整设置页不可达，也须在启动错误页给出已有副本位置与重试/退出指引，不另做备份恢复UI或清单。[C13]

`schema.ts`/`worker.ts`头部改为准确的职责契约：**启动编排负责先只读探测并调用现有BackupManager创建/验证保护副本；migrate只负责原子DDL与版本变更。** 该顺序及失败分支必须有集成测试，不能仅改注释声称保护已实现。既有create成功、之后verify失败时，由启动编排显示“升级保护校验失败”并中止；不把已写出的成功创建记录当成允许迁移的充分条件。

**旧程序降级的已知体验：** 当前旧版本遇到v3会在worker初始化抛出不支持版本错误，未必有友好迁移说明。本版不修改已经分发的旧二进制；私测发布说明必须告知“不要用旧版直接打开v3，需回到新版本，或由负责人从升级前保护副本恢复旧工作区”。不自动把v3降为v2，不删除库解决启动错误。新版自身仍须为未知/更高版本和保护失败提供明确提示；不承诺旧版拒绝前连PRAGMA/WAL文件元信息都绝不变化。[C11]

读取旧SQLite时先保留其源user_version，按对应输入契约验证/规范化，再写入新活动库；不能在检查之前用运行时常量3伪装源版本。验证新库/JSON/SQLite副本三个路径，迁移失败保留原库。设备enabledForGeneration和凭据始终不在此次迁移内。

### 9.3 分开验收同代次撤销与跨代次恢复

**闭环A，同代次用户撤销：** 创建计划→JSON导出/validateImport→当前代次整批undo→再导出/校验→先父后子/先子后父逐项还原→再导出/校验。该链不插入整库恢复，因此既有用户撤销规则不变。

**闭环B，整库恢复：** 分别取得“刚创建”“已整批撤销”“已部分/全部逐项还原”的快照→JSON与SQLite两种路径恢复到新代次→核对条目/关系/历史/回执/marker→再导出并通过validateImport。原历史operation代次保持不变；旧Toast/旧命令拒绝，使用新命令代次指向旧用户计划的undo也拒绝，Activity仍只读。新创建计划可在其新代次撤销；恢复前已在回收站的条目仍可按当前普通还原入口操作，不等于撤销旧计划。

两条闭环都覆盖v1/v2旧备份读取、支持版本的迁移保护失败与成功、v3对旧程序的拒绝。迁移本身不等同restoreWorkspace，不应无故更换原工作区generation。

负例包含：同项两个create效果、缺created事件、错误itemIds、重复归属边、非拓扑新父、循环/颜色冲突、反向事件无唯一原效果、缺undo marker、计划部分撤销伪装成功、既有parentRefs缺版本/相互矛盾或已过期。不得只测“创建后看板显示正确”。

## 10. 集成位置与交付边界

| 文件/模块 | 工作 |
| --- | --- |
| App.tsx / Board.tsx / QuickAdd.tsx | FAB/全局快捷键分流composer；列头和显式拆解保留；多项Toast/回收站入口 |
| renderer新composer、setup、settings | 预览、手动新流程、可跳过Onboarding、已有用户设置与迁移提示 |
| main新smart-input服务 / ipc.ts / preload | 独立异步云请求、权限/凭据、取消、预算及设备generation启用；不挂存储队列 |
| contracts/commands.ts、effects.ts、runtime.ts、queries.ts、transfer.ts | createPlan、多ID回执、反向引用及v1/v2/v3读写契约 |
| workspace/context.ts、repository.ts、新计划命令、commands/undo.ts | 一次事务、多效果拓扑、整体逆转与既有回执机制 |
| domain/import-validation.ts、transfer/dataset.ts、storage/schema.ts | 完整导入验证与版本标识，JSON/SQLite双路径兼容；不为恢复后撤销旧用户操作开例外 |
| storage启动初始化/worker、现有backup/manager与snapshot | 只读探测后提前构造BackupManager，protective→verify→原子migrate；同目录/回执/设置恢复路径，同步schema头部契约 |
| renderer/state/session.ts、use-workspace.ts | 单operation入栈，多ID只影响展示和定位，不复制撤销步 |
| tests/integration/transfer.test.ts、undo.test.ts等 | 新计划与旧数据完整回归；复用requestHash与lifecycle机制 |

新增功能期间原有业务规则以实际已完成代码和确认约定为基线；不要从删除前的旧TODO重新标记全部开发未完成。本文只约束本次增量；下列任务仅在实现并通过相关测试后勾选，未勾选项的原因见 §14。

## 11. Markdown 开发 TODO

### D · 文档接入

- [x] D01 维护者确认按功能规格归属后，同步AGENTS/README入口和本功能文件；修复不存在的链接，保留通用安全规则，不恢复旧任务勾选状态。

### A · Jev双渠道与隔离

- [x] A01 实现显式provider/protocol/model配置：TypeSafe systemOne＋jev-latest；Gateway evaluate＋typesafe-ai/jev，统一概率答案；Choice无跨渠道confidence依赖，元数据路径独立验证。
- [ ] A02 两渠道真实Key测固定样例、路径/model/only断言及usage/routing/舍入精度来源；实现按K与实际d计算总和容差，保留原分布并校验最大值。覆盖缺分布/未知精度、账户验证、认证/权限、额度、429、超时与非法响应；错误用受控fixture及可获得响应，不强迫绑卡/充值，ZDR不默认发送。
- [x] A03 建main独立异步智能IPC；HTTP等待不入storage队列、不持有事务、不占workspaceBusy。
- [x] A04 安全存取Key与enabledForGeneration、配置修订、取消/切换；明示unsigned Mac升级风险并验证降级，不使用明文兜底。

通过标准：两渠道各自一份Key可用，慢模型请求不阻塞普通DB命令，凭据边界独立。

### B · 入口、Onboarding与预览

- [x] B01 保留可跳过Onboarding，主动连接才展开Key；已有用户从设置启用，无重复向导。
- [x] B02 FAB/Cmd/Ctrl+N全局composer；无Key单条Later，列头QuickAdd及详情拆解保持；说明入口变化并记录不同看板规模下Tab→今天列＋的实际步数，验Enter/Space与焦点。聚焦列专用快捷键只记后置候选，不加入本次实现或普通模式五列选择器。
- [x] B03 完成单任务/清单/多父计划预览、手动字段保护、IME/键盘、会话草稿与失败手动确认/先存Later。
- [x] B04 预览支持手动无上级根设为新流程，空闲8色选择/草稿内互斥/提交复核；普通无色任务保持可见。

通过标准：普通/智能模式行为准确，未配置不被强迫连接，预览不写业务库。

### C · 判断与预算

- [x] C01 实现原文直接state的一轮并行Choice/Noul；片段/日期辅助不是前置分类，标题有原文依据。
- [x] C02 实现Q=1+3S+D+3+R的实际调度、累计64题与payload/token预算，超额关系明确not_evaluated，不以单父Choice替代多父。
- [x] C03 校验流程根最多8但普通目标不限8；显式引用/有限候选、题目覆盖、同名消歧与手动补多个上级。
- [x] C04 按工作区任意weekStart处理本周五，执行/截止分开，跨期提交刷新；不支持能力可见。
- [x] C05 实现真正依赖才补充一次、修订/上下文隔离、600ms防抖、取消、Retry-After与低置信稳定预览。

通过标准：最多8项仍不会越过题目预算，未评估不当否定，无隐形新增步骤或关系。

### P · 计划、回执与完整恢复

- [x] P01 扩展命令/Context/Repository及带expectedVersion的既有parentRefs；写入前去重统一验版本，一项一个create效果、入边归下级、稳定拓扑写入，保留requestHash幂等。
- [x] P02 扩展itemIds回执及preload/查询/transfer/UndoSession展示；单项还原、多项回收站入口准确。
- [x] P03 逆拓扑整体undo/SAVEPOINT；每项唯一原效果、完整marker、真实反向事件，复用lifecycle还原；保留用户操作代次限制，恢复后旧计划不可撤销，不给Activity新增写入口。
- [x] P04 扩展导入白名单、created映射、多效果例外、itemIds/边/逆操作双射校验，不放宽其他操作。
- [x] P05 调整启动顺序：readOnly源探测/读取workspace→提前构造现有BackupManager→create(protective)/verify及源版本复核→原子v3迁移→业务服务。复用同目录、BackupRecord和设置恢复入口，不建新清单；测v1/v2/WAL、空任务旧库、失败不升版本，更新worker/schema契约与旧程序拒绝v3的说明。
- [x] P06 分别跑§9.3同代次撤销还原闭环与跨代次JSON/SQLite恢复闭环；恢复后旧计划拒绝撤销，新计划可撤；覆盖多父/颜色、v1/v2升级、WAL快照、故障无半库。

通过标准：创建、同代次撤销、历史/回执、旧数据迁移保护及整库恢复均通过；恢复后旧用户计划与其他旧操作统一不可撤销，新代次操作正常。

### T · 交付验证

- [ ] T01 至少60条中文标注样例和8项压力样例，两渠道分别测准确、修正、请求数与耗时，不把本地分布集中度当准确率，两服务不依赖独立confidence。
- [ ] T02 Mac/Windows实际安装包验证两渠道、IME、焦点、Key存储/升级、无网络阻塞DB和旧请求失效。
- [x] T03 回归既有列内添加、流程、历史、顺延、单/批撤销、导出恢复/重置与旧数据，检查日志/备份无Key。
- [x] T04 发布说明列出Later降级、Onboarding跳过、在线接收方/BYOK、未签名私测局限；实际未测项明确保留待验。

通过标准：接口实测、核心存储回归和平台验收分别留证；文档校验或模拟模型不替代真实服务测试。

## 12. 必测验收矩阵

| ID | 场景 | 预期 |
| --- | --- | --- |
| V01 | 未配置输入“今天写文案” | 单条Later，无云请求/关键词识别/自动关联 |
| V02 | 任一开关、不同任务规模下Tab到今天列＋，Enter/Space及详情拆解 | 对应列/流程/父项保留且不调Jev；记录随前方任务控件增长的Tab步数，不冒充一键；全局Cmd/Ctrl+N仍为composer |
| V03 | Onboarding跳过或Key测试失败 | 仍可进入看板；日历无变化，不生成示例任务 |
| V04 | 各自只填一份Key | 路径、model、凭据正确，返回typed结果，SDK/HTTP格式不混用 |
| V05 | 普通任务、执行＋截止、多句修饰 | 默认一轮；“周五前完成”不单独变任务，原文不丢 |
| V06 | 一项两个已有上级及两个本批上级 | 合法多父可确认，非一道Choice只留一个 |
| V07 | S=8/D=8/已有根=8/本批56对 | 核心36＋关系≤28，累计≤64，未评估关系标明且可手动补 |
| V08 | 超payload/缺候选/同名目标 | 不截断正文或说目标不存在，明确缩减覆盖/手动处理 |
| V09 | weekStart=1..7的本周五、已过去星期 | 按工作区周而非宿主周计算，绝对日期可见 |
| V10 | 未来排期/提醒/重复/否定今天 | 限制或歧义可见，不自动改成今天/截止 |
| V11 | IME、快速输入、手动字段、服务切换 | 原文/光标/手动值保留，旧响应不覆盖也不自动转发 |
| V12 | Jev请求故意等待8秒，随后普通DB查询/命令 | DB命令不等待这8秒；analysisPending不当workspaceBusy |
| V13 | 403账户验证、真实认证错误、429、额度、断网/非法schema | 按明确code/type优先分类；账户验证/限流不说Key无效、不擦Key；冷却内不连发，可跳过/存Later |
| V14 | 手动新流程、有上级根、8色耗尽/被并发占用 | 颜色须明确选择，非法关系/占用拒绝；无色保存仍可见 |
| V15 | A→B/A→C/B→D/C→D计划 | 每项一个create，边归下级，拓扑创建/逆拓扑撤销正确 |
| V16 | 双击确认/结果丢失/同ID异请求 | 复用现有requestHash与receipt，只一份计划；异请求冲突 |
| V17 | 全批undo后先父后子及先子后父还原 | 复用delete来源，另一端还原时重试合法边，不永远丢边 |
| V18 | 外部新下级/已调期/颜色变化后计划undo | 按现有效果/依赖规则全成或全败，冲突无部分删除 |
| V19 | 多项结果与撤销Toast | N准确、一个栈项，itemId为null，不假装标量还原全部 |
| V20 | createPlan及已undo/逐项还原的快照→JSON恢复→再导出 | 各快照validateImport通过；恢复后旧用户计划不可撤销、活动只读、旧栈清空；新代次创建的新计划正常可撤 |
| V21 | 同代次undo闭环与独立SQLite恢复闭环，兼读v1/v2 | 源版本正确、原历史保留；恢复后旧用户操作不可撤，旧程序拒绝v3，旧版粗糙错误按已知行为记录 |
| V22 | 伪造同项多效果/缺事件/错IDs/重边/漏marker/半undo | 恢复拒绝且原库保持，不靠跳过校验兼容 |
| V23 | 中途磁盘/关系校验失败 | 所有新项/边/颜色/事件/回执回滚，草稿保留 |
| V24 | 跨日/周/月、目标删除后确认 | 刷新日期/重新确认或事务拒绝，不保存过期承诺 |
| V25 | 工作区恢复/重置 | enabledForGeneration失配，旧请求/草稿失效，保留设备Key不自动发送 |
| V26 | unsigned/ad-hoc不同构建升级、拒绝Keychain授权 | 提示权限/重新配置，保留加密副本不回退明文，不误报远端Key失效 |
| V27 | 导出/日志/崩溃上报检查 | 凭据、完整请求体不泄露；设备配置不迁入workspace |
| V28 | 文档正式入库 | README/AGENTS指向实际文件，无双份权威规范，旧已完成工作不被重置 |
| V29 | v1/v2启动、未checkpoint WAL、无活跃任务旧库、未知/更高版本、备份/校验/迁移失败 | 探测连接为readOnly且不调用openDatabase/改日记模式；先用现有BackupManager.create(protective)+verify再migrate；同目录/回执可被设置枚举并恢复，daily不轮换；失败不开放业务/不升版本 |
| V30 | 无confidence/缺分布，K=2/8/32，d=2/3及缺失/非法元数据，合法舍入与真坏分布 | 同分布＋同精度策略一致；32项两位合法误差按0.16+ε而非固定小值；三位缩至0.016+ε，超界/非法键值拒绝；choice最大值检查不放宽，全零/未知精度待确认，不补造概率 |
| V31 | Gateway only路由、unsupported警告、routing缺失、ZDR未证实 | only限制不被静默移除；明确不符/不支持拒绝发送后续内容；缺routing记未知；默认不发送ZDR且不承诺零保留 |
| V32 | 多子项引用同一已有父、缺/冲突/过期expectedVersion | 同一父先去重验版本，自身touch不制造第二项冲突；提交前真实变化全批stale，无任何部分计划 |

## 13. 来源、事实与待验范围

以上是本功能的实施规格，预算/UX默认值是产品选择。代码阅读基线固定为dbbd1ebe；实施后的构建、迁移与自动化结果见 §14，仍无真实Key调用结果。

### 官方接口资料与本轮核查范围

- [R1] [TypeSafe JS SDK types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/src/types.ts)：Choice/Noul、client配置、retry、signal与日志；前次核查blob `cd0a72d5a2c0492ea309f6aebf8c92f13892b2dc`。
- [R2] [TypeSafe官方开发指南](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)：共享state、并行/依赖、多父独立Noul、候选覆盖、confidence解释；前次核查blob `0109513f9656917dc93cbc5ecddfca465a53ce66`。
- [R3] [Vercel双接口公告](https://vercel.com/changelog/ai-gateway-now-supports-typesafe-clients-and-http-api-for-jev)：TypeSafe兼容示例、evaluation端点和明确model。
- [R4] [Vercel Jev集成指南](https://vercel.com/i/jev-integrations)：不同渠道的模型/接口命名；[模型页](https://vercel.com/ai-gateway/models/jev)。
- [R5] [Vercel Jev模型目录](https://vercel.com/ai-gateway/models/jev)：模型、处理方和能力入口；以接入时账户/协议为准，不将页面价格、促销或未声明的ZDR当作永久保证。
- [R6] [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)与[签名指南](https://www.electronjs.org/docs/latest/tutorial/code-signing)：OS保护、unsigned/ad-hoc的不一致风险。

- [R7] [Vercel evaluation官方协议入口](https://vercel.com/docs/ai-gateway/modalities/evaluation)及[官方SDK schema](https://github.com/vercel/ai/blob/main/packages/gateway/src/gateway-evaluation-model.ts)、[对应测试](https://github.com/vercel/ai/blob/main/packages/gateway/src/gateway-evaluation-model.test.ts)：本轮直接读回SDK的Choice/boolean、可选probabilities、usage.inputTokens、providerMetadata与rounding定义。schema blob：`5d0cea70603520ad1ca4578dcdc73ef5d6336be8`。SDK内部evaluation-model地址不是本功能HTTP `/v1/evaluate` 地址，不照搬其传输端点。
- [R8] [Gateway provider options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options)：only限定提供方的官方说明；具体evaluation请求和routing嵌套由A01/A02的HTTP契约测试固定。`customer_verification_required`作为评审提供的具体错误样例纳入测试，本轮未取得官方永久绑卡政策，不作所有账户必需条件。
- [R9] TypeSafe官方[Choice](https://docs.typesafe.ai/primitives/choice)、[Confidence](https://docs.typesafe.ai/confidence)、[Fan-out](https://docs.typesafe.ai/patterns/fan-out)：接入权威入口，本环境本轮未取得独立页面正文。255选项边界可由本次实际读回的官方适配器R12交叉核对；本功能仍用最多32选项。原文直送和并行语义由R1/R2支撑，不把第三方代读当成本轮直接读取。
- [R10] [SQLite Online Backup API](https://www.sqlite.org/backup.html)、[WAL文件](https://www.sqlite.org/wal.html)和[Node sqlite](https://nodejs.org/api/sqlite.html)：DatabaseSync的readOnly选项、一致性备份及WAL依据。应在项目锁定的Electron/Node中验证只读源备份，不依赖宿主Node代替；readOnly打开失败不等于文件不存在。
- [R11] [Vercel官方概率验证实现](https://github.com/vercel/ai/blob/21b2d6c3658bb397014bbcac4e7108468ce1f9e4/packages/ai/src/evaluate/validate-evaluation.ts)：已读回；d范围0–15、每项舍入误差0.5×10^-d、总和容差1e-6＋K×误差，choice最大值使用独立1e-6检查，保留供应商值。blob `879466122a7c93158011012a807bfc729a8b297c`。本规格只为派生熵使用归一化副本，不改原答案。
- [R12] [Vercel官方TypeSafe适配器](https://github.com/vercel/ai/blob/21b2d6c3658bb397014bbcac4e7108468ce1f9e4/packages/typesafe-ai/src/typesafe-ai-evaluation-model.ts)：已读回；声明原生响应两位概率/分数精度并校验Choice最多255项，blob `ea0926c520e9173226d3143d5f25353def140414`。这是有版本范围的适配器事实，不推断所有Gateway协议的缺省精度；本功能不因此新增对该包的依赖。

官方源说明接口设计，不等于已使用真实账户验证。本版新增核对BackupManager、consistentBackup、Store.workspace、现有设置恢复通道、任务行焦点控件，以及R11/R12的舍入验证与适配器代码。其余渠道调用、HTTP元数据和平台行为仍按A01/A02及P05验证；未直接读到的网页不冒充本轮直接访问，独立规范演算不作为应用测试。

### 当前代码依据

以下链接均固定到 `dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0`：

- [C1] [import-validation.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/domain/import-validation.ts)及[transfer.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/shared/contracts/transfer.ts)：白名单、单效果、唯一原效果、v1/v2与嵌套resultSchema。
- [C2] [domain/undo.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/domain/undo.ts)及[commands/undo.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/commands/undo.ts)：create依赖匹配和逆序执行。
- [C3] [storage/worker.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/worker.ts)：所有RPC的串行队列。
- [C4] [repository.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/repository.ts)：requestHash、receipt、SAVEPOINT、scalar结果。
- [C5] [entities.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/shared/contracts/entities.ts)及[Board.tsx](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/renderer/features/board/Board.tsx)：0–7色板、当前入口和非流程项显示。
- [C6] [lifecycle.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/commands/lifecycle.ts)：删除来源、两端还原及颜色占用处理。
- [C7] [commands.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/shared/contracts/commands.ts)及[App.tsx](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/renderer/App.tsx)：单itemId结果和定向还原按钮。
- [C8] [transfer/dataset.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/transfer/dataset.ts)：导出常量、SQLite源版本、替换与新generation。
- [C9] [AGENTS.md](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/AGENTS.md)、[README.md](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/README.md)与[7f0fc66删除提交](https://github.com/thinkingjimmy/goalloom/commit/7f0fc66619913284f83090f3ffd671b113d79194)：文档入口失配及当前私测状态。
- [C10] [commands/items.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/commands/items.ts)：create的expectedParentVersion与touch，以及多子项一次验版本的接入依据。
- [C11] [storage/schema.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/schema.ts)、[worker.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/worker.ts)、[database.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/database.ts)：旧版本拒绝/迁移路径、缺少迁移前备份的实际调用顺序及WAL初始化。
- [C12] [commands/settings.ts](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/commands/settings.ts)：系统rollover的undoBatch独立于用户undo的原操作代次限制，本功能保持其规则。
- [C13] [BackupManager](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/backup/manager.ts)、[snapshot](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/backup/snapshot.ts)、[Store.workspace](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/storage/store.ts)、[WorkspaceService](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/main/workspace/transfer/service.ts)：连接＋目录即可构造、调用方提供workspace、现有回执/verify/daily筛选与previewBackup通道；本次已读回。提前调用及源v1/v2验收属于待实现P05。
- [C14] [TaskRow](https://github.com/thinkingjimmy/goalloom/blob/dbbd1ebe0d23b4397da4b360b8c10bc6ac9579c0/src/renderer/features/board/TaskRow.tsx)：拖动、勾选、标题按钮参与焦点路径，与Board按列渲染共同决定Tab长度；本次只读代码，实际步数由V02实测。

## 14. 实施记录与私测发布说明

### 14.1 已执行的验证（2026-09-23，macOS 25.4.0 · Apple M3 Max 物理机，非 VM）

运行时：Electron 44.4.4 · Node 24.21.0（Electron 内置）· SQLite 3.53.4；`@typesafe-ai/sdk` 0.6.0 精确锁定。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` / `npm run build` | 通过；生产产物检查无 HMR/测试控制口/第二图标库，许可证汇总 20 个依赖 |
| `npm test` | 19 个文件 138 项通过：含 `domain/smart`、`main/smart`（fixture）、`renderer/draft`、`integration/plan`、`integration/startup` |
| `npm run test:electron` / `test:ui` / `test:history` / `test:recovery` / `test:performance` | 全部通过（源码入口，非安装包）；性能 10,000 条目夹具指标与改动前同量级 |
| `npm run test:composer` | 通过；Tab 从顶栏「设置与数据」到「在今天新建」：空看板 8 步、1 项 11 步、12 项 44 步、60 项 188 步（每个前方任务约 3 个焦点：拖动/勾选/标题） |

覆盖对应：V01–V03（普通 Later、列头＋Enter/Space/连续输入/拆解、跳过 Onboarding）；V04/V13/V30/V31 仅以受控 fixture 与官方 HTTP 样例形状验证；V05–V11、V14–V25、V27、V29、V32 由领域/集成/服务测试覆盖。

### 14.2 未完成与待验（不勾选）

- **A02 / T01：** 未使用任何真实 Key 调用 TypeSafe 或 AI Gateway；`customer_verification_required`、429、额度等只由 fixture 验证分类。Gateway `/v1/evaluate` 请求/响应形状按 2026-09-16 官方文档 HTTP 样例冻结（routing 位于 `providerMetadata.gateway.routing`）；`only` 是否被 evaluation 协议实际遵守、`rounding.probabilityDecimals` 是否返回，须 A02 实测。60 条标注样例与 8 项压力样例的准确率/耗时尚未测。
- **T02：** 未生成或验证 Mac/Windows 安装包；真实 IME、Keychain/DPAPI 授权与未签名升级（V26）、无网络下的实机 DB 响应未在安装包上验收。
- **已知取舍：** 当前题单均在已知状态下定义，仅当 1+3S+D+3+R 超过 64 时，第一轮只问核心题，分组确定后发一次具名补充请求问任务之间及与候选的关系（累计仍 ≤64）；用户在预览中手选的上级不回传给 Jev 重复询问，直接以手动结构为准。

### 14.3 私测发布说明（随私测包提供）

- **不连接也能用：** 全局「＋」/Cmd/Ctrl+N 在未配置或关闭 Jev 时只保存 1 条 Later（第一非空行为标题，全文进说明）；列头「＋」仍在对应列连续录入。
- **Onboarding 可跳过：** 日历确认后出现可选 Jev 步骤，「暂时跳过」不影响日历与数据；已有用户升级后默认关闭，在「设置 → 智能输入」启用。
- **在线接收方与 BYOK：** 由用户自带 Key。TypeSafe 原生路径由 TypeSafe 处理；AI Gateway 路径先经 Vercel，再仅路由到 TypeSafe 的 Jev。只发送当前原文、工作区日期及被点名/选中的目标标题/状态/位置，不发送说明、历史、回收站或整库；费用与额度按用户账户，Goalloom 不代购、不承诺零数据保留。
- **未签名私测局限：** macOS 包未签名/未公证，升级后可能再次请求钥匙串授权或需重新填写 Key；Key 不会明文回退，读取失败保留加密副本。
- **当前数据版本 v5（计划事务始于 v3）：** 首次用新版本打开 v1–v4 工作区时，会先在原备份目录创建并校验 `protective` 副本再原子升级。**不要用旧版本直接打开已升级的 v5 工作区**（旧版会报不支持的版本）；需要回到旧数据时回到新版本，或由负责人从升级前保护副本恢复。保护或升级失败时应用不开放写入，并显示副本与数据位置。
- **待验项：** 两渠道真实联调、标注样例评估、Windows 安装包与真实 IME/凭据授权仍在验收中（§14.2）。
