/**
 * [INPUT]: Current native dialog copy from the loopback review server and an isolated temporary profile.
 * [OUTPUT]: The OS-native startup/unsaved dialogs with the same options as main/index.ts.
 * [POS]: Review capture fixture; no application storage, credentials or account modules are loaded.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, dialog } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
app.setName('Goalloom Error UI Review')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'goalloom-error-ui-native-')))
void app.whenReady().then(async () => {
const { dialogs: t, storage, detail } = await fetch('http://127.0.0.1:4179/__native-cases').then(response => response.json())
const cases = ['openFailed', 'backupBeforeUpgradeFailed', 'upgradeCheckFailed', 'changedAfterBackup', 'upgradeFailed', 'readOnlyFailed', 'newerVersion', 'unsupportedVersion', 'incompleteSchema', 'unreadable', 'corruptRecords', 'initFailed', 'unsupportedDatabase', 'backupMismatch', 'integrityFailed', 'danglingReferences', 'startupUnavailable', 'unsaved']
for (const code of cases) {
  process.stdout.write(`native-${code}\n`)
  await dialog.showMessageBox(code === 'unsaved'
    ? { type: 'question', title: t.unsavedTitle, message: t.unsavedMessage, buttons: [t.keepEditing, t.discardAndClose], defaultId: 0, cancelId: 0, noLink: true }
    : { type: 'error', title: t.startupTitle, message: code === 'startupUnavailable' ? t.startupUnavailable : storage[code], detail, buttons: [t.retry, t.quit], defaultId: 0, cancelId: 1, noLink: true })
}
app.quit()
})
