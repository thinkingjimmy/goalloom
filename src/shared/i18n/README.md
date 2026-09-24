# i18n/

> L2 | 父级：[项目地图](../../../README.md)。main、存储 worker、domain 与 renderer 共用的语言边界。

```text
i18n/
├── locale.ts     # Locale 列表、语言偏好 schema（system | Locale）、系统语言解析（不支持回落英文）、原生语言名、Intl 标签、widen
├── server.ts     # 每个进程/线程的当前语言：setServerLocale / serverText()
├── validation.ts # 五语言 wire 校验文案与 preload 当前语言，服务端目录复用同一文案
└── catalogs/     # 服务端文案：zh 为源（app 通用 + import 导入校验），en/ja/es/fr 同构
```

偏好由 main 保存在 `userData/preferences.json`（工作区之外），启动时先于存储解析，经 `workerData` 与 `locale` 消息同步 worker，经 `goalloom:language` 通道同步 renderer。错误、警告与操作标签在产生时按当前语言生成；已写入回执的标签保留当时的语言。备份失败只持久化种类，读取时再翻译。Jev 提示词与中文日期解析不属于界面文案。

[PROTOCOL]: Update this header when making changes, then check README.md.
