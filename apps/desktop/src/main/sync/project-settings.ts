/**
 * [INPUT]: Winning sync_settings rows and the device language, keychain and renderer window.
 * [OUTPUT]: Live application of those rows. Workspace columns are already projected in SQL.
 * [POS]: Desktop settings projection. API keys are delivered or deferred in the encrypted vault before projection; fingerprints are not written as keys. Renderer preferences and AI status update live.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { isRendererSettingKey, isSecretFingerprint, isSecretSettingKey, isWorkspaceSettingKey, parseSetting } from '@goalloom/contracts'
import type { Language } from '../../shared/i18n/locale'
import type { LanguageState } from '../../shared/contracts/runtime'
import type { SmartInputService } from '../smart/service'
import type { SettingRow } from '@goalloom/store-core'

export async function projectSettingRows(rows: SettingRow[], deps: {
  language: { state: LanguageState; set: (language: Language) => Promise<LanguageState> }
  notifyLanguage: (state: LanguageState) => void
  smart: SmartInputService
  notifyDevicePrefs: (entries: { key: string; value: unknown }[]) => void
  notifyAi?: () => void
}): Promise<string[]> {
  const applied: string[] = []
  const device: { key: string; value: unknown }[] = []
  let ai = false
  for (const row of rows) {
    let setting: ReturnType<typeof parseSetting>
    try { setting = parseSetting(row.key, row.value) } catch { continue }
    try {
      if (isWorkspaceSettingKey(setting.key)) applied.push(setting.key)
      else if (setting.key === 'language') {
        if (deps.language.state.language !== setting.value) deps.notifyLanguage(await deps.language.set(setting.value))
        applied.push(setting.key)
      } else if (setting.key.startsWith('ai.')) {
        ai = true
        if (!(isSecretSettingKey(setting.key) && isSecretFingerprint(setting.value))) {
          await deps.smart.applyRemoteSetting(setting.key, setting.value)
        }
        applied.push(setting.key)
      } else if (isRendererSettingKey(setting.key)) {
        device.push({ key: setting.key, value: setting.value })
        applied.push(setting.key)
      }
    } catch { /* Leave the row unmarked so the next pull tries again. */ }
  }
  if (device.length) deps.notifyDevicePrefs(device)
  if (ai) deps.notifyAi?.()
  return applied
}
