# Goalloom · Hugeicons 图标规范

v0.3.1 · 2026-09-21。**用户已指定Hugeicons为应用UI图标库。** 本文是待实施规范，不代表已安装依赖或生成界面。库的选择已确认；下面的免费包、尺寸与封装方式是首版实施默认。

## 1. 来源、风格与授权

采用 `@hugeicons/react` 渲染组件与 `@hugeicons/core-free-icons` 图标数据，默认 **Stroke Rounded**。这是Hugeicons官方免费React接入路线，具体版本在M1真实构建后锁定，不凭文档使用任意latest组合。[官方快速开始](https://hugeicons.com/docs/integrations/react/quick-start)

免费包按官方MIT许可使用，交付时保留实际依赖要求的许可证与版权声明。用户没有告知购买Pro：不安装 `@hugeicons-pro/*`、不发起采购、不把许可密钥写入仓库或客户端。未来使用Pro须单独确认授权与构建凭据管理。[官方许可FAQ](https://hugeicons.com/faq/general/license)

## 2. 适用范围

看板、录入、关联选择器、历史翻页、设置、搜索、弹窗、状态与空状态的UI图标均来自Hugeicons；复制或生成的shadcn组件内部图标同样适用。不得因为示例方便而混入Lucide、Heroicons、Tabler、react-icons或emoji作为功能图标。

系统原生窗口按钮保留平台行为；Goalloom品牌Logo与应用启动图标另行设计，不把普通功能图标自动当成品牌。用户任务正文里的emoji不受UI图标来源规则限制。关系SVG连线、焦点框、分隔线等布局图形不算另一套图标。

## 3. 前端实现约定

在 `src/renderer/components/icons/` 建立小型共享入口，使用 `HugeiconsIcon` 做轻量封装和实际所需图标的语义映射。业务使用search、add、link、history、settings等语义；具体导出名以锁定包的真实类型定义为准，不猜测不存在的图标名。

只显式导入使用的图标，不使用整库通配导入或按任意字符串运行时扫描整库。图标随Electron本地资源打包，不加载CDN、远程SVG或图标字体；开发时能显示不能代替打包后断网验收。[官方React实践](https://hugeicons.com/docs/integrations/react/best-practices)

实施默认：常规工具栏20px，紧凑行内16px，空状态24–32px；线宽1.5，颜色继承currentColor并由Tailwind语义token控制。不同尺寸保持同一Stroke Rounded风格，不通过混入另一图标库制造选中态。这些数值是产品设计默认，不是库的强制限制。

## 4. shadcn适配与可访问性

初始化组件时优先使用所选CLI版本提供的Hugeicons选项；无对应选项时修改纳入仓库的组件源码。不能假定换一个配置字段就会迁移全部已有组件，也不能为了图标替换重写已确认的组件交互体系。

每次新增或更新组件，检查关闭按钮、下拉箭头、复选标记、菜单、日历、Toast和加载状态的内部图标及相关类型。保留原有ref、焦点管理、键盘语义、按钮命中区域和SVG样式选择器；不遗漏默认导入的第二套图标依赖。

仅图标按钮必须有可访问名称；装饰图标不重复朗读，状态不能只靠颜色区分。视觉尺寸不等于按钮点击区域。浅色 / 深色、禁用、悬停、焦点与系统缩放需要验收。不存在合适免费图标时先采用清晰文字操作并记录，不静默引入Pro或其他图标库。[官方可访问性与封装建议](https://hugeicons.com/docs/integrations/react/best-practices)

## 5. 开发与验收

- [ ] 安装两个官方免费React相关包并锁定实际兼容版本；记录许可证。
- [ ] 建立共享图标入口与有限语义映射，保留显式导入。
- [ ] 将业务界面及shadcn内部UI图标统一为Hugeicons，检查残留图标依赖。
- [ ] 验证主题、尺寸、线宽、可访问名称、键盘、ref和打包后离线显示。
- [ ] 通过 [ACCEPTANCE H01–H04](ACCEPTANCE.md)；未实施前不得勾选。
