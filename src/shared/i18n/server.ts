/**
 * [INPUT]: shared/i18n 的 Locale；catalogs/* 五种语言的服务端文案。
 * [OUTPUT]: setServerLocale 与 serverText()：main、存储 worker 与 domain 在生成错误、警告、操作标签和原生对话框时读取当前语言。
 * [POS]: 每个进程/线程各自持有的当前语言；main 在启动与切换时设置并同步 worker，renderer 同步设置以识别服务端文案。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { Locale } from './locale'
import { zh, type ServerCatalog } from './catalogs/zh'
import { en } from './catalogs/en'
import { ja } from './catalogs/ja'
import { es } from './catalogs/es'
import { fr } from './catalogs/fr'

const catalogs: Record<Locale, ServerCatalog> = { zh, en, ja, es, fr }
let current: ServerCatalog = zh

export function setServerLocale(locale: Locale): void { current = catalogs[locale] }
// Read at the moment a message is produced; never cache the result across a language change.
export function serverText(): ServerCatalog { return current }
