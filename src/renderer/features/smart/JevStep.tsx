/**
 * [INPUT]: useSmart 与进入看板回调；setup 的 OnboardingFrame；JevConnect 表单与 JevDemo 预设示例。
 * [OUTPUT]: 首次流程第 3 步（可选）：先看预设示例（「连接 Jev」「暂时跳过」），选择连接才展开 Key 表单；测试通过即进入看板，任何时候都可跳过。
 * [POS]: 日历确认之后、看板之前；不注册、不购买、不强制 Key，不影响日历锁定；示例不调用服务、不生成任务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { messages, smartMessages as t } from '../../i18n'
import type { Smart } from '../../state/smart'
import { Button } from '../../components/ui/button'
import { OnboardingFrame } from '../setup/OnboardingFrame'
import { JevConnect } from './JevConnect'
import { JevDemo } from './JevDemo'

export function JevStep({ smart, finish }: { smart: Smart; finish: () => void }) {
  const [connecting, setConnecting] = useState(false)
  // The connect form's submit button lives in the page footer, next to the other step actions.
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const skip = <Button type="button" variant="ghost" onClick={finish}>{t.skip}</Button>
  return <OnboardingFrame step={2} label={messages.stepJev} actionsRef={setSlot}
    note={connecting ? t.connectFootnote : t.demoFootnote}
    actions={connecting
      ? <><Button type="button" variant="ghost" onClick={() => setConnecting(false)}>{t.backToDemo}</Button>{skip}</>
      : <>{skip}<Button type="button" onClick={() => setConnecting(true)}>{t.connect}</Button></>}>
    <div className="onboarding-split">
      <section className="onboarding-lead">
        <p className="onboarding-eyebrow">{t.sectionTitle}</p>
        <h1 className="onboarding-title small">{connecting ? t.connect : t.introTitle}</h1>
        {connecting ? <p className="onboarding-body">{t.connectBody}</p> : <>
          <ol className="jev-points">{t.demoPoints.map(point => <li key={point}>{point}</li>)}</ol>
          <p className="onboarding-hint">{t.demoNote}</p>
        </>}
      </section>
      {connecting
        ? <div className="onboarding-panel"><JevConnect smart={smart} done={finish} actions={submit => slot && createPortal(<Button {...submit} />, slot)} /></div>
        : <JevDemo />}
    </div>
  </OnboardingFrame>
}
