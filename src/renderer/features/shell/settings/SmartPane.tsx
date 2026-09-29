/**
 * [INPUT]: useAi 状态与动作、跳转到其他设置分类的回调。
 * [OUTPUT]: 「设置 › 智能输入」：功能总开关状态卡与处理服务单选（只列能运行 Jev 的服务）。
 * [POS]: settings 的智能输入分类；只管功能本身，Key 与服务在「AI 服务」里管理；已有用户在此启用，不重复向导。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { smartMessages as t } from '../../../i18n'
import type { Ai } from '../../../state/ai'
import { FeatureHero, ProviderChoice } from './FeatureControls'
import type { Section } from './Settings'

export function SmartPane({ ai, goto }: { ai: Ai; goto: (section: Section) => void }) {
  if (!ai.status) return <p className="settings-footnote">{t.testing}</p>
  return <>
    <FeatureHero ai={ai} feature="smart" label={t.sectionTitle} icon="smart" goto={goto} />
    <ProviderChoice ai={ai} feature="smart" goto={goto} />
  </>
}
