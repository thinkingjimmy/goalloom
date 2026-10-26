// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: A verified durable closed operation row under its original owner/environment/intent.
 * [OUTPUT]: Finite closure receipt for ending only the matching local pending journal.
 * [POS]: D1 billing failure transport. A bare error never proves an operation was closed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { BillingAction } from './service.ts'
import type { BillingConfig, Cycle } from './config.ts'
export class ClosedOperation extends Error {
  constructor(readonly environment: BillingConfig['environment'], readonly operation: {
    requestId: string; requestedId?: string; action: BillingAction; cycle: Cycle | null; status: 'closed'; reason: string;
  }) { super(operation.reason) }
}
