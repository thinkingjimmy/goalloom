# main/

> 父级：[项目地图](../../README.md)。Electron 组合与本地安全边界。

```text
main/
├── index.ts       # 单实例、窗口生命周期、退出确认后排空存储 worker
├── ipc.ts         # 固定读写入口、来源检查和原生文件对话框
├── security.ts    # 本地协议白名单、生产 CSP、权限/导航/下载拒绝
├── window/
│   ├── state.ts   # 工作区之外的窗口偏好，跨屏恢复不出界
│   ├── language.ts # 设备语言偏好（preferences.json，跟随系统或指定），先于存储加载并设置 main 文案
│   └── close.ts   # 未保存草稿确认，默认继续编辑；取消退出不关数据库
├── storage/       # SQLite、启动迁移保护、备份与文件适配器、worker 通道，见局部地图
├── smart/         # Jev 智能输入：双渠道 adapter、设备凭据、独立异步服务，见局部地图
└── workspace/     # 权威事务、业务命令、历史/顺延与整库服务，见局部地图
```

`index.ts` 装配窗口、StorageClient（启动保护失败时显示副本位置与重试/退出）与 SmartInputService；`storage/worker.ts` 装配 SQLite 与 workspace 服务。业务规则由 `workspace → domain / shared/contracts` 消费，持久化通过 storage 落地。storage 的底层适配器不依赖 workspace；worker 是跨层组合入口。

main 只接受唯一窗口主 frame 的已知请求。云端 HTTP 只在 main 的独立智能通道中发生，从不进入存储 worker 串行队列。renderer 无任意路径、SQL、shell 或原始 IPC。运行时诊断来自真实存储 worker，失败不回退浏览器 mock。`com.goalloom.desktop` 与默认 `appData/Goalloom` 是稳定身份/数据目录。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
