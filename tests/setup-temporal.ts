const temporal = (globalThis as { Temporal?: object }).Temporal
if (!temporal) {
  throw new Error('Native Temporal is missing. Run `pnpm test`, which starts Vitest with Electron’s Node. `npx vitest` uses the system Node and does not load Temporal.')
}
