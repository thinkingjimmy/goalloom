/**
 * [INPUT]: 有限 preload API、集中中文文案、Hugeicons 和 shadcn Button。
 * [OUTPUT]: 可访问的开发预览与真实存储连接状态；没有假保存或浏览器存储回退。
 * [POS]: M1 renderer 组合根；M0 未决规则不进入正式配置/业务写入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useState } from 'react'
import { Icon } from './components/icons'
import { Button } from './components/ui/button'
import { messages } from './lib/messages'

type Theme = 'system' | 'light' | 'dark'
const themes = ['system', 'light', 'dark'] as const
const themeLabels = { system: '跟随系统', light: '浅色主题', dark: '深色主题' }
const themeIcons = { system: 'system', light: 'sun', dark: 'moon' } as const

export function App() {
  const [theme, setTheme] = useState<Theme>('system')
  const [status, setStatus] = useState<string>('正在连接本地存储…')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    let active = true
    if (!window.goalloom) { setStatus(messages.missingBridge); return }
    void window.goalloom.getRuntime().then(() => {
      if (active) setStatus(messages.ready)
    }).catch(() => { if (active) setStatus(messages.storageError) })
    return () => { active = false }
  }, [])

  return <div className="app-shell">
    <header className="app-header">
      <a href="#main" className="brand" aria-label="Goalloom 首页">goalloom<span className="brand-dot" /></a>
      <div className="theme-picker" role="group" aria-label="主题">
        {themes.map(value => <Button key={value} size="icon" variant="ghost" aria-label={themeLabels[value]} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon name={themeIcons[value]} /></Button>)}
      </div>
    </header>
    <main id="main" className="welcome">
      <p className="eyebrow">{messages.foundation}</p>
      <h1>{messages.welcome}</h1>
      <p className="intro">{messages.introduction}</p>
      <ol className="horizon-strip" aria-label="从方向到行动的五个时间范围">
        {messages.horizons.map((title, index) => <li key={title}><span className="horizon-number">0{index + 1}</span><strong>{title}</strong><span className="horizon-line" /></li>)}
      </ol>
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-symbol"><Icon name="calendar" size={24} /></div>
        <div><h2 id="setup-title">{messages.preparation}</h2><p>{messages.pending}</p><p className="runtime-status" role="status">{status}</p></div>
      </section>
      <p className="privacy-note"><Icon name="shield" size={16} />{messages.privacy}</p>
    </main>
    <footer><span>{messages.tagline}</span><span>GOALLOOM · 0.1</span></footer>
  </div>
}
