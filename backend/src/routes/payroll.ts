import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../lib/db.js";
import { estimateDeductions } from "../lib/tax.js";
import { requireAuth, requireAdmin, AuthedRequest } from "../middleware/requireAuth.js";

export const payrollRouter = Router();
payrollRouter.use(requireAuth);

function nextPeriod(runs: any[]) {
  const now = new Date();
  if (!runs.length) return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = runs[runs.length - 1].period.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

payrollRouter.get("/", async (req: AuthedRequest, res) => {
  const runs = (await db.table("payrollRuns", req.auth!.companyId)) as any[];
  if (req.auth!.role === "employee") {
    // Employees only get their own line from each run, never the full roster's pay.
    const mine = runs.map((r) => ({
      period: r.period,
      createdAt: r.createdAt,
      line: r.lines.find((l: any) => l.employeeId === req.auth!.employeeId),
    })).filter((r) => r.line);
    return res.json(mine);
  }
  res.json(runs);
});

payrollRouter.post("/run", requireAdmin, async (req: AuthedRequest, res) => {
  const employees = ((await db.table("employees", req.auth!.companyId)) as any[]).filter((e) => e.active);
  if (!employees.length) return res.status(400).json({ error: "No active employees to pay" });

  const runs = (await db.table("payrollRuns", req.auth!.companyId)) as any[];
  const period = nextPeriod(runs);

  const lines = employees.map((e) => {
    const d = estimateDeductions(e.gross);
    return { employeeId: e.id, name: e.name, role: e.role, gross: e.gross, ...d };
  });

  const run = {
    id: nanoid(),
    companyId: req.auth!.companyId,
    period,
    createdAt: new Date().toISOString(),
    lines,
    status: "paid",
  };
  await db.insert("payrollRuns", run);
  res.status(201).json(run);
});
