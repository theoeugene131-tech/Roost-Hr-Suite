import crypto from "crypto";

// Server-only HMAC-signed license keys. Keep LICENSE_SECRET private and stable.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const KEY_RE = /^ROOST-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/;

function encode(bytes, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}
export function licenseSecret() {
  const secret = process.env.LICENSE_SECRET || "";
  return secret.length >= 32 ? secret : null;
}
function hmac(secret, label, value) {
  return crypto.createHmac("sha256", secret).update(`${label}:${value}`).digest();
}
function group(raw) {
  return "ROOST-" + raw.match(/.{4}/g).join("-");
}
export function generateLicenseKey(seed) {
  const secret = licenseSecret();
  if (!secret) throw new Error("LICENSE_SECRET is missing or shorter than 32 characters");
  const idBytes = seed ? hmac(secret, "roost-id-v1", String(seed).trim().toLowerCase()) : crypto.randomBytes(8);
  const id = encode(idBytes, 8);
  const signature = encode(hmac(secret, "roost-sig-v1", id), 12);
  return group(id + signature);
}
function revokedKeys() {
  return new Set((process.env.REVOKED_LICENSES || "").split(",").map((key) => key.trim().toUpperCase()).filter(Boolean));
}
export function checkLicenseKey(input) {
  const secret = licenseSecret();
  if (!secret) return { configured: false, valid: false, reason: "Licensing is not set up on the server yet." };
  const key = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = KEY_RE.exec(key);
  if (!match) return { configured: true, valid: false, reason: "Enter a valid Roost license key in the format ROOST-XXXX-XXXX-XXXX-XXXX-XXXX." };
  const id = match[1] + match[2];
  const given = Buffer.from(match[3] + match[4] + match[5]);
  const expected = Buffer.from(encode(hmac(secret, "roost-sig-v1", id), 12));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { configured: true, valid: false, reason: "That license key is not valid." };
  }
  if (revokedKeys().has(key)) return { configured: true, valid: false, reason: "This license has been revoked. Please contact support." };
  return { configured: true, valid: true, plan: "standard" };
}
