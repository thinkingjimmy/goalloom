# components/

> Parent: [Website](../README.md)

- `site-document.tsx`: Static document language, pre-paint boot and client theme runtime.
- `boot.ts`: Shared theme storage key, system query and first-paint theme/platform initialization.
- `theme.tsx`: React controls, persisted mode and system-following policy. Pointer changes delegate to the transition boundary; keyboard/system changes commit immediately.
- `theme-transition.ts`: Native circular reveal, latest-intent guard, interruption cleanup and capability/reduced-motion fallbacks. Owns animation only; never owns stored theme policy.
- `site-header.tsx`: Shared navigation and information-page preference controls; homepage preferences live in the Hero.
- `language-menu.tsx`: Native locale links with shared outside-pointer dismissal and Escape focus restoration across Hero, header and footer.
- `info-disclosure.tsx`: Inline Hugeicons information trigger, localized disclosure and shared outside/Escape dismissal; usable without JavaScript.
- `download-button.tsx`: Header download anchor and homepage Free-plan split download link, alternate-system menu and phone copy-link fallback.
- `copy-link.tsx`: Phone download-link copying with visible completion feedback.
- `use-dismissible-menu.ts`: Native details dismissal shared by language, download and information controls; outside pointer preserves the target action, Escape restores summary focus.
- `site-footer.tsx`: Shared legal, pricing, private support and language links.
- `legal-page.tsx`: Static legal documents and contents navigation with the shared sticky header; no standalone Plus policy banner.
- `icons.tsx`: Shared Hugeicons and product mark.
- `faq-list.tsx`: Shared native exclusive FAQ answers with first-item expansion, rich content and plus/minus indicators for homepage and pricing.
- `motion.tsx`: Shared viewport observation and progressive section visibility without hiding no-JS content.
- `home/`: Interactive Hero, original maker-note/video introduction and the common FAQ shared with pricing: free features, trial, security, refunds and inline support. `product-tour.tsx` pairs the original five-language ADHD motivation as one regular-weight paragraph with Jimmy’s avatar and the quiet-screening video; it has no scene controls. Relation/AI illustration components are currently not mounted in the body. `hero-phone.tsx` still mirrors the Hero task state as a read-only mobile concept.
- `board/`: Shared demo board, composer, link previews and relation geometry; see its README.
- `services/`: Static pricing and closed billing/support surfaces; see its README.

`home/video-intro.tsx` uses an inverse-theme typographic cover with a text play action and an internal reset, without an exterior caption or duration. It plays the bundled `public/product-tour.mp4` only on request and pauses offscreen/when hidden. The maker note, local avatar, native details and video controls remain available without JavaScript; no third-party player is loaded.

Theme motion uses native browser snapshots, not an additional animation library. The state commit remains synchronous inside the native transition callback. Newer choices invalidate older callbacks; failure must still leave the selected theme usable.

[PROTOCOL]: Update this header when making changes, then check README.md.
