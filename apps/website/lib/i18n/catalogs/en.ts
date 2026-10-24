/**
 * [INPUT]: Has no runtime dependencies
 * [OUTPUT]: Exports the English catalog and SiteCatalog, the shape every other locale must match
 * [POS]: lib/i18n/catalogs' reference language; app-facing words (columns, "All", Jev's sentence) are copied from
 *        src/renderer/i18n/locales/en so the demo reads exactly like the app
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

const en = {
  meta: {
    title: 'Goalloom — an OKR-driven to-do app that keeps goals in view',
    description:
      'Goalloom connects this quarter’s goals to today’s to-dos. Five time columns, goal links and relation lines, and Jev smart input. Free, open source, local-first for macOS and Windows.',
    socialAlt: 'Goalloom’s goal board on a paper-cut landscape',
  },
  nav: {
    home: 'Goalloom home',
    main: 'Main',
    board: 'Goal board',
    jev: 'Smart input',
    releases: 'Releases',
    github: 'GitHub',
    download: 'Download',
    language: 'Language',
    menu: 'Menu',
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
  },
  hero: {
    h1: 'Goalloom: an OKR-driven, local-first to-do app',
    menus: ['File', 'Edit', 'View', 'Window', 'Help'],
    clock: 'Thu Sep 25 9:41',
    scenes: 'Demo scenes',
    sceneJev: 'Smart input',
    sceneLines: 'Relation lines',
    sync: {
      title: 'Encrypted sync',
      description: 'Mobile design preview: end-to-end encrypted sync, with the same Today tasks as the desktop demo.',
    },
  },
  demo: {
    horizons: { cycle: '3 months', month: 'This month', week: 'This week', day: 'Today' },
    meta: { cycle: '9/25 – 12/24', month: 'Sep', week: '9/21 – 9/27', day: 'Sep 25' },
    all: 'All',
    onlyFlow: 'Show only ',
    flows: { a: 'Ship the next Goalloom release', b: 'Run a first half marathon', c: 'Save a travel fund' },
    items: {
      q1: 'Ship the next Goalloom release', q2: 'Run a first half marathon', q3: 'Save a travel fund',
      m1: 'Finish the site & downloads', m2: 'Test both platform builds', m3: 'Run 25 km a week', m4: 'Cancel two unused subscriptions',
      w1: 'Write the site copy', w2: 'Record the demo video', w3: 'Test on Windows hardware', w4: 'Saturday long run, 12 km', w5: 'Call Mom and Dad',
      d1: 'Polish the homepage hero', d2: 'Cut a 30-second demo', d3: 'Morning run, 5 km', d4: 'Reply to the landlord', d5: 'Pay the utility bill',
      q4: 'Read six books', m5: 'Book flights for the trip', w6: 'Compare flight prices', d6: 'Book a dentist visit',
      d7: 'Check links and nested tasks', d8: 'Check the mobile layout',
      n1: 'Illustrate the site’s hero', n2: 'Polish the homepage hero',
    },
    complete: 'Complete: ',
    reopen: 'Mark as not done: ',
    search: 'Search and commands',
    columns: 'Shown columns: Later is hidden',
    settings: 'Settings',
    history: 'Past periods: ',
    addIn: 'New in ',
    newItem: 'New',
    composer: {
      placeholder: 'Write down an idea, or one thing per line…',
      heroText: 'Illustrate the site’s hero today',
      pending: 'Jev is organizing…',
      adjust: 'Adjust',
      keepAsLater: 'Save as-is to Later',
      entryTip: 'The global + collects or smartly organizes ideas; a column’s + still adds directly to that column.',
      clear: 'Clear draft',
      close: 'Close',
    },
    // "Put in Today, under “Finish the site & downloads”" is the app's single-draft sentence (placeTo + under).
    sentence: 'Put in Today, under “Finish the site & downloads”',
    createTo: 'Create in Today',
    created: 'Item created',
    undone: 'Undone',
    undo: 'Undo',
    dismiss: 'Dismiss',
  },
  note: {
    eyebrow: 'Why Goalloom',
    before: 'I have ADHD, and urgent things pull my attention away easily. I built Goalloom so ',
    em1: 'long-term goals show up every day',
    middle: ', and noting something down costs ',
    em2: 'too little to hesitate',
    after: '.',
    author: 'Jimmy · maker of Goalloom',
    authorUrl: 'https://x.com/hellojimmywong',
  },
  intro: {
    label: 'Product tour',
    title: ['See how Goalloom', 'works.'],
    description: ['From breaking down goals to planning today.', 'Watch the complete workflow in a short video.'],
    watch: 'Play film',
    play: 'Play the Goalloom product tour',
    coverTitle: ['From one goal,', 'to today’s next step.'],
    coverFootnote: 'Your goals, every day.',
    caption: 'Goalloom product tour',
    reset: 'Back to cover',
    videoLabel: 'Goalloom product tour (silent, Chinese interface)',
    transcript: 'Silent screen recording: follow linked goals and tasks, open smart input, then create a to-do in Today.',
    error: 'The video could not play. Please try again.',
  },
  okr: {
    eyebrow: 'OKR · To-do',
    title: ['A to-do app built around OKRs.', 'What matters stops drowning in what’s urgent.'],
    lead:
      'Most checked-off items are urgent; the yearly goals keep slipping. Goalloom breaks the year into quarters, months and weeks, then lands it on today — every to-do knows which goal it serves.',
  },
  lines: {
    eyebrow: '01 / Relation lines',
    title: ['Open one goal,', 'and its whole chain lights up.'],
    body: 'Every item can sit under a goal in a longer horizon. Links only answer “why”: they never roll up progress or change status.',
    casesLabel: 'Four ways to use relation lines',
    cases: [
      { title: 'One-key filter', desc: 'Click a goal’s swatch or press ⌘2 to see every linked to-do at once.' },
      { title: 'Hover the chain', desc: 'Point at any item and its path from goal to today lights up.' },
      { title: 'One goal, many steps', desc: 'A parent links to several children, all the way down to today.' },
      { title: 'Keyboard-first', desc: '⌘1–⌘9 switch goals, ⌘N new, ⌘K search, ⌘Z undo.' },
    ],
    shortcuts: { newItem: 'New', search: 'Search & commands', undo: 'Undo', switchGoal: 'Switch goal' },
  },
  jev: {
    eyebrow: 'Smart input · Jev',
    title: ['Write what comes to mind.', 'Jev handles the rest.'],
    lead:
      'Built for easily distracted minds: the cheaper it is to write something down, the less you forget; the more often goals are in view, the less they slip.',
    subEyebrow: '02 / Quick capture',
    subTitle: ['One sentence,', 'the right column and goal.'],
    body:
      'Jev reads your past to-dos and goals, understands phrases like “today” or “this week”, places the item in the right column and suggests the goal it belongs under. Write a few lines at once and it organizes them together.',
    demoLabel: 'Demo: type one thing, Jev organizes it, create it in Today',
    typed: 'Polish the homepage hero today',
    cards: [
      { title: '⌘N from anywhere', desc: 'Press Return to create. Capturing costs almost nothing.' },
      { title: 'Preview first', desc: 'Every suggestion is editable, and a batch undoes in one step.' },
      { title: 'Fast auto-placement', desc: 'Links the right goal and lands in the right column.' },
      { title: 'BYOK', desc: 'Bring your own key. It stays in the system keychain, never in backups.' },
    ],
  },
  download: {
    eyebrow: 'Download · FAQ',
    title: ['Start connecting', 'goals to today.'],
    lead: 'Free and open source. Installers are published on GitHub Releases.',
    mac: { action: 'Download for macOS', detail: 'macOS 14+ · Apple Silicon' },
    windows: { action: 'Download for Windows', detail: 'Windows 11 · x64' },
    also: 'Also available for',
    otherSystems: 'Download for other operating systems',
    phone: 'On your phone? Copy the download link for your computer',
    copied: 'Link copied — open it on your computer',
    ask: 'More questions?',
    askLink: 'Ask on GitHub',
  },
  faq: {
    title: 'Frequently asked questions',
    intro: 'About using Goalloom, your data and AI.',
    freeQuestion: 'Which features are free to use?',
    trialQuestion: 'Is there a free trial?',
    refundQuestion: 'Do you offer refunds?',
    security: {
      q: 'Is my data safe? Can you see my data?',
      a: 'Your tasks stay in a local SQLite workspace on your device, with daily backups. Optional sync encrypts workspace content on your device before upload. The server stores ciphertext without your plaintext sync password or device private key, so we cannot directly read that encrypted task content. We still process necessary account and sync metadata. If you choose to use AI, the required input and context are readable by your selected provider; built-in AI also processes them through Goalloom. AI processing is outside sync end-to-end encryption. Enabling sync does not automatically encrypt the local database, exports or backups.',
    },
    helpTitle: 'Still have a question?',
    helpBody: 'For account, billing or privacy questions, {contact}. For technical issues, {technical} on GitHub.',
    contact: 'contact support',
    technical: 'report a technical issue',
  },
  footer: {
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    rights: '© 2026 Goalloom',
    links: 'Footer',
    feedback: 'Feedback',
  },
}

export type SiteCatalog = typeof en
export default en
