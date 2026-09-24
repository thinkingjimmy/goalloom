/**
 * [INPUT]: 本目录的西班牙语服务端分册，依赖 ../zh 的 ServerCatalog 类型。
 * [OUTPUT]: es 完整 ServerCatalog；缺键即类型错误。
 * [POS]: shared/i18n/catalogs/es 的入口，与 zh 同构，被 shared/i18n/server 装载。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ServerCatalog } from '../zh'
import { appMessages } from './app'
import { importMessages } from './import'

export const es: ServerCatalog = { ...appMessages, import: importMessages }
