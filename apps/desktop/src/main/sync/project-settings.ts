/**
 * [INPUT]: Winning sync_settings rows and the device language, keychain and renderer window.
 * [OUTPUT]: Live application of those rows. Workspace columns are already projected in SQL.
 * [POS]: Desktop side of settings sync. It re-seals API keys with the local cipher and does not emit another op.
 */
import { isRendererSettingKey, isWorkspaceSettingKey, parseSetting } from '@goalloom/contracts'
import type { Language } from '../../shared/i18n/locale'
import type { LanguageState } from '../../shared/contracts/runtime'
import type { SmartInputService } from '../smart/service'
import type { SettingRow } from '@goalloom/store-core'

export async function projectSettingRows(rows: SettingRow[], deps: {
  language: { state: LanguageState; set: (language: Language) => Promise<LanguageState> }
  notifyLanguage: (state: LanguageState) => void
  smart: SmartInputService
  notifyDevicePrefs: (entries: { key: string; value: unknown }[]) => void
}): Promise<string[]> {
  const applied: string[] = []
  const device: { key: string; value: unknown }[] = []
  for (const row of rows) {
    let setting: ReturnType<typeof parseSetting>
    try { setting = parseSetting(row.key, row.value) } catch { continue }
    try {
      if (isWorkspaceSettingKey(setting.key)) applied.push(setting.key)
      else if (setting.key === 'language') {
        if (deps.language.state.language !== setting.value) deps.notifyLanguage(await deps.language.set(setting.value))
        applied.push(setting.key)
      } else if (setting.key.startsWith('ai.')) {
        await deps.smart.applyRemoteSetting(setting.key, setting.value)
        applied.push(setting.key)
      } else if (isRendererSettingKey(setting.key)) {
        device.push({ key: setting.key, value: setting.value })
        applied.push(setting.key)
      }
    } catch { /* Leave the row unmarked so the next pull tries again. */ }
  }
  if (device.length) deps.notifyDevicePrefs(device)
  return applied
}
