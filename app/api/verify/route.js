import { NextResponse } from "next/server";
import { checkLicenseKey } from "@/lib/licenseServer.mjs";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const limited = rateLimit(request, "verify-license", { limit: 15, windowMs: 60_000 });
  if (limited) return limited;
  let key;
  try {
    ({ key } = await request.json());
  } catch {
    return NextResponse.json({ valid: false, reason: "Bad request." }, { status: 400 });
  }
  const result = checkLicenseKey(key);
  if (!result.configured) return NextResponse.json({ valid: false, reason: result.reason }, { status: 503 });
  return NextResponse.json(result.valid ? { valid: true, plan: result.plan } : { valid: false, reason: result.reason });
}
