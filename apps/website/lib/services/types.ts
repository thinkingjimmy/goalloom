/**
 * [INPUT]: No runtime dependencies.
 * [OUTPUT]: ServiceCatalog with FAQ identities/answers, pricing information labels, BillingState and billing-policy sections without a separate launch banner.
 * [POS]: Shared content contract; billing handoff labels never establish service eligibility.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export type BillingState = 'unavailable' | 'invalid' | 'signedOut' | 'cancelled' | 'failed' | 'pending' | 'confirmed' | 'appClosed' | 'offline'
export type BillingPolicyId = 'free' | 'prices' | 'trial' | 'cancellation' | 'changes' | 'grace' | 'refunds' | 'disputes' | 'cloud-retention' | 'deletion' | 'records' | 'ai-use'
export type BillingPolicySection = { id: BillingPolicyId; title: string; paragraphs: string[] }
export type ServiceCatalog = {
  meta: { title: string; description: string }
  navPricing: string; heading: string; intro: string; eyebrow: string; free: string; plus: string;
  local: string; comingSoon: string; availability: string; download: string; details: string;
  billingCycle: string; monthly: string; yearly: string; perMonth: string; perYear: string; annualCharge: string;
  freeFeatures: string[]; plusFeatures: string[]; summaryBody: string;
  homePricing: {
    title: string; body: string; freeDescription: string; freePeriod: string; freeBilling: string;
    freeIncludes: string; freeFeatures: string[]; byokInfoLabel: string; byokNote: string;
    annualSavings: string; tryNow: string; plusIncludes: string;
    plusFeatures: Array<{ id: 'sync' | 'ai'; title: string; description: string }>;
    encryptionInfoLabel: string; encryptionNote: string;
  };
  statusTitle: string; statusBody: string;
  policy: { sections: BillingPolicySection[] };
  support: string; supportBody: string; technical: string;
  manageTitle: string; manageBody: string; stripeManage: string; appleManage: string;
  terms: string; privacy: string; faqTitle: string;
  faqManageQuestion: string;
  mobile: { q: string; a: string };
  faq: Array<{ id: 'free' | 'trial' | 'purchase' | 'renewal' | 'expiry' | 'ai' | 'account' | 'refunds' | 'changes' | 'grace'; q: string; a: string }>;
  billing: { title: string; description: string; continueTitle: string; returnTitle: string;
    states: Record<BillingState, string>; explanation: string; check: string; openApp: string; manual: string; back: string; noScript: string }
  legal: {
    updated: string; privacyIntro: string; termsIntro: string; accountTitle: string; account: string;
    hosted: string[]; paymentsTitle: string; payments: string[]; retention: string;
    paidTitle: string; paid: string[]; sources: string; support: string;
  }
}
