import crypto from "crypto";

/**
 * Field-level encryption for sensitive employee data (bank account numbers,
 * NIN, PAYE TIN, pension PIN, NSITF number).
 *
 * Set ENCRYPTION_KEY to exactly 64 hexadecimal characters (32 bytes). Keep
 * this value stable and backed up: changing it makes existing encrypted
 * values unreadable.
 */
const configuredKey = process.env.ENCRYPTION_KEY;
if (process.env.NODE_ENV === "production" && (!configuredKey || !/^[a-fA-F0-9]{64}$/.test(configuredKey))) {
  throw new Error("ENCRYPTION_KEY must be set to exactly 64 hexadecimal characters in production.");
}
if (configuredKey && !/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
  throw new Error("ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
}

// Stable development-only key prevents local development data becoming
// unreadable after a restart. It is intentionally not suitable for production.
const KEY = configuredKey
  ? Buffer.from(configuredKey, "hex")
  : crypto.createHash("sha256").update("roost-development-only-key-not-for-production").digest();

export function encryptField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptField(blob: string | null | undefined): string {
  if (!blob) return "";
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
