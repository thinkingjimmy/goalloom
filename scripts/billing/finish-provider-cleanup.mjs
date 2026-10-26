/**
 * [INPUT]: A named, previously verified disposable provider acceptance ledger.
 * [OUTPUT]: Repeatable Auth/billing cleanup recovery and finite retirement of late fixture RC events.
 * [POS]: Test cleanup only; no unknown-owner production policy or personal workspace access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {client} from '../hosted-ai/client.mjs'
import {cleanupFixtures} from './cleanup-fixtures.mjs'
import {retireFixtureEvents} from './provider-fixtures.mjs'
const names={monthly:'provider-acceptance',annual:'provider-acceptance-annual',grace:'grace-provider-acceptance'},name=names[process.argv[2]]
assert(name,'Use monthly, annual or grace')
const file=`output/tests/billing/desktop/${name}.json`,report=JSON.parse(await readFile(file,'utf8'))
assert(report.cleanup&&report.fixtureManifest?.customer===report.customer&&report.account&&report.checks.length>=4,'An existing verified cleanup ledger is required')
const db=await client()
report.lateEvents=await retireFixtureEvents(db,report.account,report.fixtureManifest)
report.cleanup=await cleanupFixtures(db,[report.account]);report.ok=report.cleanup.ok
if(report.ok)delete report.error
report.cleanupAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({ok:report.ok,account:report.account,cleanup:report.cleanup,retired:report.lateEvents.length},null,2));if(!report.ok)process.exitCode=1
