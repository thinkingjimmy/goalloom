/**
 * [INPUT]: The preload sync channel.
 * [OUTPUT]: The latest sync status. The recovery phrase stays in the pane that asked for it.
 * [POS]: Renderer subscription for Settings › Sync.
 */
import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../shared/contracts/sync'
import { desktopApi } from './use-workspace'

export function useSync(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  useEffect(() => {
    const api = desktopApi()
    let live = true
    void api.sync({ type: 'status' }).then(reply => { if (live) setStatus(reply.status) }).catch(() => undefined)
    return api.onSync(next => { if (live) setStatus(next) })
  }, [])
  return status
}
