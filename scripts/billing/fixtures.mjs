/**
 * [INPUT]: Synthetic billing configuration and mutable scenario state.
 * [OUTPUT]: Controlled Stripe/RevenueCat transports for HTTP integration; never provider evidence.
 * [POS]: D0 acceptance fixture. Real Auth/PostgreSQL are supplied by the owning runner.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function providerFixture(config) {
  const state = { customers: [], sessions: [], subscriptions: [], invoices: [], schedules: [],
    createCalls: 0, providerCalls: 0, dropCheckout: false, disputes: [], refunds: [], voided: 0, stopped: 0, writes: [], rcAccess: true, rcPending: false, dropAfter: null, racePaidOnVoid: false }
  const stable = new Map(), result = data => ({ data, has_more: false })
  const iterable = data => ({ async *[Symbol.asyncIterator]() { yield* data } })
  const find = (items, id) => { const item = items.find(value => value.id === id); if (!item) throw Error('fixture_object_missing'); return item }
  const idempotent = async (key, run) => { if (!stable.has(key)) stable.set(key, await run()); return stable.get(key) }
  const stripe = {
    accounts: { retrieve: async () => ({ id: config.account }) },
    prices: { retrieve: async id => ({ id, active: true, livemode: false, currency: 'usd', tax_behavior: 'inclusive',
      unit_amount: id === config.prices.monthly ? 899 : 7900, billing_scheme: 'per_unit',
      recurring: { interval: id === config.prices.monthly ? 'month' : 'year', interval_count: 1, usage_type: 'licensed' } }) },
    tax: { registrations: { list: async () => result([]) } },
    billingPortal: {
      configurations: { retrieve: async () => ({ active: true, features: { subscription_update: { enabled: false },
        subscription_cancel: { enabled: true, mode: 'at_period_end' }, payment_method_update: { enabled: true }, invoice_history: { enabled: true } } }) },
      sessions: { create: async () => ({ id: 'bps_Fixture', url: 'https://billing.stripe.com/p/session/fixture' }) },
    },
    customers: { create: async (args, options) => idempotent(options.idempotencyKey, () => { const value = { id: 'cus_Fixture', ...args }; state.customers.push(value); return value }) },
    checkout: { sessions: {
      create: async (args, options) => {
        state.createCalls++
        const value = await idempotent(options.idempotencyKey, () => { const value = { id: 'cs_test_Fixture', status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture', ...args }; state.sessions.push(value); state.writes.push(args); return value })
        if (state.dropCheckout) { state.dropCheckout = false; throw Error('fixture_unknown_outcome') }
        return value
      },
      retrieve: async id => find(state.sessions,id), list: async () => result(state.sessions),
    } },
    subscriptions: {
      list: ({ customer }) => iterable(state.subscriptions.filter(value => value.customer === customer)),
      retrieve: async id => find(state.subscriptions,id),
      update: async (id,args) => { const value=find(state.subscriptions,id); Object.assign(value,args); state.writes.push(args); return value },
      cancel: async id => { const value=find(state.subscriptions,id); value.status='canceled'; state.stopped++;if(state.dropAfter==='cancel'){state.dropAfter=null;throw Error('fixture_after_cancel')} return value },
    },
    subscriptionSchedules: {
      create: async (args,options) => idempotent(options.idempotencyKey, () => { const sub=find(state.subscriptions,args.from_subscription),value={ id:'sub_sched_Fixture',status:'active',subscription:sub.id,customer:sub.customer,current_phase:{start_date:sub.items.data[0].current_period_start},phases:[] };sub.schedule=value.id;state.schedules.push(value);return value }),
      retrieve: async id => find(state.schedules,id),
      update: async (id,args) => { const value=find(state.schedules,id);Object.assign(value,args);return value },
      release: async id => { const value=find(state.schedules,id);value.status='released';find(state.subscriptions,value.subscription).schedule=null;if(state.dropAfter==='release'){state.dropAfter=null;throw Error('fixture_after_release')}return value },
    },
    invoices: {
      list: ({subscription}) => iterable(state.invoices.filter(value=>value.parent.subscription_details.subscription===subscription)),
      retrieve: async id => find(state.invoices,id), listLineItems: async id => result(find(state.invoices,id).lines.data),
      voidInvoice: async id => { const value=find(state.invoices,id);if(state.racePaidOnVoid){state.racePaidOnVoid=false;state.rcPending=false;value.status='paid';value.amount_paid=899;value.amount_remaining=0;value.status_transitions.paid_at=value.lines.data[0].period.start+1;throw Error('fixture_paid_race')}if(value.status==='paid')throw Error('fixture_paid_race');value.status='void';state.voided++;if(state.dropAfter==='void'){state.dropAfter=null;throw Error('fixture_after_void')}return value },
    },
    invoicePayments: { list: async ({invoice}) => result([{id:'inpay_Fixture',status:find(state.invoices,invoice).status==='paid'?'paid':'open',amount_paid:899,payment:{payment_intent:`pi_${invoice}`}}]) },
    paymentIntents: { retrieve: async id => ({id,status:find(state.invoices,id.slice(3)).status==='paid'?'succeeded':'requires_payment_method',latest_charge:`ch_${id.slice(3)}`}) },
    charges: { retrieve: async id => ({id,customer:'cus_Fixture',paid:true,livemode:false,amount_refunded:state.refunds.filter(value=>value.charge===id).reduce((n,value)=>n+value.amount,0)}) },
    refunds: { list: async ({charge}) => result(state.refunds.filter(value=>value.charge===charge)) },
    disputes: { list: async ({charge}) => result(state.disputes.filter(value=>value.charge===charge)) },
  }
  const rcFetch = async (url,init) => {
    state.providerCalls++
    if(url.includes('/v1/receipts')) {const body=JSON.parse(init.body);if(!body.app_user_id||body.fetch_token!=='sub_Fixture')throw Error('fixture_receipt_identity');return Response.json({subscriber:{}})}
    if(url.includes('/v1/subscribers/')) { if(init.headers.authorization!==`Bearer ${config.rcPublicKey}`)throw Error('fixture_v1_key');return Response.json({subscriber:{}}) }
    if(url.includes('/subscriptions?')) return Response.json({items:[{id:'subRcFixture',customer_id:state.owner,original_customer_id:state.owner,
      product_id:'prodRcFixture',store:'stripe',environment:'sandbox',store_subscription_identifier:'si_Fixture',gives_access:state.rcAccess,
      pending_payment:state.rcPending,status:state.rcAccess?'active':'expired',
      current_period_starts_at:state.subscriptions[0].items.data[0].current_period_start*1000,
      current_period_ends_at:state.subscriptions[0].items.data[0].current_period_end*1000,
      entitlements:{items:[{lookup_key:'plus'}]}}],next_page:null})
    if(url.includes('/products/')) return Response.json({app_id:config.rcApp,store_identifier:state.subscriptions[0].items.data[0].price.id})
    throw Error('fixture_rc_path')
  }
  state.purchase = (now,price=config.prices.monthly) => {
    const start=Math.floor(now/1000),end=start+30*86400
    state.sessions[0].status='complete'
    const sub={id:'sub_Fixture',customer:'cus_Fixture',livemode:false,status:'active',discounts:[],trial_start:null,trial_end:null,
      cancel_at_period_end:false,cancel_at:null,schedule:null,latest_invoice:'in_Fixture',items:{has_more:false,data:[{id:'si_Fixture',quantity:1,price:{id:price,product:'prod_Fixture'},current_period_start:start,current_period_end:end}]}}
    state.subscriptions.push(sub)
    state.invoice('in_Fixture',start,end,'paid','subscription_create')
    return sub
  }
  state.invoice=(id,start,end,status,reason)=>{const value={id,customer:'cus_Fixture',livemode:false,parent:{subscription_details:{subscription:'sub_Fixture'}},
    currency:'usd',discounts:[],status,attempted:true,amount_paid:status==='paid'?899:0,amount_remaining:status==='paid'?0:899,
    status_transitions:{paid_at:status==='paid'?start:null},billing_reason:reason,lines:{has_more:false,data:[{parent:{type:'subscription_item_details',subscription_item_details:{proration:false}},pricing:{price_details:{price:config.prices.monthly}},period:{start,end}}]}};state.invoices.unshift(value);return value}
  return { state, stripe, rcFetch }
}
