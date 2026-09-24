/**
 * [INPUT]: desktopApi 的语言偏好读写；i18n 的 setLocale；浏览器语言（无桥接时的回退）。
 * [OUTPUT]: startLanguage（首次渲染前装载，避免闪出错误语言）与 useLanguage（当前偏好/系统语言与 choose）。
 * [POS]: renderer 语言偏好状态；偏好归 main 所有（工作区之外，重置/恢复保留），这里只镜像并即时切换界面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import type { LanguageState } from '../../shared/contracts/runtime'
import { systemLocale, type Language } from '../../shared/i18n/locale'
import { setLocale } from '../i18n'

export async function startLanguage(): Promise<void> {
  const state = await window.goalloom?.getLanguage().catch(() => null)
  setLocale(state?.locale ?? systemLocale(navigator.languages))
}

export function useLanguage(): { state: LanguageState | null; choose: (language: Language) => Promise<void> } {
  const [state, setState] = useState<LanguageState | null>(null)
  useEffect(() => { void window.goalloom?.getLanguage().then(setState).catch(() => undefined) }, [])
  const choose = async (language: Language) => {
    if (!window.goalloom) return
    const next = await window.goalloom.setLanguage(language)
    setState(next)
    setLocale(next.locale)
  }
  return { state, choose }
}
