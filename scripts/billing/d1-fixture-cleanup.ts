/**
 * [INPUT]: Development service client and exact locally recorded synthetic Auth identity.
 * [OUTPUT]: Scoped billing FK cleanup before existing workspace/Auth fixture cleanup.
 * [POS]: Shared D1 acceptance helper. It cannot clean a personal or unrecorded identity.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
type Result = { error: unknown }
type Client = {
  auth: { admin: { getUserById(id: string): Promise<{data:{user:{id:string;email?:string}|null};error:unknown}> } }
  from(table: string): { delete(): { eq(column: string,value: string): PromiseLike<Result> } }
}
export async function cleanupD1FixtureBilling(input: {url:string;client:Client;userId:string;email:string}): Promise<void> {
  if (input.url!=='https://asqyvcnxdltzzfutbbqy.supabase.co') throw Error('Development fixture project required')
  if (!/^[0-9a-f-]{36}$/.test(input.userId)
    || !/^(?:p0-proto-[0-9a-f-]{36}|billing-[0-9a-f-]{36})@goalloom\.test$/.test(input.email)) throw Error('Exact synthetic fixture identity required')
  const identity=await input.client.auth.admin.getUserById(input.userId)
  if (identity.error||identity.data.user?.id!==input.userId||identity.data.user.email!==input.email) throw Error('Fixture identity mismatch')
  for (const table of ['billing_compensations','billing_grace','billing_transactions','billing_subscriptions','billing_operations','billing_customers','billing_accounts','billing_inbox']) {
    const result=await input.client.from(table).delete().eq('user_id',input.userId)
    if (result.error) throw Error(`Fixture cleanup failed: ${table}`)
  }
}
