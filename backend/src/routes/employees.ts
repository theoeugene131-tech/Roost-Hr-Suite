import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { encryptField, decryptField } from "../lib/crypto.js";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/requireAuth.js";

export const employeesRouter = Router();
employeesRouter.use(requireAuth);

const SENSITIVE_FIELDS = ["account", "nin", "payeTin", "pensionPin", "nsitfNumber"] as const;

function toPublic(emp: any) {
  const out = { ...emp };
  for (const f of SENSITIVE_FIELDS) out[f] = decryptField(emp[f]);
  return out;
}

const employeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  gross: z.number().positive(),
  bank: z.string().optional().default(""),
  account: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  dob: z.string().optional().default(""),
  nin: z.string().optional().default(""),
  payeTin: z.string().optional().default(""),
  pensionPin: z.string().optional().default(""),
  nsitfNumber: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
});

// Admins see the full roster. Employees only ever see their own record —
// this is the actual access control the old "Viewing as" dropdown didn't
// provide (anyone could switch to "Employee" and browse any teammate's data).
employeesRouter.get("/", async (req: AuthedRequest, res) => {
  const all = (await db.table("employees", req.auth!.companyId)) as any[];
  if (req.auth!.role === "employee") {
    return res.json(all.filter((e) => e.id === req.auth!.employeeId).map(toPublic));
  }
  res.json(all.map(toPublic));
});

employeesRouter.post("/", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const employee = {
    id: nanoid(),
    companyId: req.auth!.companyId,
    name: d.name,
    role: d.role,
    gross: d.gross,
    bank: d.bank,
    account: encryptField(d.account),
    startDate: d.startDate,
    dob: d.dob,
    nin: encryptField(d.nin),
    payeTin: encryptField(d.payeTin),
    pensionPin: encryptField(d.pensionPin),
    nsitfNumber: encryptField(d.nsitfNumber),
    active: d.active !== false,
    createdAt: new Date().toISOString(),
  };
  await db.insert("employees", employee);
  res.status(201).json(toPublic(employee));
});

employeesRouter.patch("/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await db.find("employees", req.params.id);
  if (!existing || existing.companyId !== req.auth!.companyId) {
    return res.status(404).json({ error: "Employee not found" });
  }
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const patch: Record<string, any> = { ...parsed.data };
  for (const f of SENSITIVE_FIELDS) {
    if (f in patch) patch[f] = encryptField(patch[f]);
  }
  const updated = await db.update("employees", req.params.id, patch);
  res.json(toPublic(updated));
});

employeesRouter.delete("/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await db.find("employees", req.params.id);
  if (!existing || existing.companyId !== req.auth!.companyId) {
    return res.status(404).json({ error: "Employee not found" });
  }
  await db.delete("employees", req.params.id);
  res.json({ ok: true });
});
