/**
 * [INPUT]: Current server language copy and callbacks that open Settings › About (optionally starting a manual update check).
 * [OUTPUT]: installMenu: macOS application menu whose About/Check for Updates items open the in-app About page.
 * [POS]: Replaces Electron's default menu on macOS only, whose About panel shows the Electron binary in development; other platforms keep their default menu.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, Menu } from 'electron'
import { serverText } from '../../shared/i18n/server'

export function installMenu(openAbout: (check: boolean) => void): void {
  if (process.platform !== 'darwin') return
  const t = serverText().menu
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [
      { label: t.about, click: () => openAbout(false) },
      { label: t.checkUpdates, click: () => openAbout(true) },
      { type: 'separator' },
      { role: 'services', label: t.services },
      { type: 'separator' },
      { role: 'hide', label: t.hide },
      { role: 'hideOthers', label: t.hideOthers },
      { role: 'unhide', label: t.showAll },
      { type: 'separator' },
      { role: 'quit', label: t.quit },
    ] },
    { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
}
