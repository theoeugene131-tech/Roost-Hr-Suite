import { NextResponse } from 'next/server';

// POST { key: "ROOST-XXXX-..." } → { valid: true|false }
// Replace this mock with real Selar verification:
// - Selar webhook stores licenses in DB (Vercel KV / Postgres / Supabase)
// - Here we lookup key in DB or call Selar API https://api.selar.co/v1/products/{id}/licenses/verify
// Demo: any ROOST-xxxx key is accepted.

export async function POST(req){
  try{
    const {key} = await req.json();
    const k = String(key||'').trim().toUpperCase();
    const valid = /^ROOST-[A-Z0-9]{4,}-[A-Z0-9-]{4,}$/.test(k) && k.length>=14;
    if(!valid) return NextResponse.json({valid:false, reason:'Invalid format. Get your key from Selar.'},{status:200});
    // TODO: check against DB / Selar
    // const selarRes = await fetch(`https://api.selar.co/v1/licenses/verify`, { headers:{Authorization:`Bearer ${process.env.SELAR_API_KEY}`} })
    return NextResponse.json({valid:true, plan:'lifetime', product:'Roost HR Suite'});
  }catch(e){
    return NextResponse.json({valid:false, reason:'Server error'}, {status:500});
  }
}
export async function GET(){
  return NextResponse.json({ok:true, usage:'POST {key} to verify license. Get key on Selar after purchase. WhatsApp +2348026892077'});
}
