# Goalloom · 技术方案与开发 TODO

v0.6 · 2026-09-22。产品规则见 [PRD](PRD.md)，执行与文档协议见 [AGENTS](../AGENTS.md)。

## 1. 工程约束

**结构：** `src/main`（命令 / 存储）、`src/preload`、`src/renderer`、`src/shared/contracts`、`src/domain`、`tests`。单实例 / 单工作窗口，一个权威写入通道。日历、候选、撤销匹配、历史投影与导入校验做成纯函数，时间 / 设置 / 数据显式注入，无 Electron、数据库或全局时钟依赖；事务服务读取最新状态后复核并落实数据库约束。

**安全：** renderer → 有限 `window.goalloom` API → contextBridge / preload → main 命令 → SQLite。保持 `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`、`webSecurity=true`，验证来源 / 参数 / 版本 / DTO，限制导航、新窗口、权限与外链；不暴露原始 IPC、任意路径、SQL 或 shell。生产 CSP 限定本地可信脚本，禁止远程脚本、unsafe-eval、任意内联脚本、object和非必要连接，样式 / 图标按组件最小放行；自有协议用响应头，file路线用及早生效的meta，开发HMR策略独立，测试实际阻断注入。日志无正文 / 凭据。[Electron安全](https://www.electronjs.org/docs/latest/tutorial/security)

**SQLite：** M1 优先评估 `node:sqlite`，不满足再选择 `better-sqlite3`，只维护一种驱动。Node 22.5引入模块，22.13起免 experimental-sqlite 开关，backup API在22.16 / 23.8加入；实际稳定性 / 可用API按选定版本核对。Electron曾修复模块构建缺失，因此在真实main / 受控worker和两平台安装包检查import、事务、备份恢复与中文路径，并记录 `process.versions.electron/node` 和SQLite版本。内建驱动免除此数据库外部插件的ABI / rebuild；采用外部驱动则验证Electron ABI、CPU、rebuild及打包资源。DatabaseSync同步操作的大查询 / 导入 / 备份放受控存储worker。[Node API](https://nodejs.org/api/sqlite.html) · [Electron修复记录](https://releases.electronjs.org/pr/47706)

Vite构建，electron-vite、dnd-kit与测试runner在M1验证锁版。预览mock明示不持久化，正式包缺存储报错。文档组织只遵循AGENTS的项目约定，此处不复制数值硬限或另设协议。

**图标与颜色：** `@hugeicons/react` + `@hugeicons/core-free-icons`，共享入口 `src/renderer/components/icons/`，显式导入实际存在的图标。默认Stroke Rounded、线宽1.5、工具栏20px / 行内16px / 空状态24–32px、currentColor；审查shadcn内部图标 / SVG选择器 / ref / 焦点 / 键盘 / 命中区 / 许可证。关联标记用固定哈希(ID)%8选择配对的light/dark语义token，算法和索引顺序稳定；八组均验对比度、禁用 / 选中 / 高对比模式，颜色碰撞不合并条目。无远程图标 / 整库扫描 / 第二图标库 / 未授权Pro，缺合适图标先用文字。[接入](https://hugeicons.com/docs/integrations/react/quick-start) · [实践](https://hugeicons.com/docs/integrations/react/best-practices)

## 2. 数据与事务

### 2.1 实体与查询

| 实体 | 必要信息 / 约束 |
| --- | --- |
| items | 稳定ID、title / description、status、due_date、completed_at、cancelled_at、archived_at、deleted_at、version及创建 / 修改时间；无kind / 自定义color |
| calendar_config / settings | 首次timezone、week_start、cycle参数、持久化locked_at；备份启用 / N / 结果和rollover_paused_after_restore。首版无pending日历规则 |
| planning_periods / item_placements | 尺度、日期起止 / 排他结束、固定UTC边界 / 时区 / 配置标识；每项唯一位置、sort_key / version / auto_hold_period_id。Later period为空，其余匹配尺度 |
| item_relations | parent / child、失效标记及删除失效来源；活跃父子对唯一，同事务防自关联 / 防环；单父另限制活跃child唯一，基数待D06 |
| rollover_policies | horizon / mode / version / effective_from_period；day默认auto，week/month默认manual，cycle固定manual，Later无；生效比较按固定时间边界而非随机ID |
| operations / item_events | 稳定operation / batch ID、source / request_hash / result；event ID、操作内唯一index、seq、真实occurred_at、event_type、payload版本、有限before/after及undo引用 |
| schema_migrations | 迁移版本 / 时间，成功才提升 |

应用内状态转换：done填写实际completed_at且cancelled_at为空；cancelled填写实际cancelled_at且completed_at为空；todo两者均空。重开保留历史事件，再取消记录新时间；归档 / 删除 / 还原不改变这些状态时间。撤销回到先前done/cancelled可还原该状态原有的真实时间戳，同时另记实际撤销时间。旧数据无可靠时间时允许对应字段为空并标历史不完整，展示「日期未记录」；只有可信事件能补齐，不以created_at / updated_at推测。普通本应用操作和完整历史导入必须满足对应时间约束。

软删除保留item / placement与事件身份，关系标明是否因哪次删除失效；还原只尝试该次删除失效的合法边，主动解除的边不复活。归档、status、deleted_at独立；全局done / cancelled含归档、排除删除，分别按completed_at / cancelled_at倒序分组，未知日期单组。回收站按deleted_at查所有尺度含Later。

**关系双入口：** `linkItems(parentId, childId, expectedVersions, operationId)` 服务「选择上级」和「关联已有下级」。检查双方存在 / 未删除、防环 / 活跃边去重；单父已有其他父时，预览并明确确认换父，在同事务校验旧父与新父版本后替换。两入口不改placement / status，不复制条目；取消与重复请求不增加边。

**搜索：** 参数化LIKE，转义% / _和escape字符以匹配字面子串；空查询明确为空态或约定默认结果，不暗中全库展开。分页 / 防抖，用10,000条、长中文说明、1 / 2字符、中英混合和特殊字符实测。首版不上FTS5；实测不足再考虑索引 / tokenizer，trigram不是CJK唯一方案，且短于3字符MATCH有限制。[LIKE](https://www.sqlite.org/lang_expr.html) · [FTS5](https://www.sqlite.org/fts5.html)

### 2.2 当前表、历史与命令

条目 / 位置 / 初始关系 / 创建事件原子写入；首次有效写入同事务锁定calendar_config，删除所有项也保留locked_at。所有关键写入连同事件 / 回执全成或全败；operationId同请求返回原结果，异请求报冲突。用户命令校验版本，系统在串行写通道重读候选；开启外键、日期 / 枚举 / 唯一约束。

从首笔写入记录created / baseline、moved、rolled_over、status_changed、archived / unarchived、deleted / item_restored及undo。`restoreItem`对应回收站「还原」，`restoreWorkspace`对应备份 / JSON「恢复」，调用和日志按语义区分。前者既不设置也不解除rollover_paused_after_restore，后者整库成功替换后设为true。

事件只存计划 / 状态 / 可见性 / 时间 / 版本和必要排序 / hold。文字 / 关系编辑可只递增版本；同期排序仅保存有限顺序回执，不制造移动 / 顺延事件。当前看板读实体，历史按真实period成员去重，以固定结束边界前的业务状态推导期末并分开显示后来结果；使用item / seq、operation / index及from/to period索引，不全库重放或扫JSON。边界时刻归下一周期，同时间按seq；时钟回拨标异常、暂停受影响自动时序推断并提示复核，baseline前为unknown。

**导入链与撤销检查分开：** 链连续性比horizon、periodId、status、completedAt、cancelledAt、archivedAt、deletedAt，验证每事件类型、身份 / 日期、seq / 引用 / undo及末尾状态与当前表一致。合法未记录编辑可使版本跳号、排序 / 邻居变化，不能比较整份JSON全等；版本合法不倒退，hold按操作约束验证，旧数据unknown须有明确baseline。撤销仍严格匹配当前item / placement版本和原目标状态 / 位置，不能覆盖后续编辑。

### 2.3 固定日历与核对

首次配置timezone / week_start及已确认D07参数；无条目且无历史、locked_at为空时可重配并原子更新空周期缓存。首次条目写入后设置和IPC均拒绝日历变更，即使条目已全软删除；顺延策略不受该锁限制。首版不存pending / effective日历规则或transition记录；workspace恢复须使用兼容schema并全量替换源配置，不合并两个日历。

日 / 周 / 月按固定IANA规则和真实日历计算，夏令时随该时区规则正常生效，不用24小时 / 90天常数。D07若选固定三日历月，用原锚点+3n月、月末截断；周key包含起始日期和配置标识。系统改为更西 / 更东时区，只提示，工作区period / placement不变，不生成过渡和额外顺延。

reconcile在启动 / 唤醒 / 前台 / 边界触发，一轮一个observedAt，先作日常备份检查，再选旧周期有效todo、auto策略、生效范围内、无本目标period hold且非整库恢复暂停的项。无“今天执行过”全局跳过；新候选仍可处理。长期退出后只记实际跨期操作，不造中间经过事件。还原 / 重开 / 解除归档产生旧todo后可进入独立的后续核对，不暗改还原动作本身。

### 2.4 提示、撤销与hold

自动顺延按目标period原子成批，稳定追加排序、写逐项事件与回执后提示。用户跨列 / 跨期移动、完成、取消、删除成功后更新单一非阻塞Toast与撤销目标；按钮必须绑定实际operationId，频繁操作不得错撤前一项。同期排序不弹Toast，仍保存有限可撤销顺序回执。用户快捷撤销栈仅当前会话，系统批次不入栈；批次历史持久化，可从对应入口显式撤销。首版无redo承诺。

Cmd/Ctrl+Z在非编辑焦点调用最近用户操作，input / textarea / contenteditable / IME保持文本撤销；提供命令面板替代。撤销使用新operationId，事务校验原效果未逆转、当前item / placement版本和目标位置 / 状态，冲突说明并保持栈顶，不自动跳到另一项；成功才出栈。批次可跳过冲突，排序重排有依赖则全组校验，无法一致逆转就全组拒绝。恢复相对邻居，不覆盖整列新顺序。

逆操作引用原operation；有业务事件则追加相应反向event，纯排序只写回执。撤销取消 / 完成保留原历史与真实状态时间；撤销删除复用restoreItem的实体 / 边校验，再按逆操作落hold。每效果最多成功逆转一次，0项或失败不报成功。

**逆操作返回已结束period的todo时，不论策略auto/manual都落执行时当前同尺度period的hold。** 包含删除 / 取消 / 完成和移动的撤销；当前period / Later不落hold。hold持久化，本周期不再自动搬回，仍在往期入口；下周期失效，新的用户手动移位清除旧hold。归档 / 删除筛选和既有workspace暂停仍优先；普通还原不制造workspace暂停。手动操作与自动批次按实际事务提交顺序保留事件。

### 2.5 备份、整库恢复与暂停

每天首次活跃检查、默认保留7份日常备份；同日成功去重、失败可重试。用SQLite一致性机制覆盖已提交WAL，写唯一临时文件、关闭 / 校验并原子改名后才轮换；中断 / 磁盘满不删旧有效副本。仅轮换应用自建日常副本，保护备份和用户导出不轮换。迁移 / 覆盖恢复前保护备份失败则停止危险操作，日常失败提示但不阻断安全编辑。[SQLite备份](https://www.sqlite.org/backup.html)

JSON带schemaVersion / exportedAt及全部实体、calendar_config、策略、history、operation和undo / hold；ID / seq / 时序 / 生效边界保留。备份文件位置不是导入后可任意写盘的指令，不信任外部路径。大小限制→schema / 字段 / 日期 / 图 / 链校验→预览确认（含源日历）→保护备份→原子替换→完整性校验。未知schema、悬空 / 重复引用、非法图或真不连续链拒绝，失败保留当前库。

仅整库替换成功设置 `rollover_paused_after_restore=true`，明确显示「工作区恢复完成，确认后按设置处理往期事项」。用户确认才解除，重启不绕过。此时restoreItem、解除归档、搜索和普通编辑仍可用且不改暂停标记；候选保留往期入口。旧数据无事件建实际导入时baseline，有可信历史不改成导入时刻；缺旧策略时旧积压手动、新当前周期默认并在预览说明。备份必须实际恢复验证，不能替代导入校验。

## 3. 分阶段开发与验收

### M0 · 纸面冻结边界

- [ ] 确认D06基数、D07初始参数、最低OS / CPU、语言与内测范围，冻结受影响的DDL / 选择器。
- [ ] 纸面推演首次时区 / 起点、日历锁定、两种恢复语义、状态时间和双向关系入口；系统时区改变后仍按原工作区日历。

通过标准：产品样例和待定项清晰，未定参数不固化为生产迁移；M0不要求不存在的应用执行测试。

### M1 · 最小 Electron 双平台闭环

- [ ] 建React / TypeScript strict / Vite / shadcn / Tailwind / Electron三入口、受控IPC与生产CSP，锁依赖 / 构建 / 打包 / runner。
- [ ] 优先在真实Electron与Mac / Windows包验证node:sqlite import / API / 事务 / 备份恢复，失败再选外部驱动并记录原因。
- [ ] 接Hugeicons与固定配对色板，审查shadcn残留 / 授权 / 离线图标；两列录入 / 拖拽 / 关联选择器、SQLite重启恢复、文件对话框可用。
- [ ] 建无Electron依赖的domain及注入时钟，将日历 / 候选 / 撤销 / 导入样例做成fixture，并单独跑repository测试。
- [ ] 工程存在后加macOS + Windows CI：静态 / 单元 / 集成 / 构建产物，固定镜像与架构并标托管VM / 自托管等环境。
- [ ] Windows x64干净VM验安装 / 升级 / 存储 / 自动化；Windows x64和Apple Silicon实机验IME / 拖拽 / 睡眠 / 缩放，记录缺失的环境与未执行用例。

通过标准：两平台实际安装完成最小闭环，记录Electron / Node / SQLite / OS / CPU与环境；HMR和测试控制口不进入正式包。

### M2 · 五列、状态、关联和用户撤销

- [ ] 建表 / 迁移 / 已确认日历，首条任务写入原子锁定配置；CRUD / 状态 / 取消时间 / 归档 / 删除 / 还原与关键事件一致。
- [ ] 完成视图入口与查询：Later完成折叠、Later删除还原、已取消按cancelled_at分组、归档保留原状态、普通搜索排除删除。
- [ ] 实现聚焦列新建 / 历史回落、多行输入快捷键 / IME、未保存退出提示、中文搜索、主题 / 窄窗口；当前列无移出引用。
- [ ] 两个关系入口共用parent→child契约，防环 / 去重 / D06单父换父确认或多父追加，标记 / 上下级 / 定位 / 高亮可用，八组配对颜色稳定且可访问。
- [ ] 跨列 / 跨期移动、完成、取消、删除Toast＋安全撤销；列内排序无Toast、非编辑焦点Cmd/Ctrl+Z / 命令可撤销，系统批次不污染用户栈。
- [ ] 测断网创建→编辑→移动→完成→重启，以及重复 / 并发 / 写失败、误删 / 误取消撤销、关系还原冲突和版本检查。

通过标准：全部状态都有可达去向，条目唯一、状态独立、关系不丢，误操作能安全逆转；无需SVG或使用中日历编辑。

### M3 · 历史与往期未完成

- [ ] 按列只读历史 / 返回当前、空周期 / 起点、当前内容说明；会话不强跳，重启回当前，禁止历史 / 未来排期。
- [ ] 期末状态与后续结果分开、成员去重，完成 / 取消按真实时间分组；历史端点不接当前图，日项不隐式成为月计划。
- [ ] 所有策略下往期入口 / N / 原日期 / 批量当前或Later；「暂不处理」仅关面板，仍计N，无隐藏状态。
- [ ] 测9月计划10月完成、直接完成未调期、完成后重开、取消后重开再取消、归档 / 删除 / 还原、同周期往返与未运行跨期。

通过标准：过去不被后续状态覆盖，所有有效旧待办可找到；历史只读与当前单位置一致。

### M4 · 固定日历下的顺延与整库恢复

- [ ] 实现分尺度策略 / 生效范围、统一reconcile、原子批次 / 来源 / 成功提示与撤销，不级联关系。
- [ ] 所有返回旧todo的撤销均落hold，包括manual策略；重启 / 下周期 / 手动移位按契约处理，部分冲突跳过且不覆盖。
- [ ] 日常备份 / N轮换 / 错误提示、JSON和备份整库恢复的校验 / 确认 / 保护备份 / 暂停可用；单条目还原不改变暂停。
- [ ] 首版拒绝已锁定日历编辑，不构建pending / 过渡引擎；执行下表核心回归，并记录纯函数 / repository / UI对应结果。

| 回归场景 | 必须验证 |
| --- | --- |
| 固定日历与时区 | 首次配置 / 锁定，删除所有项不解锁；系统UTC+8→UTC+5及反向仅提示，period不变、无3h过渡或额外顺延；固定IANA下DST / 月末 / 闰年 / 跨年正确 |
| 状态时间 | 取消→重开→再取消使用最新cancelled_at，旧事件保留；还原 / 归档不改状态时间；旧数据未知日期有独立分组 |
| 还原与恢复 | Later回收站还原不设全局暂停；整库JSON / 备份恢复设置并持久化暂停；暂停中还原不清标记，确认后才自动处理 |
| 双入口关系 | 选上级 / 关联已有下级产生同一条边；重复 / 自关联 / 循环拒绝；单父有旧父先确认，原子换父且取消无写入 |
| 颜色与提示 | 同ID浅深主题同索引，八组均验对比度 / 状态；连续排序无Toast，用户跨列 / 完成 / 取消 / 删除提示绑定正确operationId |
| 撤销焦点与竞争 | 文本 / contenteditable / IME不抢Z；应用Z不撤系统批次、不跳过冲突栈顶；顺序重排有依赖则安全拒绝全组 |
| 策略边界与排除 | 日auto / 周月manual可选auto / cycle手动 / Later无；开启不清旧积压、关闭不倒退；done / cancelled / archived / deleted排除 |
| 顺延与故障 | 多来源稳定追加；9→11一次，重启 / 唤醒 / 多入口 / 响应丢失不重复、不漏新候选；手动完成竞争按实际提交顺序 |
| hold一致性 | 任意撤销回旧todo均hold，即使manual；本周期改为auto也不立刻搬回，仍见往期入口；下周期可处理，手动移位清旧hold |
| 历史边界 | 午夜事件归新周期；9月完成10月重开、旧项直接完成、同周期往返历史正确；时钟回拨记录异常不虚构操作 |
| 合法与非法整库恢复 | 编辑 / 关系 / 排序的版本跳号允许；业务链含cancelledAt；非法图 / 日期 / 悬空或重复引用 / 未知schema拒绝，保留undo / hold及源日历 |
| 备份与磁盘故障 | 同日去重、跨日活跃检查、WAL一致副本、N仅轮换自建日常备份；失败保留旧副本、保护备份失败阻止危险覆盖，无半写 |
| 搜索与安全 | 一字 / 两字中文、长说明、% / _字面匹配 / 分页；生产CSP / IPC阻断恶意请求；Hugeicons离线、键盘和可访问名称正确 |

通过标准：固定规则下跨日 / 周 / 月闭环成立；安全撤销不被自动流程抵消，条目还原与整库恢复互不混用，备份能实际恢复全部业务历史。

### M5 · 私人内测交付

- [ ] 每个承诺OS / CPU干净安装验证SQLite / preload、中文 / 空格路径、权限、卸载数据与覆盖升级，记录CI / VM / 实机差异。
- [ ] Mac和Windows实机回归IME / emoji / 剪贴板、全键盘、辅助功能、拖动、主题 / 缩放 / 多屏、关闭 / 退出 / Dock重开 / 睡眠。
- [ ] 1,000活跃 / 10,000总条目及真实事件量测看板、搜索、关系、历史、顺延、备份恢复和启动 / 内存 / 包体，注明设备 / 构建 / 延迟。
- [ ] 生产CSP有效，无调试 / 时钟控制口、开发服务、repo token / Pro密钥 / 正文遥测；修复阻断项，交私人包、测试结果和已知限制。

通过标准：全部承诺平台能安装、离线使用和整库恢复，主要输入 / 生命周期有实机证据，无已知阻断问题。

**内测阻断：** 数据丢失 / 历史不一致、循环关系、无确认覆盖、顺延改截止日、已锁日历被暗改、历史浏览写计划、覆盖后改数据、重复顺延 / 撤销失效、有效往期不可见、Later无法还原、还原误改整库暂停、离线不可用或承诺平台不能运行。

### M4之后可选 · 日历编辑与SVG

这两项不阻断M5，获准扩展后再实现。SVG只连可见当前端点，测独立列滚动 / 缩放 / 抽屉 / 虚拟化，标记和文字路径仍可独立使用。

日历编辑另定pending规则、生效 / 预览 / 取消 / 覆盖恢复契约；不得覆写旧period或悄悄移动当前项。最短过渡候选算法：旧边界B后的首个新边界E1，紧邻完整新周期结束E2；若E1-B小于(E2-E1)/2，合并为[B,E2)，否则[B,E1)。比较真实UTC时长，完整周期按新日历生成；合并后的E1不是应用周期边界，不触发reconcile调期，不生成被跳过的任务事件。

启用前必须测试向西 / 向东、DST、月底 / 闰年 / 跨年、周起始日变更和cycle重设范围。固定偏移示例：旧UTC+8在2027-02-01 00:00结束，换UTC+5时日 / 周 / 月残段均可为3h，须分别并入随后完整周期；换UTC+11时日残段21h，不能无条件合并。此为未来规则的算例，首版只验证系统时区变化不改工作区。

### R1 · 对外发布，另行批准

- [ ] 确定稳定app标识 / 数据目录与系统范围，落实签名 / 公证、真实下载 / 安装、升级 / 回退说明。
- [ ] 说明隐私、回收站非擦除、同盘备份风险 / 保留规则 / 未加应用层加密；不交付私人仓库凭据。
- [ ] 明确授权后才公开分发，repo保持Private，未来功能按PRD另行立项。

通过标准：有发布授权并验证真实分发路径；与私人内测验收分开。
