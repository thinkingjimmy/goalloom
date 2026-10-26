/**
 * [INPUT]: Owner-only ignored billing environment file.
 * [OUTPUT]: Private in-process values and atomic configuration replacement without console output.
 * [POS]: D0 tooling secret boundary; never used by the client or evidence serializer.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile,stat,rename} from 'node:fs/promises'
import {parseEnv} from 'node:util'
export async function privateConfig(){try{assert(((await stat('.env.billing.local')).mode&0o077)===0,'Billing config must be owner-only');return parseEnv(await readFile('.env.billing.local','utf8'))}catch(error){if(error.code==='ENOENT')return {};throw error}}
export async function savePrivate(values){const current=await privateConfig(),all={...current,...values};assert(Object.values(all).every(value=>typeof value==='string'&&!/[\r\n']/.test(value)),'Private environment values must fit a single quoted line');await writeFile('.env.billing.local.tmp',Object.entries(all).map(([name,value])=>`${name}='${value}'`).join('\n')+'\n',{mode:0o600});await rename('.env.billing.local.tmp','.env.billing.local')}
