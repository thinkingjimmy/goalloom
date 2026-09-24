/**
 * [INPUT]: 当前方向草稿与修改回调、下一步/跳过回调。
 * [OUTPUT]: 首次流程第 1 步：写下三个月的方向（可点示例填入），Enter 或「下一步」前进，「先跳过」不带方向前进。
 * [POS]: features/setup 的方向步；只保存会话草稿，日历确认前不写入任何条目。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { messages } from '../../i18n'
import { Button } from '../../components/ui/button'
import { OnboardingFrame } from './OnboardingFrame'

export const directionLimit = 500

export function DirectionStep({ value, change, next }: { value: string; change: (value: string) => void; next: (direction: string) => void }) {
  const direction = value.trim()
  return <OnboardingFrame step={0} label={messages.stepDirection} note={messages.directionNote}
    actions={<>
      <Button type="button" variant="ghost" onClick={() => next('')}>{messages.skipDirection}</Button>
      <Button type="button" disabled={!direction} onClick={() => next(direction)}>{messages.nextStep}</Button>
    </>}>
    <section className="onboarding-hero">
      <p className="onboarding-eyebrow">{messages.welcome}</p>
      <h1 className="onboarding-title">{messages.directionTitle}</h1>
      <input className="direction-input" autoFocus value={value} maxLength={directionLimit} aria-label={messages.directionLabel} placeholder={messages.directionPlaceholder}
        onChange={event => change(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && direction) { event.preventDefault(); next(direction) } }} />
      <div className="direction-examples">
        <span>{messages.directionExamplesLabel}</span>
        {messages.directionExamples.map(example => <button key={example} type="button" className="direction-example" onClick={() => change(example)}>{example}</button>)}
      </div>
    </section>
  </OnboardingFrame>
}
