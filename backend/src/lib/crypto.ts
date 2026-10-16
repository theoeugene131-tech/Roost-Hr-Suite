import crypto from "crypto";

/**
 * AES-256-GCM field-level encryption for sensitive employee identifiers and
 * bank account numbers. ENCRYPTION_KEY must remain stable across deployments.
 * Configure it as 64 hex characters representing 32 random bytes.
 */
const rawKey = process.env.ENCRYPTION_KEY;
if (process.env.NODE_ENV === "production" && (!rawKey || !/^[0-9a-fA-F]{64}$/.test(rawKey))) {
  throw new Error("ENCRYPTION_KEY must be configured as 64 hexadecimal characters in production");
}
const KEY = rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)
  ? Buffer.from(rawKey, "hex")
  : crypto.createHash("sha256").update("local-development-only-change-me").digest();

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
  if (buf.length < 28) throw new Error("Invalid encrypted field payload");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
