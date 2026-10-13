/**
 * [INPUT]: Whether the Google code exchange succeeded.
 * [OUTPUT]: One self-contained HTML document for the loopback tab. No remote assets.
 *          Success also opens goalloom://signed-in and offers a button if the browser blocks that navigation.
 * [POS]: The browser page at 127.0.0.1:53682/callback. Header and footer follow the public site.
 */
import { signedInUrl } from '../protocol'

export const callbackLinks = {
  home: 'https://goalloom.com/',
  board: 'https://goalloom.com/#board',
  jev: 'https://goalloom.com/#jev',
  releases: 'https://github.com/thinkingjimmy/goalloom/releases',
  repo: 'https://github.com/thinkingjimmy/goalloom',
  issues: 'https://github.com/thinkingjimmy/goalloom/issues',
  download: 'https://github.com/thinkingjimmy/goalloom/releases/latest',
} as const

export const callbackCsp = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"

const globe = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M8 12C8 18 12 22 12 22C12 22 16 18 16 12C16 6 12 2 12 2C12 2 8 6 8 12Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/><path d="M21 15H3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/><path d="M21 9H3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>`

const mark = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.1 10V17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10.4c1.6 0 2.5 1.9 1.4 3.1L12.6 14c-.5.55-1.2.55-1.7 0L8.4 11.2"/></svg>`

