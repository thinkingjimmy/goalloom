/**
 * [INPUT]: 有限 preload smart API、当前工作区代次。
 * [OUTPUT]: useSmart：设备侧智能输入状态与 connect/disable/forget/dismiss/openConsole；代次变化即重新读取（整库替换后自动显示暂停）。
 * [POS]: renderer/state 的智能输入入口；Key 只经一次 connect 提交，状态中只有遮罩提示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useCallback, useEffect, useState } from 'react'
import type { JevProvider, Notice, SmartAction, SmartStatus, TestOutcome } from '../../shared/contracts/smart-input'
import { desktopApi } from './use-workspace'

export interface Smart {
  status: SmartStatus | null
  connect: (provider: JevProvider, apiKey: string | null) => Promise<TestOutcome | null>
  disable: () => Promise<void>
  forget: (provider: JevProvider) => Promise<void>
  dismiss: (notice: Notice) => Promise<void>
  openConsole: (provider: JevProvider) => void
  refresh: () => Promise<void>
}
export function useSmart(generation: string | undefined): Smart {
  const [status, setStatus] = useState<SmartStatus | null>(null)
  const send = useCallback(async (action: SmartAction): Promise<TestOutcome | null> => {
    const reply = await desktopApi().smart(action)
    if (reply.type === 'status') { setStatus(reply.status); return reply.test }
    return null
  }, [])
  const refresh = useCallback(async () => { if (generation) await send({ type: 'status', generation }).catch(() => null) }, [generation, send])
  useEffect(() => { setStatus(null); void refresh() }, [refresh])
  return {
    status, refresh,
    connect: (provider, apiKey) => generation ? send({ type: 'connect', generation, provider, apiKey, consent: true }) : Promise.resolve(null),
    disable: async () => { if (generation) await send({ type: 'disable', generation }) },
    forget: async provider => { if (generation) await send({ type: 'forget', generation, provider }) },
    dismiss: async notice => { if (generation) await send({ type: 'dismiss', generation, notice }).catch(() => null) },
    openConsole: provider => { void desktopApi().smart({ type: 'openConsole', provider }).catch(() => null) },
  }
}
