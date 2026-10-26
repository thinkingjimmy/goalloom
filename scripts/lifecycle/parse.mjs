/**
 * [INPUT]: Current owned lifecycle migrations and the previously pinned local pglast 6.17 parser.
 * [OUTPUT]: Hash-bound SQL and nested PL/pgSQL grammar evidence, without database acceptance.
 * [POS]: Source-only validation. Never loads credentials, installs tools or connects remotely.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const files=['0025_service_lifecycle.sql','0026_account_deletion.sql','0028_lifecycle_cleanup.sql']
const inputs=await Promise.all(files.map(async file=>({file,sql:await readFile(`supabase/migrations/${file}`,'utf8')})))
const program=String.raw`
import sys,json,hashlib
sys.path.insert(0,'/private/tmp/goalloom-d2-sql-parser')
import pglast
from pglast import ast,parse_sql,parse_plpgsql
assert pglast.__version__=='v6.17'
reports=[]
for item in json.load(sys.stdin):
 s=item['sql'];r={'file':item['file'],'sha256':hashlib.sha256(s.encode()).hexdigest(),'statements':0,'blocks':0,'failures':[]};reports.append(r)
 try: statements=parse_sql(s);r['statements']=len(statements)
 except Exception as e:r['failures'].append({'stage':'outer','message':str(e)});continue
 for raw in statements:
  node=raw.stmt;options={o.defname:o.arg for o in node.options} if isinstance(node,ast.CreateFunctionStmt) else {}
  name='.'.join(x.sval for x in node.funcname) if isinstance(node,ast.CreateFunctionStmt) else 'DO'
  text=s[raw.stmt_location:raw.stmt_location+raw.stmt_len] if raw.stmt_len else s[raw.stmt_location:]
  try:
   if isinstance(node,ast.DoStmt) or options.get('language') and options['language'].sval=='plpgsql':parse_plpgsql(text);r['blocks']+=1
   elif options.get('language') and options['language'].sval=='sql':
    for body in options['as']:parse_sql(body.sval);r['blocks']+=1
  except Exception as e:r['failures'].append({'stage':'body','name':name,'message':str(e)})
print(json.dumps({'ok':not any(r['failures'] for r in reports),'sourceOnly':True,'databaseParsed':False,'parser':pglast.__version__,'grammar':pglast.parser.get_postgresql_version(),'reports':reports},indent=2))
`
const run=spawnSync('/Applications/Xcode.app/Contents/Developer/usr/bin/python3',['-c',program],{input:JSON.stringify(inputs),encoding:'utf8'})
if(run.status!==0)throw Error(run.stderr||'Parser unavailable')
const report=JSON.parse(run.stdout),directory='output/tests/billing/desktop/d2-lifecycle'
await mkdir(directory,{recursive:true});await writeFile(`${directory}/grammar.json`,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1
