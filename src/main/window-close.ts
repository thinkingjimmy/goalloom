/**
 * [INPUT]: 可信工作窗口的 beforeunload 取消信号；Electron 原生确认框。
 * [OUTPUT]: 默认保留未保存草稿，主动选择放弃后才继续关闭窗口。
 * [POS]: 原生窗口退出保护；存储在所有窗口确认关闭后的 will-quit 阶段排空。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { dialog, type BrowserWindow } from 'electron'

export function protectWindowClose(window: BrowserWindow): void {
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: '未保存的修改', message: '说明或标题尚未保存，是否放弃修改并关闭？',
      buttons: ['继续编辑', '放弃修改并关闭'], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (choice === 1) event.preventDefault()
  })
}
