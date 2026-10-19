// Browser-side helpers. Only a server-confirmed key may be saved as valid.
export const LICENSE_KEY_STORE = "roost_license_key";
export const LICENSE_STATUS_STORE = "roost_license_status";

export function normalizeKey(key) {
  return (key || "").trim().toUpperCase().replace(/\s+/g, "");
}
export function isValidFormat(key) {
  return /^ROOST-[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/.test(normalizeKey(key));
}
export async function checkLicense(key) {
  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: normalizeKey(key) }),
    });
    if (response.status === 429) return { valid: false, offline: true, reason: "Too many attempts. Please wait a minute and try again." };
    if (response.status >= 500) return { valid: false, offline: true, reason: "The license server is unavailable right now." };
    const data = await response.json().catch(() => ({}));
    return { valid: !!data.valid, plan: data.plan, reason: data.reason };
  } catch {
    return { valid: false, offline: true, reason: "Could not reach the license server." };
  }
}
export function recentlyVerified(days = 30) {
  if (typeof window === "undefined") return false;
  try {
    const saved = JSON.parse(localStorage.getItem(LICENSE_STATUS_STORE) || "null");
    if (!saved?.valid || !saved.verifiedAt) return false;
    const age = Date.now() - new Date(saved.verifiedAt).getTime();
    return Number.isFinite(age) && age >= 0 && age < days * 86400000;
  } catch {
    return false;
  }
}
export function saveLicense(key, meta = {}) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LICENSE_KEY_STORE, normalizeKey(key));
  localStorage.setItem(LICENSE_STATUS_STORE, JSON.stringify({ valid: true, ...meta, verifiedAt: new Date().toISOString() }));
}
export function clearLicense() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LICENSE_KEY_STORE);
  localStorage.removeItem(LICENSE_STATUS_STORE);
}
export function getStoredKey() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LICENSE_KEY_STORE);
}
