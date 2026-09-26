/**
 * [INPUT]: 主进程固定偏好路径、系统首选语言列表、shared/i18n 的解析规则与服务端文案切换。
 * [OUTPUT]: LanguagePreference：读取/原子保存语言偏好（system | Locale），解析当前 Locale 并设置 main 的服务端文案；state 供 renderer 读取。
 * [POS]: 应用级设备偏好，与窗口偏好同级、不写入工作区，跨重置/恢复保留；worker 同步由组合根负责。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { atomicJson } from '../storage/atomic-json'
import { languageSchema, type LanguageState } from '../../shared/contracts/runtime'
import { resolveLocale, systemLocale, type Language, type Locale } from '../../shared/i18n/locale'
import { setServerLocale } from '../../shared/i18n/server'

const preferenceSchema = z.strictObject({ language: languageSchema })

export class LanguagePreference {
  private language: Language = 'system'
  constructor(private readonly path: string, private readonly systemLanguages: () => readonly string[]) {}
  get locale(): Locale { return resolveLocale(this.language, this.systemLanguages()) }
  get state(): LanguageState { return { language: this.language, locale: this.locale, system: systemLocale(this.systemLanguages()) } }
  async load(): Promise<Locale> {
    try { this.language = preferenceSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))).language } catch { /* Missing or invalid file: follow the system. */ }
    setServerLocale(this.locale)
    return this.locale
  }
  async set(language: Language): Promise<LanguageState> {
    await atomicJson(this.path, preferenceSchema.parse({ language }))
    this.language = language
    setServerLocale(this.locale)
    return this.state
  }
}
