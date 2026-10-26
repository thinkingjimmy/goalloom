/**
 * [INPUT]: One scenario, production React components and the isolated preload fixture.
 * [OUTPUT]: Real board UI and the real owning modal, popover or settings pane.
 * [POS]: Review composition; product components and styles are imported unchanged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { App } from '../src/renderer/App'
import { Settings, type Section } from '../src/renderer/features/shell/settings/Settings'
import { ItemDetail } from '../src/renderer/features/items/ItemDetail'
import { Backlog } from '../src/renderer/features/board/Backlog'
import { NestingPicker } from '../src/renderer/features/board/NestingPicker'
import { CommandPalette } from '../src/renderer/features/shell/CommandPalette'
import { Composer } from '../src/renderer/features/composer/Composer'
import { Seeded } from '../src/renderer/features/composer/Seeded'
import { ReviewDrawer } from '../src/renderer/features/insight/ReviewDrawer'
import { reviewDue } from '../src/renderer/features/insight/review'
import { SyncPasswordDialog } from '../src/renderer/features/shell/settings/SyncPasswordDialog'
import { SyncRecovery } from '../src/renderer/features/shell/settings/SyncRecovery'
import { SyncSignOutDialog } from '../src/renderer/features/shell/settings/SyncSignOutDialog'
import { LinkText } from '../src/renderer/components/links/LinkText'
import { Modal } from '../src/renderer/components/Modal'
import { useWorkspace } from '../src/renderer/state/use-workspace'
import { useAi } from '../src/renderer/state/ai'
import { useFlows } from '../src/renderer/state/flows'
import { useShortcuts } from '../src/renderer/state/shortcuts'
import { settingsMessages, messages } from '../src/renderer/i18n'
import type { Scenario } from './catalog'
import type { Snapshot } from '../src/shared/contracts/queries'

export function Scene({ scenario: s, initial }: { scenario: Scenario; initial: Snapshot }) {
  const [open, setOpen] = useState(true)
  const workspace = useWorkspace(() => 'visible'), ai = useAi(initial.workspace.generation)
  const snapshot = workspace.snapshot ?? initial
  const flows = useFlows(snapshot, snapshot.items), { bindings } = useShortcuts()
  const close = () => setOpen(false), none = () => undefined
  const section: Section = s.surface === 'feature' ? 'smart' : s.surface === 'ai' || s.surface === 'provider' || s.surface === 'hosted' ? 'ai' : s.surface === 'sync' ? 'sync' : s.surface === 'shortcuts' ? 'shortcuts' : s.surface === 'items' ? s.code === 'trash' ? 'trash' : 'done' : s.code === 'update' ? 'about' : 'backup'
  return <><App />{open && <>
    {['settings', 'items', 'sync', 'ai', 'feature', 'hosted', 'provider', 'shortcuts'].includes(s.surface) && <Settings snapshot={snapshot} ai={ai} initial={section} submit={workspace.submit} refresh={workspace.refresh} busy={workspace.busy} select={none} close={close} />}
    {s.surface === 'nest' && <NestingPicker itemId="today-two" snapshot={snapshot} candidates={snapshot.items} submit={workspace.submit} close={close} />}
    {['detail', 'assist'].includes(s.surface) && <ItemDetail itemId="today" generation={snapshot.workspace.generation} revision={snapshot.workspace.revision} blocked={false} write={workspace.write} retryWrite={workspace.retryWrite} flows={flows} candidates={snapshot.items} today="2026-10-23" calendar={snapshot.workspace.calendar!} observedAt={snapshot.observedAt} close={close} initialAssistance={s.surface === 'assist'} />}
    {s.surface === 'backlog' && <Backlog horizon="week" revision={1} submit={workspace.submit} busy={false} close={close} select={none} />}
    {s.surface === 'search' && <CommandPalette close={close} select={none} undo={none} canUndo={false} create={none} openSettings={none} bindings={bindings} calendar={snapshot.workspace.calendar} observedAt={snapshot.observedAt} />}
    {s.surface === 'composer' && <Composer snapshot={snapshot} flows={flows} ai={ai} open submit={workspace.submit} busy={workspace.busy} error={workspace.error} errorCode={workspace.errorCode} close={close} openSettings={none} />}
    {s.surface === 'password' && <SyncPasswordDialog working={false} syncing={false} error={settingsMessages.sync.errors.storage} run={async () => false} close={close} />}
    {s.surface === 'recovery' && <SyncRecovery working={false} error={settingsMessages.sync.errors.storage} run={async () => false} close={close} />}
    {s.surface === 'signout' && <SyncSignOutDialog email="review@example.test" canClear confirm={async () => false} close={close} />}
    {s.surface === 'review' && <ReviewDrawer due={reviewDue(snapshot, [])[0]!} snapshot={snapshot} open ready write={workspace.write} retryWrite={workspace.retryWrite} busy={false} close={close} complete={close} />}
    {s.surface === 'seed' && <Seeded seed={{ key: 1, mode: 'batch', horizon: 'day', period: snapshot.periods.find(period => period.horizon === 'day')!, next: false, parent: null, parents: [snapshot.items.find(item => item.id === 'week-goal')!], draft: true, note: null }} snapshot={snapshot} flows={flows} submit={workspace.submit} busy={false} error={null} close={close} />}
    {s.surface === 'link' && <Modal title={messages.currentItem} close={close}><LinkText text="https://example.test/review" /></Modal>}
  </>}</>
}
