import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { db } from "../lib/db.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/requireAuth.js";

export const authRouter = Router();

const signupSchema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

// Creates a company + its first "owner" login. This replaces the old
// "Viewing as: Owner / HR Admin / Employee" dropdown, which let anyone
// looking at the app switch roles and see any employee's data with no
// authentication at all.
authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { companyName, name, email, password } = parsed.data;

  const existing = ((await db.table("users")) as any[]).find((u) => u.email === email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const companyId = nanoid();
  await db.insert("companies", { id: companyId, name: companyName, createdAt: new Date().toISOString() });

  const user = {
    id: nanoid(),
    companyId,
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "owner" as const,
    employeeId: null,
    createdAt: new Date().toISOString(),
  };
  await db.insert("users", user);

  const token = signToken({ userId: user.id, companyId, role: "owner", employeeId: null });
  res.status(201).json({ token, user: { id: user.id, name, email, role: "owner" } });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password } = parsed.data;

  const user = ((await db.table("users")) as any[]).find((u) => u.email === email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    employeeId: user.employeeId ?? null,
  });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Admin generates a one-time invite link for a specific employee to set
// their own password and log in as themselves (self-service payslips)
// instead of everyone sharing one browser's "Viewing as: Employee" toggle.
authRouter.post("/invite-employee", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const schema = z.object({ employeeId: z.string(), email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const employee = await db.find("employees", parsed.data.employeeId);
  if (!employee || employee.companyId !== req.auth!.companyId) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  await db.insert("invites", {
    id: nanoid(),
    companyId: req.auth!.companyId,
    employeeId: parsed.data.employeeId,
    email: parsed.data.email,
    inviteToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    usedAt: null,
    createdAt: new Date().toISOString(),
  });

  // In production, email this URL via Resend/Postmark/etc. instead of returning it.
  res.json({ inviteUrl: `${process.env.APP_URL || "http://localhost:3000"}/accept-invite?token=${inviteToken}` });
});

authRouter.post("/accept-invite", async (req, res) => {
  const schema = z.object({ token: z.string(), password: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const invite = ((await db.table("invites")) as any[]).find((i) => i.inviteToken === parsed.data.token);
  if (!invite || invite.usedAt || new Date(invite.expiresAt) < new Date()) {
    return res.status(400).json({ error: "Invite link is invalid or has expired" });
  }

  const user = {
    id: nanoid(),
    companyId: invite.companyId,
    email: invite.email,
    name: (await db.find("employees", invite.employeeId))?.name || invite.email,
    passwordHash: await hashPassword(parsed.data.password),
    role: "employee" as const,
    employeeId: invite.employeeId,
    createdAt: new Date().toISOString(),
  };
  await db.insert("users", user);
  await db.update("invites", invite.id, { usedAt: new Date().toISOString() });

  const token = signToken({ userId: user.id, companyId: user.companyId, role: "employee", employeeId: invite.employeeId });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: "employee" } });
});
