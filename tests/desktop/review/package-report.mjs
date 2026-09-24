/**
 * Failure cases: an older archive is selected; a missing current archive passes;
 * current filenames mask an unpacked application from another version.
 * Exercises the real CLI against synthetic ASAR/package trees, not an installer.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createPackage } from '@electron/asar'

const evidence=resolve('output/tests/review-followup')
await mkdir(evidence,{recursive:true})
const directory=await mkdtemp(join(evidence,'package-fixture-')), checks=[]
const metadata=JSON.parse(await readFile('package.json','utf8'))
const locales=JSON.parse(await readFile('scripts/build/package-locales.json','utf8'))
try {
  await writeFile(join(directory,'package.json'),JSON.stringify(metadata))
  await mkdir(join(directory,'scripts/build'),{recursive:true})
  await writeFile(join(directory,'scripts/build/package-locales.json'),JSON.stringify(locales))
  const source=join(directory,'source'); await mkdir(join(source,'out'),{recursive:true})
  await writeFile(join(source,'out/THIRD_PARTY_NOTICES.txt'),'Synthetic license fixture')
  for (const platform of ['darwin-arm64','win32-x64']) {
    const mac=platform==='darwin-arm64', root=join(directory,platform)
    const app=join(root,mac?'mac-arm64/Goalloom.app':'win-unpacked')
    const resources=join(app,mac?'Contents/Resources':'resources')
    await mkdir(resources,{recursive:true})
    await writeFile(join(source,'package.json'),JSON.stringify(metadata))
    await createPackage(source,join(resources,'app.asar'))
    for(const locale of locales[platform]) {
      const location=mac?join(app,`Contents/Frameworks/${locale}.lproj`):join(app,'locales')
      await mkdir(location,{recursive:true}); await writeFile(join(location,mac?'locale.pak':`${locale}.pak`),'fixture')
    }
    const current=`Goalloom-${metadata.version}-${mac?'mac-arm64.zip':'win-x64.exe'}`
    const bytes=Buffer.alloc(512); bytes.write(mac?'PK\x03\x04':'MZ')
    if(!mac) { bytes.writeUInt32LE(0x80,0x3c); bytes.write('PE\x00\x00',0x80); bytes.writeUInt16LE(0x10b,0x98) }
    await writeFile(join(root,'Goalloom-0.0.0-'+(mac?'mac-arm64.zip':'win-x64.exe')),bytes.subarray(0,24))
    await writeFile(join(root,current),bytes)
    const run=()=>spawnSync(process.execPath,[resolve('scripts/build/package-report.mjs'),root,'fixture',platform],{cwd:directory,encoding:'utf8'})
    const result=run(); assert.equal(result.status,0,result.stderr)
    const report=JSON.parse(await readFile(join(directory,`output/tests/packages/fixture-${platform}.json`),'utf8'))
    assert.equal(report.archive,join(root,current))
    assert.equal(report.sha256,createHash('sha256').update(bytes).digest('hex'))
    await rm(join(root,current))
    const missing=run(); assert.notEqual(missing.status,0,'Missing current artifact must fail')
    await writeFile(join(root,current),bytes)
    await writeFile(join(source,'package.json'),JSON.stringify({...metadata,version:'0.0.0'}))
    await createPackage(source,join(resources,'app.asar'))
    const stale=run(); assert.notEqual(stale.status,0,'Stale unpacked version must fail')
    checks.push({platform,selected:current,sha256:report.sha256,missingRejected:true,staleUnpackedRejected:true})
  }
  await writeFile(join(evidence,'package-report.json'),JSON.stringify({scope:'Synthetic CLI fixture; not installation acceptance',checks},null,2))
  console.log(JSON.stringify(checks))
} finally { await rm(directory,{recursive:true,force:true}) }
