/**
 * [INPUT]: Has no dependencies
 * [OUTPUT]: Exports THEME_KEY, THEME_QUERY and BOOT (the inline pre-paint script)
 * [POS]: components' pre-paint contract shared by the server document and the client theme runtime. It must not live
 *        in a "use client" module: the server would inline a client-reference stub instead of this string.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

export const THEME_KEY = 'goalloom-theme'
export const THEME_QUERY = '(prefers-color-scheme: dark)'

// Theme and platform are facts of the first frame: a dark-mode visitor must not see a light flash, and a Windows
// visitor must not read "Download for macOS" before an effect corrects it. Without JS: light theme, macOS button.
export const BOOT = `(function(){var d=document.documentElement,m="auto";try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(s==="light"||s==="dark")m=s;}catch(e){}var y=matchMedia(${JSON.stringify(THEME_QUERY)}).matches?"dark":"light";d.dataset.themeMode=m;d.dataset.theme=m==="auto"?y:m;var u=navigator.userAgent||"";d.dataset.platform=/Windows|Win64|Win32/i.test(u)?"windows":"mac";})();`
