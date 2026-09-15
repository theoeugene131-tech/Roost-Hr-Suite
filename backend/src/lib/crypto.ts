import crypto from "crypto";

/**
 * Field-level encryption for sensitive employee data (bank account numbers,
 * NIN, PAYE TIN, pension PIN, NSITF number). The old frontend-only version
 * stored all of this as plain text in the browser's localStorage — this
 * encrypts it at rest in Postgres instead.
 *
 * Set ENCRYPTION_KEY in .env to a 32-byte random value, e.g.:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, "hex")
  : crypto.randomBytes(32); // dev fallback — set a real key in production, or data won't decrypt across restarts

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
