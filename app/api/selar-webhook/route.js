import { NextResponse } from 'next/server';

// Selar webhook: Selar → POST here on successful payment
// Configure in Selar: Settings → Webhooks → URL = https://roost-hr-suite.vercel.app/api/selar-webhook
// Events: product.purchase / payment.success
// We generate a license key and email it (Selar handles delivery, we just log/store).

function genKey(){
  const seg=()=> Math.random().toString(36).slice(2,6).toUpperCase();
  return `ROOST-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export async function POST(req){
  try{
    const body = await req.json().catch(()=> ({}));
    // Verify Selar signature if you set SELAR_WEBHOOK_SECRET
    // const sig = req.headers.get('x-selar-signature');
    // if(process.env.SELAR_WEBHOOK_SECRET && sig !== expected) return 401
    const buyerEmail = body?.email || body?.buyer_email || body?.customer?.email || 'customer@selar.co';
    const productId = body?.product_id || 'roost-hr-suite';
    const key = genKey();
    // TODO: persist to DB (Vercel KV / Supabase / Postgres) for later /api/verify lookup
    // e.g. await kv.set(`license:${key}`, JSON.stringify({email:buyerEmail, createdAt: new Date().toISOString()}));
    console.log('[selar-webhook] payment', {buyerEmail, productId, key});
    // Optionally send WhatsApp/email via your provider here
    return NextResponse.json({ok:true, key, hint:'Store this and email to buyer. Selar can auto-deliver via Delivery File using webhook.'});
  }catch(e){
    return NextResponse.json({ok:false, error:String(e)},{status:500});
  }
}
export async function GET(){
  return NextResponse.json({ok:true, info:'Selar webhook endpoint. POST from Selar on purchase. Set SELAR_WEBHOOK_SECRET env.'});
}
