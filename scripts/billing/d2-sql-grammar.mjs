/**
 * [INPUT]: In-memory SQL documents and pinned local pglast; no database connection.
 * [OUTPUT]: Grammar reports and parser dependency hashes, without SQL text or secrets.
 * [POS]: Shared parser program for the original and final D2 rollback plans.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const sqlGrammarProgram=String.raw`
import sys,json,hashlib,pathlib,re,platform
root=sys.argv[1];sys.path.insert(0,root)
import pglast
from pglast import ast,parse_sql,parse_plpgsql
assert pglast.__version__=='v6.17','Pinned pglast version required'
payload=json.load(sys.stdin);reports=[]
def digest(s):return hashlib.sha256(s.encode()).hexdigest()
def error(e):
 message=str(e);token=re.search(r'at or near "([^"]+)"',message)
 return {'type':type(e).__name__,'token':token.group(1) if token and re.fullmatch('[A-Za-z_]{1,48}',token.group(1)) else None}
def walk(node):
 if isinstance(node,ast.Node):
  yield node
  for key in node:yield from walk(getattr(node,key))
 elif isinstance(node,(list,tuple)):
  for item in node:yield from walk(item)
def audit(name,s,nested=True):
 r={'name':name,'sha256':digest(s),'bytes':len(s.encode()),'statements':0,'plpgsql':[],'sqlBodies':[],'errors':[]};reports.append(r)
 try:statements=parse_sql(s);r['statements']=len(statements)
 except Exception as e:r['errors'].append({'stage':'outer',**error(e)});return
 for raw in statements:
  n=raw.stmt;text=s[raw.stmt_location:raw.stmt_location+raw.stmt_len] if raw.stmt_len else s[raw.stmt_location:]
  options={o.defname:o.arg for o in n.options} if isinstance(n,ast.CreateFunctionStmt) else {}
  if isinstance(n,ast.DoStmt) or options.get('language') and options['language'].sval=='plpgsql':
   label='.'.join(x.sval for x in n.funcname) if isinstance(n,ast.CreateFunctionStmt) else 'DO'
   try:parse_plpgsql(text);r['plpgsql'].append({'name':label,'ok':True})
   except Exception as e:r['plpgsql'].append({'name':label,'ok':False,**error(e)});r['errors'].append({'stage':'plpgsql','name':label,**error(e)})
  elif options.get('language') and options['language'].sval=='sql':
   label='.'.join(x.sval for x in n.funcname)
   for body in options['as']:
    try:parse_sql(body.sval);r['sqlBodies'].append({'name':label,'ok':True})
    except Exception as e:r['sqlBodies'].append({'name':label,'ok':False,**error(e)});r['errors'].append({'stage':'sql-body','name':label,**error(e)})
  if nested:
   for call in walk(n):
    if isinstance(call,ast.FuncCall) and [x.sval for x in call.funcname]==['pg_temp','d2_check']:
     audit(name+'/probe/'+call.args[0].val.sval,call.args[1].val.sval,False)
 if name=='rollback-gate':
  start=s.index('scripts text[]:=')+len('scripts text[]:=');end=s.index('];i integer;started',start)+1
  scripts=parse_sql('select '+s[start:end]+';')[0].stmt.targetList[0].val.elements
  start=s.index('names text[]:=')+len('names text[]:=');end=s.index(';scripts text[]:=',start)
  names=parse_sql('select '+s[start:end]+';')[0].stmt.targetList[0].val.elements
  for label,body in zip(names,scripts):audit('gate-stage/'+label.val.sval,body.val.sval)
for entry in payload['sqlInputs']:audit(entry['name'],entry['sql'])
def dep(path):
 p=pathlib.Path(path);b=p.read_bytes();return {'path':str(p),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
dependencies=[dep(sys.executable)]
for folder in ['pglast','pglast-6.17.dist-info']:
 for p in sorted((pathlib.Path(root)/folder).rglob('*')):
  if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':dependencies.append(dep(p))
print(json.dumps({'ok':not any(r['errors'] for r in reports),'parser':{'package':'pglast','version':pglast.__version__,'postgresqlGrammar':pglast.parser.get_postgresql_version(),'python':platform.python_version(),'platform':platform.platform()},'dependencies':dependencies,'reports':reports}))
`
