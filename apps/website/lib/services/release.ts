/**
 * [INPUT]: Owner-approved commercial decisions and dated public-release/production/account evidence.
 * [OUTPUT]: SERVICE commercial/public-release facts, RELEASE_GATES, publicationStage, priceText and interpolateServiceText.
 * [POS]: Website-only publication snapshot; never grants eligibility or creates payment sessions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { RELEASE } from '../release'

export type PublicationStage = 'unavailable' | 'preview' | 'live'
export type BillingCycle = 'month' | 'year'
export type ReleaseGates = {
  policiesApproved: boolean; backendVerified: boolean; publicClientVerified: boolean;
  stripePricesVerified: boolean; lifecycleVerified: boolean; launchAuthorized: boolean;
}

export function publicationStage(requested: PublicationStage, gates: ReleaseGates): PublicationStage {
  if (requested === 'live' && gates.policiesApproved && gates.backendVerified && gates.publicClientVerified && gates.stripePricesVerified && gates.lifecycleVerified && gates.launchAuthorized) return 'live'
  return requested === 'preview' ? 'preview' : 'unavailable'
}

export const RELEASE_GATES: Readonly<ReleaseGates> = {
  policiesApproved: true, backendVerified: false, publicClientVerified: false,
  stripePricesVerified: false, lifecycleVerified: false, launchAuthorized: false,
}

export const SERVICE = {
  checkedOn: '2026-10-23', currency: 'USD', monthlyCents: 899, annualCents: 7900,
  trialDays: 8, trialHours: 8 * 24, retentionDays: 30,
  commercialPolicy: {
    version: '1.0', finalizedOn: '2026-10-23', webTaxBehavior: 'inclusive',
    graceDays: 3, onlineDeleteDays: 7, backupDays: 35, billingYears: 7, abuseDays: 180,
    cycleChange: 'next-renewal', refundRestoresTrial: false,
  },
  // A finite app return does not establish public purchase or lifecycle readiness.
  stage: publicationStage('unavailable', RELEASE_GATES),
  operator: 'Augmenting Human Intellect, LLC', supportEmail: 'hellojimmywong@gmail.com',
  statementDescriptor: 'GOALLOOM', policyDate: '2026-10-23',
  publicClientVersion: RELEASE.version, publicClientHostedAi: false, iphonePublished: false,
} as const

export function priceText(cycle: BillingCycle) {
  const cents = cycle === 'month' ? SERVICE.monthlyCents : SERVICE.annualCents
  return `${SERVICE.currency} ${Number((cents / 100).toFixed(2))}`
}

export function interpolateServiceText(text: string): string {
  const values: Record<string, string> = {
    monthly: priceText('month'), annual: priceText('year'), trialDays: String(SERVICE.trialDays),
    trialHours: String(SERVICE.trialHours), retentionDays: String(SERVICE.retentionDays),
    operator: SERVICE.operator, version: SERVICE.publicClientVersion,
    supportEmail: SERVICE.supportEmail, graceDays: String(SERVICE.commercialPolicy.graceDays),
    onlineDeleteDays: String(SERVICE.commercialPolicy.onlineDeleteDays), backupDays: String(SERVICE.commercialPolicy.backupDays),
    billingYears: String(SERVICE.commercialPolicy.billingYears), abuseDays: String(SERVICE.commercialPolicy.abuseDays),
  }
  return text.replace(/\{(monthly|annual|trialDays|trialHours|retentionDays|operator|version|supportEmail|graceDays|onlineDeleteDays|backupDays|billingYears|abuseDays)\}/gu, (_, key: string) => values[key]!)
}
