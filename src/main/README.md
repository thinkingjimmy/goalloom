# main/

> 父级：[项目地图](../../README.md)。Electron 组合与本地安全边界。

```text
main/
├── index.ts       # 单实例、窗口退出确认后排空持久化 worker
├── ipc.ts         # 固定读写入口、来源检查和原生文件对话框
├── storage-client.ts # 内部请求关联与 worker 故障隔离
├── window-state.ts # 工作区之外的窗口尺寸/位置偏好，跨屏恢复不出界
├── window-close.ts # 未保存草稿的原生确认，默认继续编辑；取消退出不关数据库
├── security.ts    # 本地协议白名单、生产 CSP、权限/导航/下载拒绝
└── storage/       # SQLite 基础库；详见 storage/README.md
```

main 只接受唯一窗口主 frame 的已知请求。renderer 无任意路径、SQL、shell 或原始 IPC。运行时诊断来自真实存储 worker，失败不回退浏览器 mock。`com.goalloom.desktop` 与默认 `appData/Goalloom` 是稳定身份/数据目录。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
