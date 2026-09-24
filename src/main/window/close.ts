/**
 * [INPUT]: 可信工作窗口的 beforeunload 取消信号；Electron 原生确认框与当前语言的 serverText().dialogs。
 * [OUTPUT]: 默认保留未保存草稿，主动选择放弃后才继续关闭窗口。
 * [POS]: 原生窗口退出保护；存储在所有窗口确认关闭后的 will-quit 阶段排空。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { dialog, type BrowserWindow } from 'electron'
import { serverText } from '../../shared/i18n/server'

export function protectWindowClose(window: BrowserWindow): void {
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: serverText().dialogs.unsavedTitle, message: serverText().dialogs.unsavedMessage,
      buttons: [serverText().dialogs.keepEditing, serverText().dialogs.discardAndClose], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (choice === 1) event.preventDefault()
  })
}
