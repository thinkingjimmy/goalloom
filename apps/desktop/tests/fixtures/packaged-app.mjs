/**
 * [INPUT]: Optional packaged executable, isolated profile directory, and the test process environment.
 * [OUTPUT]: Playwright Electron launch options. A packaged build is copied outside the checkout.
 * [POS]: Shared launch for the release smokes. Source runs stay in the project directory.
 */
import assert from 'node:assert/strict'
import { access, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

async function exists(path) {
  return access(path).then(() => true, () => false)
}

// Node resolves a bare import by walking parent directories of the module file. The asar lives inside
// the app bundle, so a packaged binary left under apps/desktop/release still finds this repo's
// node_modules/@supabase/supabase-js. An installed copy under /Applications does not.
async function assertPackageUnreachable(start) {
  for (let directory = dirname(start); ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', '@supabase', 'supabase-js')
    assert.equal(await exists(candidate), false, `Packaged launch can still resolve @supabase/supabase-js from ${candidate}`)
    if (dirname(directory) === directory) break
  }
}

function bundleRoot(executable) {
  const marker = `${sep}Contents${sep}MacOS${sep}`
  const index = executable.lastIndexOf(marker)
  return index === -1 ? dirname(executable) : executable.slice(0, index)
}

export async function packagedElectronOptions(executable, profile, environment) {
  const env = { ...environment }
  if (!executable) return { options: { args: ['.', `--user-data-dir=${profile}`], env }, cleanup: async () => {} }
  delete env.NODE_PATH
  const sourceExecutable = resolve(executable)
  const bundle = bundleRoot(sourceExecutable)
  const destination = await mkdtemp(join(tmpdir(), 'goalloom-packaged-'))
  const target = join(destination, bundle.endsWith('.app') ? 'Goalloom.app' : 'app')
  await cp(bundle, target, { recursive: true, verbatimSymlinks: true })
  const executablePath = join(target, relative(bundle, sourceExecutable))
  await assertPackageUnreachable(executablePath)
  return {
    options: { executablePath, cwd: dirname(executablePath), args: [`--user-data-dir=${profile}`], env },
    cleanup: () => rm(destination, { recursive: true, force: true }),
  }
}
