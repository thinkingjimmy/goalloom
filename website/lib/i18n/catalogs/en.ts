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
    sceneBoard: 'Goal board',
    sceneJev: 'Smart input',
    sceneLines: 'Relation lines',
  },
  demo: {
    horizons: { cycle: '3 months', month: 'This month', week: 'This week', day: 'Today' },
    meta: { cycle: '9/25 – 12/24', month: 'Sep', week: '9/21 – 9/27', day: 'Sep 25' },
    all: 'All',
    onlyFlow: 'Show only ',
    flows: { a: 'Ship Goalloom 1.0', b: 'Run a first half marathon', c: 'Save a travel fund' },
    items: {
      q1: 'Ship Goalloom 1.0', q2: 'Run a first half marathon', q3: 'Save a travel fund',
      m1: 'Finish the site & downloads', m2: 'Test both platform builds', m3: 'Run 25 km a week', m4: 'Cancel two unused subscriptions',
      w1: 'Write the site copy', w2: 'Record the demo video', w3: 'Test on Windows hardware', w4: 'Saturday long run, 12 km', w5: 'Call Mom and Dad',
      d1: 'Lock the homepage headline', d2: 'Cut a 30-second demo', d3: 'Morning run, 5 km', d4: 'Reply to the landlord', d5: 'Pay the utility bill',
      n1: 'Illustrate the site’s hero', n2: 'Lock the homepage headline',
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
    typed: 'Lock the homepage headline today',
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
    phone: 'On your phone? Copy the download link for your computer',
    copied: 'Link copied — open it on your computer',
    ask: 'More questions?',
    askLink: 'Ask on GitHub',
  },
  faq: {
    title: 'Questions, answered',
    items: [
      { q: 'Is Goalloom free?', a: 'Yes. Goalloom is free and open source. Smart input uses your own AI provider key and is billed by that provider; everything else works without it.' },
      { q: 'How is it different from a regular to-do app?', a: 'Every item sits in a time column — Later, 3 months, this month, this week, today — and can link to goals in longer horizons, so daily work stays connected to the quarter’s goals instead of burying them.' },
      { q: 'What is Jev, and do I need it?', a: 'Jev is the optional smart input. It reads your goals and past to-dos to place new items and suggest a parent. When you use it, your text goes to the provider you chose; skip it and the board works fully offline.' },
      { q: 'Where is my data stored?', a: 'In a local SQLite workspace on your computer, with daily backups. There is no account, no cloud sync and no content telemetry.' },
      { q: 'Which systems are supported?', a: 'macOS 14 or later on Apple Silicon, and Windows 11 x64. The app speaks Chinese, English, Japanese, Spanish and French.' },
      { q: 'Is there a mobile app or sync?', a: 'Not yet. Goalloom is a local desktop app for now.' },
      { q: 'macOS says it can’t verify the developer. What now?', a: 'Early builds are not signed yet. Control-click the app and choose Open, or allow it under System Settings → Privacy & Security.' },
    ],
  },
  footer: {
    rights: '© 2026 Goalloom',
    links: 'Footer',
    feedback: 'Feedback',
  },
}

export type SiteCatalog = typeof en
export default en
