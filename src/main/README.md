# main/

> 父级：[项目地图](../../README.md)。Electron 组合与本地安全边界。

```text
main/
├── index.ts       # 单实例、窗口、只读运行时 IPC 与内部 worker 生命周期
├── security.ts    # 本地协议白名单、生产 CSP、权限/导航/下载拒绝
└── storage/       # SQLite 基础库；详见 storage/README.md
```

main 只接受唯一窗口主 frame 的已知请求。renderer 无任意路径、SQL、shell 或原始 IPC。运行时诊断来自真实存储 worker，失败不回退浏览器 mock。`com.goalloom.desktop` 与 `appData/Goalloom` 是稳定身份/数据目录；业务数据库迁移尚未建立。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
