/**
 * [INPUT]: Trusted window lifecycle, token-bound renderer drain replies and native quit/update intent.
 * [OUTPUT]: Autosave drains before closing; failed drains keep the window and storage alive. Composer drafts retain their confirmation.
 * [POS]: Native close coordinator; storage drains only after accepted window closure in will-quit.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { app, autoUpdater, dialog, ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron'
import { serverText } from '../../shared/i18n/server'
import { closeRequestEvent, closeReplyEvent, closeReplySchema } from '../../shared/contracts/window-close'
import { isTrustedFrameUrl } from '../security'

export function protectWindowClose(window: BrowserWindow, trustedUrl: string): void {
  let intent: 'window' | 'quit' | 'update' = 'window'
  let approved = false, token: string | null = null
  let timeout: ReturnType<typeof setTimeout> | undefined
  const cancel = () => { clearTimeout(timeout); token = null; approved = false; intent = 'window' }
  const quit = () => { if (intent !== 'update') intent = 'quit' }
  const update = () => { intent = 'update' }
  app.on('before-quit', quit)
  autoUpdater.on('before-quit-for-update', update)
  window.on('close', event => {
    if (approved) { approved = false; return }
    event.preventDefault()
    if (token) return
    token = randomUUID()
    window.webContents.send(closeRequestEvent, { token })
    // A missing/crashed renderer cannot authorize closing. A later close request can try again.
    timeout = setTimeout(cancel, 15_000)
  })
  const receive = (event: IpcMainEvent, input: unknown) => {
    if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isTrustedFrameUrl(event.senderFrame.url, trustedUrl)) return
    const reply = closeReplySchema.safeParse(input)
    if (!reply.success || !token || reply.data.token !== token) return
    clearTimeout(timeout); token = null
    if (!reply.data.ready) { cancel(); return }
    approved = true
    if (intent === 'update' && process.platform === 'darwin') autoUpdater.quitAndInstall()
    else if (intent !== 'window') app.quit()
    else window.close()
  }
  ipcMain.on(closeReplyEvent, receive)
  window.webContents.on('did-start-navigation', details => { if (details.isMainFrame && !details.isSameDocument) cancel() })
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', title: serverText().dialogs.unsavedTitle, message: serverText().dialogs.unsavedMessage,
      buttons: [serverText().dialogs.keepEditing, serverText().dialogs.discardAndClose], defaultId: 0, cancelId: 0, noLink: true,
    })
    if (choice === 1) event.preventDefault()
    else cancel()
  })
  window.once('closed', () => {
    clearTimeout(timeout); ipcMain.removeListener(closeReplyEvent, receive)
    app.removeListener('before-quit', quit); autoUpdater.removeListener('before-quit-for-update', update)
  })
}
