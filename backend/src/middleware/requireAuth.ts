import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../lib/auth.js";

export interface AuthedRequest extends Request {
  auth?: TokenPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const payload = verifyToken(header.slice("Bearer ".length));
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.auth = payload;
  next();
}

// Only owner/admin can manage employees, run payroll, etc. — an "employee"
// role can only ever read their own record (enforced in the routes).
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== "owner" && req.auth?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
