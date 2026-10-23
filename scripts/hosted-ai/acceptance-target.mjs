/**
 * [INPUT]: Explicit optional environment selector; fixed project identities and private configuration paths.
 * [OUTPUT]: Isolated acceptance arguments, project URL, session path and evidence prefix.
 * [POS]: Shared manual acceptance boundary; development remains the default, production is explicit.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { developmentRef } from './client.mjs'
import { productionRef } from '../deploy/client.mjs'

export function acceptanceTarget() {
  const args = process.argv.slice(2), index = args.indexOf('--environment')
  const environment = index < 0 ? 'development' : args[index + 1]
  assert(['development', 'production'].includes(environment), 'Unknown acceptance environment')
  if (index >= 0) args.splice(index, 2)
  assert(!args.includes('--environment'), 'Duplicate environment selector')
  const production = environment === 'production', projectRef = production ? productionRef : developmentRef
  return { args, environment, projectRef, projectUrl: `https://${projectRef}.supabase.co`,
    config: production ? '.env.deploy.production.local' : '.env.deploy.local',
    sessionFile: production ? '.env.hosted-ai-session.production.local' : '.env.hosted-ai-session.local',
    prefix: production ? 'production-' : '' }
}
