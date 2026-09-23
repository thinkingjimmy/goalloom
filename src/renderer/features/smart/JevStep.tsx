/**
 * [INPUT]: useSmart、进入看板与试用 composer 回调。
 * [OUTPUT]: 首次流程的可选 Jev 步骤：轻量介绍＋同样可见的「连接 Jev」「暂时跳过」；只有选择连接才展开表单；成功后可点「试一试」填入示例。
 * [POS]: 日历确认之后、看板之前；不注册、不购买、不强制 Key，不影响日历锁定，示例在确认前不生成任务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import { smartMessages as t } from '../../i18n/smart'
import type { Smart } from '../../state/smart'
import { JevConnect } from './JevConnect'

export function JevStep({ smart, finish, tryComposer }: { smart: Smart; finish: () => void; tryComposer: () => void }) {
  const [open, setOpen] = useState(false), [connected, setConnected] = useState(false)
  return <main className="setup-page">
    <p className="eyebrow">{t.sectionTitle}</p><h1>{t.introTitle}</h1>
    <p className="intro">{t.introBody}</p>
    {!open && !connected && <div className="jev-choice">
      <button type="button" className="settings-button primary" onClick={() => setOpen(true)}>{t.connect}</button>
      <button type="button" className="settings-button" onClick={finish}>{t.skip}</button>
    </div>}
    {open && !connected && <>
      <JevConnect smart={smart} done={() => setConnected(true)} />
      <button type="button" className="text-button" onClick={finish}>{t.skip}</button>
    </>}
    {connected && <div className="jev-choice">
      <p className="field-note">{t.testOk}</p>
      <button type="button" className="settings-button primary" onClick={tryComposer}>{t.tryComposer}</button>
      <button type="button" className="settings-button" onClick={finish}>{t.enterBoard}</button>
    </div>}
  </main>
}
