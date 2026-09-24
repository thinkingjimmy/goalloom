/**
 * [INPUT]: 本目录的服务端分册。
 * [OUTPUT]: zh 完整 ServerCatalog 与其类型；其他语言必须实现同一类型，缺键即类型错误。
 * [POS]: shared/i18n/catalogs 的源语言入口，被 shared/i18n/server 装载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { appMessages } from './app'
import { importMessages } from './import'

export const zh = { ...appMessages, import: importMessages }
export type ServerCatalog = typeof zh
