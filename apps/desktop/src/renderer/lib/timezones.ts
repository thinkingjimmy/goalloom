/**
 * [INPUT]: IANA 时区名。
 * [OUTPUT]: gmtOffset —— 当前时刻的 GMT 偏移短标签（如 GMT+8），无效时区返回空串。
 * [POS]: renderer 时区展示工具，供初始配置选择器与设置日历只读行共用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export function gmtOffset(zone: string): string {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value ?? '' }
  catch { return '' }
}