/** Success and failure are both in the document; `class="error"` on the root reveals the failure copy. Only success returns to the app. */
export function callbackPage(failed: boolean): string {
  const openApp = failed ? '' : `<p class="open"><a class="open-app" href="${signedInUrl}">打开 Goalloom</a></p>`
  const returnToApp = failed ? '' : `<script>try{location.href=${JSON.stringify(signedInUrl)}}catch(e){}</script>`
  return `<!doctype html><html lang="zh-CN" data-theme="light" data-platform="mac"${failed ? ' class="error"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Goalloom</title>
<script>(function(){var r=document.documentElement,q=matchMedia('(prefers-color-scheme: dark)');r.dataset.theme=q.matches?'dark':'light';r.dataset.platform=/Win/.test(navigator.platform)?'windows':'mac';q.addEventListener('change',function(){if(r.dataset.themeMode!=='chosen')r.dataset.theme=q.matches?'dark':'light'})})()</script><style>
:root {
  color-scheme: light;
  --bg: #f5f1eb; --surface: #fbf9f6; --raised: #fffdfa;
  --fg: #2b2621; --fg-soft: #4a433c; --secondary: #6f665c; --muted: #8a8076; --faint: #b3a99e;
  --line: rgba(90, 70, 50, .14); --line-strong: rgba(90, 70, 50, .2); --hairline: rgba(90, 70, 50, .08);
  --hover: rgba(70, 50, 30, .06); --focus: #547aaa;
  --stroke-c: #a47743;
  --font: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Hiragino Sans', 'Segoe UI', 'Microsoft YaHei', sans-serif;
  --edge: 120px;
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #1c1916; --surface: #24201c; --raised: #2b2621;
  --fg: #ede7df; --fg-soft: #d6cec4; --secondary: #a89e93; --muted: #857b70; --faint: #6e655c;
  --line: rgba(255, 240, 220, .13); --line-strong: rgba(255, 240, 220, .18); --hairline: rgba(255, 240, 220, .07);
  --hover: rgba(255, 240, 220, .06); --focus: #85a8d9;
  --stroke-c: #c4a06f;
}
@media (max-width: 900px) { :root { --edge: 16px; } }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { color-scheme: dark; }
}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
:where(a,button,summary):focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:6px}p{margin:0}
.site-header{display:flex;align-items:center;gap:4px}
.brand{display:inline-flex;align-items:center;gap:10px;margin-right:auto;font-size:18px;font-weight:650;letter-spacing:-.025em}
.brand-tile{width:30px;height:30px;border-radius:8px;background:var(--raised);color:var(--fg);display:grid;place-items:center;box-shadow:0 0 0 1px var(--hairline),0 1px 2px rgba(0,0,0,.1)}
.site-nav{display:flex;align-items:center;gap:2px}
.nav-link{height:36px;padding:0 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;font-size:14px;color:var(--fg-soft);white-space:nowrap}
.nav-link:hover{background:var(--hover);color:var(--fg)}.nav-icon{width:36px;padding:0;justify-content:center}
.nav-cta{height:36px;margin-left:8px;padding:0 16px 0 14px;border-radius:9px;display:inline-flex;align-items:center;gap:8px;background:var(--fg);color:var(--bg);font-size:14px;font-weight:600;white-space:nowrap}
.nav-cta:hover{background:var(--fg-soft)}
.menu-pop{position:relative}.menu-pop>summary{list-style:none;cursor:pointer}.menu-pop>summary::-webkit-details-marker{display:none}
.float-bar{height:60px;padding:0 48px;background:color-mix(in srgb,var(--bg) 84%,transparent);border-bottom:1px solid var(--line)}
.site-footer{height:80px;padding:0 var(--edge);border-top:1px solid var(--hairline);display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--secondary)}
.site-footer nav{display:flex;align-items:center;gap:18px}.site-footer a:hover{color:var(--fg)}
.lang-button{height:32px;padding:0 12px;border:1px solid var(--line-strong);border-radius:8px;background:var(--raised);color:var(--fg);display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}
@media (max-width:900px){.desktop-only{display:none!important}.menu-pop .nav-link>span{display:none}.float-bar{padding:0 8px 0 16px}.site-footer{height:auto;padding:24px 16px}.site-footer nav a{display:none}}
main{flex:1;display:grid;place-items:center;padding:48px 16px;text-align:center}
.err{display:none}.error .ok{display:none}.error .err{display:revert}
.zh{font-size:24px;font-weight:600;letter-spacing:-.02em}.en{margin-top:6px;font-size:15px;color:var(--secondary)}.error .zh{color:var(--stroke-c)}
.open{margin-top:22px}.open-app{height:40px;padding:0 18px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:var(--fg);color:var(--bg);font-size:15px;font-weight:600}.open-app:hover{background:var(--fg-soft)}
</style></head><body>
<header class="site-header float-bar"><a class="brand" href="${callbackLinks.home}" aria-label="Goalloom 首页"><span class="brand-tile">${mark}</span>Goalloom</a><nav class="site-nav" aria-label="主导航"><a class="nav-link desktop-only" href="${callbackLinks.board}">目标看板</a><a class="nav-link desktop-only" href="${callbackLinks.jev}">智能输入</a><a class="nav-link desktop-only" href="${callbackLinks.releases}">版本发布</a><a class="nav-link desktop-only" href="${callbackLinks.repo}">GitHub</a><details class="menu-pop"><summary class="nav-link" aria-label="语言: 简体中文">${globe}<span>简体中文</span></summary></details><button type="button" class="nav-link nav-icon" aria-label="切换主题" onclick="var r=document.documentElement;r.dataset.themeMode='chosen';r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg></button><a class="nav-cta" href="${callbackLinks.download}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.75C12 3.75 13.5 1.75 15.5 1.75C15.5 3.75 14 5.75 12 5.75Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/><path d="M12.5 8.09001C11.9851 8.09001 11.5867 7.92646 11.1414 7.74368C10.5776 7.51225 9.93875 7.25 8.89334 7.25C7.02235 7.25 4 8.74945 4 12.7495C4 17.4016 7.10471 22.25 9.10471 22.25C9.77426 22.25 10.3775 21.9871 10.954 21.7359C11.4815 21.5059 11.9868 21.2857 12.5 21.2857C13.0132 21.2857 13.5185 21.5059 14.046 21.7359C14.6225 21.9871 15.2257 22.25 15.8953 22.25C17.2879 22.25 18.9573 19.8992 20 16.9008C18.3793 16.2202 17.338 14.618 17.338 12.75C17.338 11.121 18.2036 10.0398 19.5 9.25C18.5 7.75 17.0134 7.25 15.9447 7.25C14.8993 7.25 14.2604 7.51225 13.6966 7.74368C13.2514 7.92646 13.0149 8.09001 12.5 8.09001Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/></svg>下载</a></nav></header>
<main><div><p class="zh ok">已登录，可以关闭此页面</p><p class="en ok">Signed in. You can close this tab.</p>${openApp}<p class="zh err">登录未完成</p><p class="en err">Sign-in didn't finish. Please try again in the app.</p></div></main>
<footer class="site-footer"><span>© 2026 Goalloom</span><nav aria-label="页脚链接"><a href="${callbackLinks.releases}">版本发布</a><a href="${callbackLinks.repo}">GitHub</a><a href="${callbackLinks.issues}">反馈</a><details class="menu-pop"><summary class="lang-button" aria-label="语言: 简体中文">${globe}<span>简体中文</span></summary></details></nav></footer>
${returnToApp}</body></html>`
}
