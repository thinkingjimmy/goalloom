/**
 * [INPUT]: ServiceCatalog, publication-stage content and verified hosted AI provider/storage boundaries.
 * [OUTPUT]: Localized service, billing and policy copy.
 * [POS]: lib/services/catalogs; interpolated by the shared catalog loader.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ServiceCatalog } from '../types'

export default {
  "mobile": {
    "q": "Is an iPhone app available?",
    "a": "Not yet. The public download supports macOS 14+ on Apple Silicon and Windows 11 x64. Copy the download link on your phone to open it on your computer. Future Apple purchases will be managed through Apple; no iPhone purchase or App Store download is available here."
  },
  "navPricing": "Pricing",
  "meta": {
    "title": "Goalloom pricing — free local tools, optional Plus",
    "description": "Keep local tasks, history, backups and your own AI key free. Explore planned Goalloom Plus pricing, an optional eight-day trial, encrypted sync and built-in AI."
  },
  "heading": "Your local tools stay free.",
  "intro": "Choose cloud services when they help. Keep your tasks, history and backups on your device either way.",
  "eyebrow": "Free locally · Optional cloud",
  "free": "Free",
  "plus": "Plus",
  "local": "No account required",
  "comingSoon": "Coming soon",
  "availability": "About availability",
  "download": "Download free",
  "details": "View plans",
  "billingCycle": "Billing cycle",
  "monthly": "Monthly",
  "yearly": "Yearly",
  "perMonth": "/ month",
  "perYear": "/ year",
  "annualCharge": "{annual} charged once per year; the annual total is not a monthly charge.",
  "freeFeatures": [
    "Local tasks, goals and history",
    "Local backups, import and export",
    "Your own AI provider key (BYOK)",
    "No purchase or account required for local work"
  ],
  "plusFeatures": [
    "Encrypted sync and built-in AI in one plan",
    "One account-level trial across devices",
    "Keep using local tools and BYOK after expiry",
    "Fair use and service protection; no AI credit packs"
  ],
  "homePricing": {
    "title": "Paid sync, when you need it.",
    "body": "Local tools stay free. Plus adds end-to-end encrypted sync and built-in AI.",
    "freeDescription": "Plan each day on your own device.",
    "freePeriod": "Free forever",
    "freeBilling": "No account or subscription required",
    "freeIncludes": "Your complete local workspace",
    "freeFeatures": [
      "Goal boards and relation lines",
      "Work offline with data stored locally",
      "Local backups, import and export",
      "Use your own AI API key"
    ],
    "byokInfoLabel": "About model provider fees",
    "byokNote": "Your model provider charges separately.",
    "annualSavings": "Save {amount}/year (about {percent})",
    "tryNow": "Try now",
    "plusIncludes": "Everything in Free, plus",
    "plusFeatures": [
      {
        "title": "End-to-end encrypted sync",
        "description": "Sync goals and tasks across your devices.",
        "id": "sync"
      },
      {
        "title": "Built-in AI",
        "description": "No API key of your own required.",
        "id": "ai"
      }
    ],
    "encryptionNote": "End-to-end encryption protects sync data. It does not cover AI processing.",
    "encryptionInfoLabel": "About AI and sync encryption"
  },
  "summaryBody": "Goalloom stays free for local work and BYOK. Planned Plus combines encrypted sync and built-in AI. The current download and future cloud service have separate availability.",
  "statusTitle": "Plus is not open yet",
  "statusBody": "Purchases and trial activation are not available. Download {version} remains free with BYOK AI. Hosted AI is in limited authenticated testing and is not included in that public client. This page does not change current sync access.",
  "support": "Private support",
  "supportBody": "For billing, privacy, deletion or account questions, email us. Do not post passwords, API keys, task content or payment details in public issues.",
  "technical": "Technical questions on GitHub",
  "manageTitle": "Manage the original purchase",
  "manageBody": "No subscription can be purchased or managed on this site yet. Once available, use the channel where you bought it; restoring a purchase does not start another trial.",
  "stripeManage": "Web purchases: use Goalloom billing management to cancel renewal or change the next billing period. A verified Stripe portal handles supported payment-method and invoice actions; it is not the only cancellation path.",
  "appleManage": "Future iPhone purchases: manage renewal in Apple subscription settings. Deleting a Goalloom account does not cancel Apple renewal. The iPhone app is not published yet.",
  "terms": "Service terms",
  "privacy": "Privacy policy",
  "faqTitle": "Billing questions",
  "faqManageQuestion": "How do I manage my subscription?",
  "faq": [
    {
      "q": "What stays free?",
      "a": "Local tasks, history, backups, import/export and existing BYOK remain free. Your AI provider may charge for requests under your own key. Plus is a separate optional cloud service, not a task limit.",
      "id": "free"
    },
    {
      "q": "How does the trial work?",
      "a": "When launched, an explicit action starts one {trialDays}-day ({trialHours}-hour) trial per account. No card and no automatic charge. Downloading, signing in or viewing plans does not start it. Trial activation is not open yet.",
      "id": "trial"
    },
    {
      "q": "What if I buy before the trial ends?",
      "a": "A verified purchase starts paid service immediately, without credit or extension for unused trial time. A refund does not restore that trial or grant another. A failed, cancelled or unconfirmed purchase leaves the original trial deadline unchanged.",
      "id": "purchase"
    },
    {
      "q": "Does Plus renew automatically?",
      "a": "When launched, subscriptions renew automatically. Cancel through the original channel and keep access until the paid period ends. Both monthly/annual changes take effect at the next renewal, without an immediate adjustment or prorated refund. Uninstalling or signing out does not cancel. Cancellation is not a refund or cloud-deletion request. The free trial does not convert itself into a paid subscription.",
      "id": "renewal"
    },
    {
      "q": "What happens after access ends?",
      "a": "Under the launch policy, cloud copies remain for {retentionDays} days after all valid trial, paid and grace access ends. Retrieval makes a separate local copy and requires account authorization and decryption credentials. It closes at the deadline; online deletion completes within a further {onlineDeleteDays} days. A later purchase cannot restore the old copy. These services are not launched. Local data and BYOK remain available.",
      "id": "expiry"
    },
    {
      "q": "Is AI unlimited or end-to-end encrypted?",
      "a": "BYOK remains available. Built-in AI needs sign-in, explicit selection and consent to the actual context sent. Goalloom routes through OpenRouter to TypeSafe/Jev, DeepInfra for drafts and reviews, and DeepSeek for note rewrites. DeepSeek may retain content and use it for training. AI processing is separate from sync end-to-end encryption. No unlimited AI or storage is promised. Hosted AI has fair-use and abuse protections without credit packs or automatic overage charges.",
      "id": "ai"
    },
    {
      "q": "How do account, sync and payment differ?",
      "a": "An account proves identity; a sync password unlocks encrypted data; future service eligibility permits cloud actions. They are separate. The public desktop version still has optional sync, and this page does not impose a new payment gate.",
      "id": "account"
    },
    {
      "q": "Can I request a refund?",
      "a": "Payments and unused time are non-refundable except where applicable law or platform rules require otherwise. Duplicate charges, billing errors and service not supplied as agreed have a private support path. Apple decides Apple refunds. Trial and immediate activation do not waive statutory withdrawal rights. A refund does not restart a trial or automatically delete local data. Statutory rights remain.",
      "id": "refunds"
    },
    {
      "q": "When does a monthly/yearly change take effect?",
      "a": "Both directions take effect at the next renewal, with the current price and period unchanged. No immediate adjustment or prorated refund. Cancelling renewal prevents a pending change from taking effect; confirm the next cycle and amount if you resume.",
      "id": "changes"
    },
    {
      "q": "What if renewal payment fails?",
      "a": "Only a failed paid automatic renewal receives {graceDays} days from the original renewal deadline to update payment details, with Plus available. First-purchase failure, trial expiry and normal expiry after cancellation do not qualify. Web retries and future renewal stop after grace; Apple may continue retrying under its rules. After grace without other valid access, cloud writes and built-in AI stop. Payments already in progress still need verification.",
      "id": "grace"
    }
  ],
  "billing": {
    "title": "Goalloom billing",
    "description": "Safely continue a Goalloom purchase or check its status, with support and free downloads available while billing is not open.",
    "continueTitle": "Continue with Goalloom",
    "returnTitle": "Check your purchase",
    "states": {
      "unavailable": "Billing is not available yet",
      "invalid": "This continuation link cannot be verified",
      "signedOut": "Sign in before continuing",
      "cancelled": "The purchase was not confirmed",
      "failed": "The purchase could not be completed",
      "pending": "Waiting for verified purchase status",
      "confirmed": "The service has been verified",
      "appClosed": "Continue in the Goalloom app",
      "offline": "You are offline"
    },
    "explanation": "Return to Goalloom and use the account that started the purchase to view your subscription status.",
    "check": "Check connection",
    "openApp": "Return to Goalloom",
    "manual": "If Goalloom does not open, open the app yourself and check the original purchase in its billing settings. Do not purchase again. An expired link or an offline check does not cancel a payment.",
    "back": "Back to plans",
    "noScript": "Billing requires the supported app and a verified backend. Without JavaScript you can still read this notice, download the app and contact support."
  },
  "legal": {
    "updated": "Effective and last updated: October 23, 2026",
    "privacyIntro": "Goalloom is operated by {operator}. This policy covers the official app, optional hosted services and www.goalloom.com. Local software remains usable without an account. Self-hosted services may have a different operator.",
    "termsIntro": "These terms cover the official Goalloom website and optional hosted services. The website and web subscriptions are operated by {operator}; Stripe processes web payments. Apple purchases are supplied and settled under the seller details shown on the App Store purchase page and receipt, and its platform rules. Open-source licenses separately govern the software and are not reduced by these terms.",
    "accountTitle": "Apple / Google sign-in and your account",
    "account": "Apple or Google and Supabase process account identifiers, email, basic profile information when provided, and sessions. Sign-in can identify you for optional AI as well as sync; it does not itself authorize upload, activate AI, start a trial or prove payment. We do not receive your Apple or Google password.",
    "hosted": [
      "BYOK requests use your configured OpenRouter or Vercel AI Gateway key. Where an explicitly enabled client supports Goalloom-hosted AI, sign-in and account-bound consent are required before relevant task input, goals, descriptions or bounded activity context is sent through Goalloom to OpenRouter: TypeSafe/Jev handles smart input, DeepInfra handles drafts and reviews, and DeepSeek runs DeepSeek V4.1 Flash 1017 for note rewrites. DeepSeek may retain submitted content and use it for model training. The public {version} download does not include this hosted source. Providers process readable context; this is not sync end-to-end encryption.",
      "Goalloom processes AI content within the original request without persistent server storage. Results are returned once and cannot be downloaded again; only necessary call, cost and security metadata is kept. Removal of the old encrypted cache does not prove immediate physical erasure from infrastructure logs, replicas or backups.",
      "The device may keep unadopted AI drafts, review summaries and their fingerprints in bounded local caches, including after sign-out. Local copies and provider processing have separate retention boundaries. Provider retention and training practices follow their policies; Goalloom does not promise zero retention by every processor."
    ],
    "paymentsTitle": "Payments and subscription information",
    "payments": [
      "Paid Plus and checkout are not launched. The planned web channel is Stripe, with RevenueCat aggregating verified payment facts; Apple will process iPhone purchases only after that channel launches. These informational pages do not load payment SDKs or send payment requests.",
      "When a channel is enabled, its providers may process payment method information, transaction/subscription identifiers, purchase source, amounts, currency, billing periods and account-binding metadata needed for billing, verification and support. Payment metadata must not contain task text, prompts, sync passwords or API keys. We do not claim that every form of payment information bypasses Goalloom."
    ],
    "retention": "The finalized Plus launch policy provides {retentionDays} days from the end of all valid trial, paid and grace access. Retrieval closes at the deadline and online deletion finishes within {onlineDeleteDays} additional days; later purchases cannot restore the old copy. Explicit deletion instead stops access immediately and deletes online data within {onlineDeleteDays} days. Isolated routine service backups expire within {backupDays} days after online deletion. These new retrieval and timed-deletion services are not launched; local copies and hosted-AI retention are separate.",
    "paidTitle": "Planned Plus service — not yet for sale",
    "paid": [
      "Local tasks, history, backups, import/export and BYOK stay free. Planned Plus includes sync and built-in AI at {monthly} monthly or {annual} once yearly, including applicable taxes we must collect. No sync-only plan, launch promotion or automatic overage charge.",
      "One account trial lasts {trialDays} days ({trialHours} hours) from explicit activation, with no card or automatic billing. A confirmed early purchase consumes its remaining trial; a refund does not restore it. Unconfirmed or failed payment preserves the original deadline.",
      "At launch, renewal is automatic until cancelled through the original channel; paid access continues to the current period end. Billing-cycle changes take effect at the next renewal. Payments and unused time are non-refundable except for mandatory law/platform remedies, billing errors or service issues handled under the policy below."
    ],
    "sources": "Apple/Google provide sign-in; Supabase provides account and encrypted-sync infrastructure; Vercel hosts the website; GitHub distributes desktop releases. OpenRouter and the selected model providers process AI requests. Stripe, RevenueCat and Apple are planned payment processors/verification providers, not active payment SDKs on these pages.",
    "support": "For private billing, privacy, account or deletion requests, contact the support email below. Do not publish personal billing information in GitHub issues. The operator may verify account ownership; do not send passwords, sync secrets, API keys or full payment credentials."
  },
  "policy": {
    "sections": [
      {
        "id": "free",
        "title": "Free features and Plus",
        "paragraphs": [
          "Local task management, history, backups, import and export remain free. Plus is not required for these features. You can continue using your own AI API key and pay your model provider directly.",
          "Plus includes encrypted cloud sync and built-in AI. Monthly and annual subscriptions provide the same service. Purchasing, signing in or starting a trial does not automatically upload local data or enable AI. Sync setup and AI data sharing still require your actions and the relevant consent."
        ]
      },
      {
        "id": "prices",
        "title": "Prices, taxes and renewal",
        "paragraphs": [
          "Web subscriptions are charged in US dollars: {monthly} monthly or {annual} annually. The full annual amount is charged once a year. Web prices include applicable sales tax, VAT and similar taxes that we are required to collect. These taxes are not added on top of the listed price. Your bank or payment provider may charge currency-conversion or cross-border fees separately.",
          "For Apple purchases, currency, local prices and taxes are shown in the App Store purchase confirmation and may differ from web prices. Checkout shows the total, billing period and renewal terms before purchase. A subscription renews for the selected period until you cancel through its original purchase channel. Price changes follow applicable notice and consent requirements."
        ]
      },
      {
        "id": "trial",
        "title": "Eight-day free trial",
        "paragraphs": [
          "An eligible Goalloom account can actively claim one free trial lasting {trialDays} consecutive 24-hour periods from successful activation, shared across devices. Downloading, registering, signing in, viewing plans or opening checkout does not start it.",
          "The trial needs no payment method, creates no paid subscription and does not charge you when it ends. If you have no other valid service access when it ends, cloud sync and built-in AI stop. Local features and your own AI key remain available.",
          "If you choose to purchase during the trial, paid service begins when payment succeeds. Remaining trial time ends without a credit or extension. An unsuccessful or unconfirmed purchase leaves the original trial deadline unchanged. A refund does not restore trial time ended by a successful purchase or grant another trial. The trial does not limit statutory withdrawal, refund or other consumer rights."
        ]
      },
      {
        "id": "cancellation",
        "title": "Cancelling renewal",
        "paragraphs": [
          "You can cancel automatic renewal through the original purchase channel at any time. Cancellation preserves access until that channel's current paid-period end. It does not itself produce a refund or start cloud-data deletion. Cancel before the channel's displayed renewal-processing deadline and check the result. Apple displays the timing and management options for its purchases.",
          "For web purchases, use Goalloom's billing-management entry. For Apple purchases, use Apple subscription settings. Uninstalling, signing out or turning sync off does not cancel a subscription."
        ]
      },
      {
        "id": "changes",
        "title": "Changing billing periods",
        "paragraphs": [
          "An active subscription can change billing periods through its original purchase channel. Both monthly-to-annual and annual-to-monthly changes take effect at the next renewal. The current period keeps its existing price and end date. There is no immediate price adjustment or prorated refund for that period. The confirmation shows the new charge and effective date.",
          "After renewal is cancelled, a pending billing-period change will not take effect at the original renewal date. If you later choose to resume renewal, check the next period and charge shown by the original channel. A new purchase after expiry starts at the time confirmed for that purchase. We do not automatically transfer subscriptions between web and Apple billing. Manage the original subscription first to avoid duplicate purchases."
        ]
      },
      {
        "id": "grace",
        "title": "Failed renewals",
        "paragraphs": [
          "An existing paid subscription that fails to renew because of a payment issue receives a {graceDays}-day service grace period from its original renewal deadline, not from a retry or when you open the app. Plus remains available during grace, subject to normal service protections. Failed first purchases, trial expiry and expiry after cancellation do not qualify.",
          "If renewal remains unpaid at the end of grace and you have no other valid service access, cloud sync and built-in AI pause. Local features and your own AI key remain available. Web subscriptions stop new automatic retries and cancel future renewal; payments already in progress still need reconciliation. Apple may continue renewal attempts under its rules and restore service after payment succeeds. Cancel with Apple if you do not want further charges. The app shows the actual service deadline and next steps."
        ]
      },
      {
        "id": "refunds",
        "title": "Refunds, billing errors and consumer rights",
        "paragraphs": [
          "Except where applicable law or purchase-platform rules require otherwise, payments are non-refundable and unused time is not refunded on a prorated basis. Changing your mind, forgetting to cancel, not using the service or deleting your account does not itself create an additional refund or credit entitlement.",
          "Contact {supportEmail} about duplicate charges, billing errors or service not supplied as agreed. Include the purchase channel and order identifier. Do not send full card numbers, sync passwords or task content.",
          "Request Apple purchase refunds through Apple; Apple decides those requests. This policy does not limit statutory withdrawal rights, refunds or other mandatory consumer remedies. Where you have a statutory right to withdraw, tell us clearly within the applicable period. A free trial or immediate activation does not by itself waive those rights."
        ]
      },
      {
        "id": "disputes",
        "title": "Refunds, disputes and access",
        "paragraphs": [
          "An approved full refund or payment reversal may end access supplied by that transaction. A partial refund alone does not shorten access. A refund request that has not been approved does not itself stop service.",
          "For a verified payment dispute, we may suspend cloud-service access supplied by the disputed transaction and provide an account notice or private support path. Another valid, unaffected subscription continues to provide access. Refunds and disputes do not automatically delete local data. If all cloud access ends as a result, the {retentionDays}-day cloud-retention policy below applies. A resolved dispute restores access supported by the verified transaction outcome, without granting a new trial."
        ]
      },
      {
        "id": "cloud-retention",
        "title": "Cloud data after access ends",
        "paragraphs": [
          "Cloud copies are retained for {retentionDays} days after all valid trials, paid access and applicable grace periods end. Cancelling renewal alone does not start this period. New cloud uploads and built-in AI stop during retention. Restricted retrieval of existing cloud data requires account authorization and the necessary sync password or other decryption credentials. Goalloom cannot replace lost decryption credentials.",
          "Renewing during retention can resume use of a cloud copy that has not been deleted. At the {retentionDays}-day deadline, retrieval closes and online deletion begins. Online deletion completes within a further {onlineDeleteDays} days. Subscribing after the deadline cannot restore that copy, even if deletion is still in progress. Sync must be rebuilt from data you kept.",
          "Ordinary expiry, refunds and payment disputes use the same {retentionDays}-day cloud-retention period. Subscription expiry does not delete local tasks, local history or backups you keep yourself.",
          "When launched, restricted retrieval will create a separate local copy without resuming sync or uploading changes. Replacing your current workspace will require an explicit choice and a protective local backup. Account sign-in alone cannot decrypt the copy; the necessary decryption credentials stay on your device.",
          "When launched, account settings will show service and retrieval deadlines and online-deletion status. Necessary reminders will appear only inside Goalloom, without interrupting local editing. They do not extend a deadline. No email or system push notifications are sent."
        ]
      },
      {
        "id": "deletion",
        "title": "Deleting an account or cloud data",
        "paragraphs": [
          "An explicit deletion request does not receive the ordinary {retentionDays}-day retention period. After a valid request is confirmed, the relevant cloud access stops immediately. The relevant online content and, when requested, the account are deleted within {onlineDeleteDays} days. Export anything you need first. Resubscribing cannot restore deleted content. You manage local data on your devices.",
          "When you delete the entire account, we also process cancellation of web renewal. Apple subscriptions do not automatically cancel when a Goalloom account is deleted; turn off renewal in Apple's subscription settings. You can request immediate account deletion without waiting for a subscription to expire. Deleting only cloud data does not cancel your account or subscription. Deletion does not itself refund unused time, except where applicable law or purchase-platform rules require otherwise."
        ]
      },
      {
        "id": "records",
        "title": "Limited records after deletion",
        "paragraphs": [
          "Stripe or Apple processes payments for the relevant channel. RevenueCat helps verify subscriptions, and Goalloom uses those facts to manage account access. We process necessary account links, orders, amounts, currencies, taxes and subscription states. We do not send task content, AI inputs or sync passwords to payment or subscription-verification services, or store full card numbers or security codes.",
          "Under the launch policy, after online content is deleted, isolated routine service backups expire on a rolling schedule within a further {backupDays} days. They are not an account-recovery or continuing-service feature. Infrastructure restores must reapply deletion records so deleted content does not become accessible again. This does not mean underlying media are physically erased when a request is made.",
          "Necessary orders, invoices and payment-processing records are retained for {billingYears} years after the relevant transaction or accounting adjustment for accounting, tax, disputes and legal obligations, or longer where law requires. Pseudonymized trial-claim and account-abuse records are retained for up to {abuseDays} days after account deletion, without task content or device fingerprinting. Records specifically required for a dispute or legal obligation may remain until that matter and its applicable retention period end.",
          "Keeping necessary billing or protection records does not justify keeping the full task account or all task content. The privacy policy separately explains AI requests and results; sync-copy retention does not replace those data rules."
        ]
      },
      {
        "id": "ai-use",
        "title": "Built-in AI and support",
        "paragraphs": [
          "Built-in AI is for personal, everyday task and goal management. Do not resell it, offer shared-account services, make bulk automated calls or bypass protections. We record necessary usage, cost and security information. Abnormal traffic may be temporarily limited or suspended to prevent abuse or protect service, with retry guidance or a support path.",
          "Plus is not advertised as unlimited AI. We do not sell call-count packs or automatically bill overage fees at a protection threshold. AI protection alone does not cancel valid sync access. For billing, cancellation, deletion and service issues, contact {supportEmail}."
        ]
      }
    ]
  }
} satisfies ServiceCatalog
