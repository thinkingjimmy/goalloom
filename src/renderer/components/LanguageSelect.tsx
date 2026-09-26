/**
 * [INPUT]: state/language 的偏好与 choose；shared/i18n 的语言列表与原生语言名；当前文案。
 * [OUTPUT]: LanguageSelect：shadcn Select 下拉（跟随系统 · 系统语言名 / 五种语言原生名），选择即切换并写入设备偏好。
 * [POS]: 首次配置页与设置外观共用的语言控件；语言名始终用各自原文，任何界面语言下都能认出自己的语言。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { languages, localeNames, type Language } from '../../shared/i18n/locale'
import { messages } from '../i18n'
import { useLanguage } from '../state/language'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export function LanguageSelect({ className, id }: { className?: string; id?: string }) {
  const { state, choose } = useLanguage()
  return <Select value={state?.language ?? 'system'} disabled={!state} onValueChange={value => void choose(value as Language)}>
    <SelectTrigger id={id} className={className} aria-label={messages.language}><SelectValue /></SelectTrigger>
    <SelectContent>
      {languages.map(value => <SelectItem key={value} value={value}>
        {value === 'system' ? `${messages.systemLanguage}${state ? ` · ${localeNames[state.system]}` : ''}` : localeNames[value]}
      </SelectItem>)}
    </SelectContent>
  </Select>
}
