/**
 * [INPUT]: LegalCatalog content contract and verified desktop/website data flows.
 * [OUTPUT]: en privacy policy and terms of service.
 * [POS]: lib/legal/catalogs; substantive sections match the other four languages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LegalCatalog } from '../types'

export default {
  "updated": "Effective and last updated: October 19, 2026",
  "contents": "On this page",
  "contact": "Contact",
  "contactText": "For privacy, access, correction, deletion or service questions, email the maintainer. We may ask for information needed to verify ownership. Do not send passwords, recovery secrets or API keys.",
  "resources": "Related policies and licenses",
  "privacy": {
    "title": "Privacy Policy",
    "description": "How Goalloom handles local workspace data, Google sign-in, optional encrypted sync, AI requests and your privacy choices.",
    "intro": "Goalloom is a local-first planning app maintained by Jimmy, an independent developer. This policy covers the official Goalloom app, optional hosted sync and www.goalloom.com. Self-hosted or modified versions may have different operators and practices.",
    "sections": [
      {
        "id": "local",
        "title": "Your workspace stays on your device",
        "paragraphs": [
          "Tasks, descriptions, goals, relationships, calendar settings and history are stored in a local SQLite workspace. Local backups, exports, preferences and caches can also remain on your computer. You can use the local board without a cloud account.",
          "Goalloom does not send task content as product telemetry or use advertising trackers. Local databases, exports and backups are not made encrypted merely by enabling encrypted sync; protect your device and any copies you share."
        ]
      },
      {
        "id": "google",
        "title": "Google sign-in",
        "paragraphs": [
          "If you enable sync using Google, Google and our authentication provider, Supabase, process your Google account identifier, email, basic profile information such as name and profile image when supplied, and authentication sessions. We use these to identify your account, show the signed-in account and authorize its devices and workspaces. We do not receive your Google password.",
          "The current login requests basic identity, email and profile access, not Gmail, Google Drive or Google Calendar access. Google account data is not sold, used for advertising or used to train AI models. Its use and transfer follow the Google API Services User Data Policy, including the Limited Use requirements."
        ]
      },
      {
        "id": "sync",
        "title": "Optional encrypted sync",
        "paragraphs": [
          "When you enable sync, your device encrypts workspace operation payloads before sending them to Supabase. The service stores encrypted payloads and the account, device, workspace, sequence, authorization, usage and timing metadata needed to synchronize them. End-to-end encryption protects payloads, not this operational metadata. Network infrastructure can also process IP addresses and request logs.",
          "Authorized devices hold the keys needed to open your workspace. Supported synced preferences may include encrypted AI credentials; ordinary workspace exports and backups exclude those credential records. The service does not receive your sync password as plaintext or your device private keys. Losing required credentials can make encrypted data unrecoverable."
        ]
      },
      {
        "id": "ai",
        "title": "Optional AI features",
        "paragraphs": [
          "AI features use the provider and model you configure, currently through OpenRouter or Vercel AI Gateway. When enabled and used, the app sends the input and relevant context needed for that feature, which can include task titles, descriptions, related goals and bounded activity summaries. AI requests are separate from encrypted sync: the selected provider and downstream model service receive the context in a form they can process.",
          "Your API key authenticates these requests. We do not use your workspace content to train our own AI models. Provider retention, processing and model-training practices depend on the provider and settings you choose. Review them before enabling AI, and avoid sending information you do not want those services to process."
        ]
      },
      {
        "id": "network",
        "title": "Website, previews and updates",
        "paragraphs": [
          "The website uses Vercel hosting and does not install advertising or analytics scripts. It remembers your chosen theme in browser local storage. Hosting infrastructure may process IP addresses, requested URLs, browser information, timestamps and security logs to deliver and protect the site.",
          "The desktop app can request public page metadata and images for link previews, and contact GitHub release infrastructure for update checks and downloads. Those destinations see normal network request information and, for previews, the requested URL. Following an external link subjects that visit to the destination’s policies."
        ]
      },
      {
        "id": "sharing",
        "title": "Service providers and disclosures",
        "paragraphs": [
          "Google provides sign-in, Supabase provides authentication and hosted sync infrastructure, Vercel hosts the website, and GitHub distributes releases and hosts public issues. Your selected AI gateway and model providers process AI requests. They receive the data necessary for the activity described above and operate under their applicable terms and privacy practices.",
          "We do not sell personal information or share it for targeted advertising. We may disclose information when needed to operate these features, meet a legal obligation, or address abuse and security threats. Providers may process data in countries different from yours. If you contact us, your email and the information you send are used to respond and handle the request; public GitHub issues are visible to others."
        ]
      },
      {
        "id": "retention",
        "title": "Retention and deletion",
        "paragraphs": [
          "Local data and copies remain under your control until you remove them. Hosted account information and encrypted workspace records are retained to provide sync until deleted. Security, support and infrastructure records are retained as needed for their purpose or legal obligations; deleted data may remain in routine backups until those copies expire. We do not promise immediate erasure of every backup.",
          "Signing out, uninstalling the app or revoking Google access does not by itself delete hosted data. Deleting a task is not the same as deleting its sync history, backups or account. To request deletion of the hosted account and associated workspace data, contact us using the email below. Copies already on other devices or in your own backups need separate removal."
        ]
      },
      {
        "id": "choices",
        "title": "Your choices and requests",
        "paragraphs": [
          "You can keep using the app locally, disable optional AI features, sign out of sync, export your workspace, manage local copies, and revoke Google access in your Google Account. Depending on applicable law, you may request access, correction, deletion, restriction, objection or a portable copy of personal information we hold, and contact your local data protection authority. Email us to make a request; encryption limits what we can inspect or recover.",
          "Goalloom is not directed at children under 13. If you believe a child has provided personal information to the hosted service, contact us so we can investigate and handle deletion as appropriate."
        ]
      },
      {
        "id": "changes",
        "title": "Changes to this policy",
        "paragraphs": [
          "We will update the date on this page when practices change. Material changes will be described on the website or through an appropriate product notice. A policy update does not automatically enable optional data sharing or grant new access permissions."
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of Service",
    "description": "Terms for the Goalloom website and optional hosted services, including account responsibilities, AI features and open-source rights.",
    "intro": "These terms apply to your use of the official Goalloom website and optional hosted services maintained by Jimmy. By using those services, you agree to these terms. Software licenses separately govern the open-source code.",
    "sections": [
      {
        "id": "license",
        "title": "Open-source rights",
        "paragraphs": [
          "The desktop and mobile client code, shared packages and website are provided under the MIT License. Server-side sync code in the supabase directory is licensed under GNU AGPL-3.0-only. See the repository licenses for the permissions and conditions that apply.",
          "These service terms do not replace, narrow or revoke rights granted by those licenses. Self-hosting and modified versions are governed by the relevant licenses, and third-party operators are responsible for their own services."
        ]
      },
      {
        "id": "account",
        "title": "Your account and data",
        "paragraphs": [
          "You retain your rights to your content. You authorize only the processing needed to operate the features you choose, as described in the Privacy Policy. You must have the right to use any content you submit.",
          "Use an account you are authorized to access. Protect your devices, Google account, sync password, recovery material and AI keys. Keep backups of important data. We cannot promise to recover encrypted data if the necessary keys or credentials are lost. If you cannot legally agree to these terms yourself, obtain the consent required by applicable law."
        ]
      },
      {
        "id": "use",
        "title": "Acceptable use",
        "paragraphs": [
          "Do not use hosted services unlawfully, access another person’s data without authorization, distribute malicious code, disrupt service, bypass access controls or intentionally evade service limits. Security research must not expose other users’ data or damage service.",
          "We may restrict hosted access where reasonably needed to address abuse, a security risk or a legal requirement. This does not revoke your open-source license. When feasible and appropriate, we will explain the restriction; urgent threats may require action first."
        ]
      },
      {
        "id": "optional",
        "title": "Optional services and third parties",
        "paragraphs": [
          "The local board does not require a hosted account. Sync and AI depend on network access and third-party services, including Google, Supabase, GitHub and the AI providers you choose. Those providers have their own terms and may change availability.",
          "The currently distributed app is free; AI providers may charge you directly under your own account. These terms do not enroll you in a subscription. Any future paid offering must disclose its price and terms before you choose to buy it."
        ]
      },
      {
        "id": "ai",
        "title": "AI output",
        "paragraphs": [
          "AI suggestions may be incorrect, incomplete or unsuitable. Review generated plans, task placement, relationships and text before relying on them. You remain responsible for decisions and actions based on the output. AI output is not a substitute for qualified professional advice."
        ]
      },
      {
        "id": "availability",
        "title": "Changes, backups and ending use",
        "paragraphs": [
          "We may update the software and hosted service, impose reasonable operational limits, or discontinue a hosted feature. There is no promised uptime or recovery time. For a planned material shutdown, we will aim to give reasonable notice and an opportunity to export available data; urgent security or legal needs may prevent advance notice.",
          "You may stop using the services at any time. Signing out or uninstalling does not request cloud deletion. Email us for hosted account deletion, and separately manage local files and backups. The Privacy Policy explains retention and deletion."
        ]
      },
      {
        "id": "warranty",
        "title": "Warranty and liability",
        "paragraphs": [
          "To the extent permitted by applicable law, hosted services and the website are provided as available, without guarantees that they will be uninterrupted, error-free or suitable for a particular purpose. Open-source software warranty and liability provisions are stated in its licenses.",
          "To the extent permitted by law, the maintainer is not responsible for indirect or consequential loss arising from service use, including loss caused by third-party outages or lost credentials. Nothing in these terms excludes liability that cannot lawfully be excluded, or limits mandatory consumer or privacy rights."
        ]
      },
      {
        "id": "changes",
        "title": "Changes and questions",
        "paragraphs": [
          "We will publish updates here with a revised date and communicate material changes through the website or an appropriate product notice. Changes do not apply retroactively to remove existing rights. Contact us with questions about these terms or a service issue."
        ]
      }
    ]
  }
} satisfies LegalCatalog
