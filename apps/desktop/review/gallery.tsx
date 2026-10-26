/**
 * [INPUT]: Source-linked scenario inventory and isolated product iframes.
 * [OUTPUT]: Searchable, deep-linkable error review with style/theme/locale controls and local review marks.
 * [POS]: Development-only navigation; the product UI is owned by the iframe's production components.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { scenarios, groups, findScenario } from './catalog'
import { Icon } from '../src/renderer/components/icons'
import './gallery.css'

function Gallery() {
  const hash = () => decodeURIComponent(location.hash.slice(1))
  const [selected, setSelected] = useState(() => findScenario(hash()).id)
  const [query, setQuery] = useState(''), [group, setGroup] = useState('全部')
  const [style, setStyle] = useState('paper'), [theme, setTheme] = useState('light'), [locale, setLocale] = useState('zh')
  const [reload, setReload] = useState(0), [status, setStatus] = useState('准备真实 UI…')
  const [marks, setMarks] = useState<Record<string, boolean>>(() => { try { return JSON.parse(sessionStorage.getItem('goalloom-review-marks') ?? '{}') } catch { return {} } })
  const current = findScenario(selected)
  const filtered = scenarios.filter(scene => (group === '全部' || scene.group === group) && `${scene.id} ${scene.group} ${scene.title} ${scene.message}`.toLowerCase().includes(query.toLowerCase()))
  const index = scenarios.findIndex(scene => scene.id === selected)
  const url = `/app.html?${new URLSearchParams({ scene: selected, style, theme, locale, replay: String(reload) })}`
  useEffect(() => {
    const change = () => setSelected(findScenario(hash()).id)
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => { setStatus('准备真实 UI…') }, [url])
  useEffect(() => { document.querySelector('nav button[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }) }, [selected])
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== document.querySelector('iframe')?.contentWindow) return
      if (event.data?.type === 'goalloom-review-ready') setStatus('真实 UI · 可交互')
      if (event.data?.type === 'goalloom-review-error') setStatus(`场景未就绪：${event.data.message}`)
    }
    window.addEventListener('message', ready)
    return () => window.removeEventListener('message', ready)
  }, [])
  const select = (id: string) => { location.hash = id; setSelected(id) }
  const mark = () => { const next = { ...marks, [selected]: !marks[selected] }; setMarks(next); sessionStorage.setItem('goalloom-review-marks', JSON.stringify(next)) }
  return <div className="review-layout">
    <aside className="review-sidebar">
      <a className="review-brand" href="#board-saveUnknown">Goalloom <span>UI REVIEW</span></a>
      <h1>报错与异常状态</h1>
      <p className="review-intro">每个场景使用产品当前的组件与样式。看板报错保留完整看板。</p>
      <label className="review-search"><span>搜索场景</span><input type="search" placeholder="名称、文案或错误代码" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="review-filter"><span>功能</span><select value={group} onChange={event => setGroup(event.target.value)}>{['全部', ...groups].map(value => <option key={value}>{value}</option>)}</select></label>
      <div className="review-progress">{filtered.length} 个场景 <span>{Object.values(marks).filter(Boolean).length} / {scenarios.length} 已看</span></div>
      <nav aria-label="报错场景">{groups.map(name => {
        const rows = filtered.filter(scene => scene.group === name)
        return rows.length ? <section key={name}><h2>{name}<span>{rows.length}</span></h2>{rows.map(scene => <button key={scene.id} aria-current={selected === scene.id ? 'page' : undefined} onClick={() => select(scene.id)}><span className="review-mark" aria-label={marks[scene.id] ? '已看' : '未看'}>{marks[scene.id] ? <Icon name="check" size={12} /> : '·'}</span><span>{scene.title}</span></button>)}</section> : null
      })}</nav>
      <p className="review-private">独立示例工作区 · 无数据库 / 网络请求</p>
    </aside>
    <main className="review-main">
      <header className="review-toolbar"><div><p>{current.group} <span> / {index + 1} of {scenarios.length}</span></p><h2>{current.title}</h2></div><div className="review-controls">
        <label>外观<select aria-label="外观" value={style} onChange={event => setStyle(event.target.value)}><option value="paper">Paper</option><option value="minimal">Minimal</option><option value="macos">macOS 27</option></select></label>
        <label>主题<select aria-label="主题" value={theme} onChange={event => setTheme(event.target.value)}><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <button onClick={() => setReload(value => value + 1)}>重播</button><button className={marks[selected] ? 'review-done' : ''} onClick={mark}>{marks[selected] && <Icon name="check" size={12} />}{marks[selected] ? '已看' : '标记已看'}</button>
      </div></header>
      <div className="review-stage"><iframe key={url} title={`${current.group} · ${current.title}`} src={url} /></div>
      <footer className="review-footer"><div><span className={status.startsWith('场景未') ? 'review-error' : 'review-status'}>{status}</span><code>{current.id}</code></div><div><button disabled={index === 0} onClick={() => select(scenarios[index - 1]!.id)}>上一个</button><button disabled={index === scenarios.length - 1} onClick={() => select(scenarios[index + 1]!.id)}>下一个</button><a href={url} target="_blank" rel="noreferrer">单独打开 <Icon name="forward" size={12} /></a></div></footer>
      <details className="review-evidence"><summary>场景文案与源码</summary>{current.message && <p>{current.message}</p>}<code>{current.source}</code><p>只注入错误状态和示例数据。错误的布局、操作和上下文均由实际产品组件渲染。原生弹窗使用本机实际截图，固定为中文系统外观；其他场景可切换语言、外观和主题。</p><label>产品语言<select disabled={current.surface === 'native'} value={locale} onChange={event => setLocale(event.target.value)}><option value="zh">简体中文</option><option value="en">English</option><option value="ja">日本語</option><option value="es">Español</option><option value="fr">Français</option></select></label></details>
    </main>
  </div>
}
createRoot(document.getElementById('root')!).render(<Gallery />)
