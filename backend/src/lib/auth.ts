import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Never allow production to start with a publicly guessable JWT signing key.
const configuredSecret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === "production" && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
}
const JWT_SECRET = configuredSecret || "development-only-secret-do-not-use-in-production";
const TOKEN_TTL = "14d";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export interface TokenPayload {
  userId: string;
  companyId: string;
  role: "owner" | "admin" | "employee";
  employeeId: string | null; // set when role === "employee" — links login to their payroll record
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
