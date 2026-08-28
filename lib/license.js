// Simple SaaS license helper for Selar
// In production, replace verifiedKeys Set with DB / Selar API check
export const LICENSE_KEY_STORE = "roost_license_key";
export const LICENSE_STATUS_STORE = "roost_license_status";

export function normalizeKey(k){ return (k||'').trim().toUpperCase().replace(/\s+/g,''); }
export function isValidFormat(key){
  const k=normalizeKey(key);
  // ROOST-XXXX-XXXX-XXXX or ROOST-XXXX-XXXX-...
  return /^ROOST-[A-Z0-9]{4,}-[A-Z0-9-]{4,}$/.test(k) && k.length >= 14;
}
// Mock verify: for demo, any ROOST- key is valid. Replace with fetch to Selar / DB.
export async function verifyLicense(key){
  const k=normalizeKey(key);
  if(!isValidFormat(k)) return {valid:false, reason:'Invalid format. Expected ROOST-XXXX-XXXX-...'};
  // Optional: block demo keys if env says so
  // In production: call Selar API: https://api.selar.co/v1/licenses/verify
  return {valid:true, plan:'lifetime', email:'buyer@selar.co'};
}
export function saveLicense(key, meta){
  if(typeof window==='undefined') return;
  localStorage.setItem(LICENSE_KEY_STORE, normalizeKey(key));
  localStorage.setItem(LICENSE_STATUS_STORE, JSON.stringify({valid:true, ...meta, verifiedAt:new Date().toISOString()}));
}
export function clearLicense(){
  if(typeof window==='undefined') return;
  localStorage.removeItem(LICENSE_KEY_STORE);
  localStorage.removeItem(LICENSE_STATUS_STORE);
}
export function getStoredKey(){
  if(typeof window==='undefined') return null;
  return localStorage.getItem(LICENSE_KEY_STORE);
}
