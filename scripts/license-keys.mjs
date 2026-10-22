// Generate or re-issue a key after manually confirming a customer payment.
// Examples:
//   node --env-file=.env.local scripts/license-keys.mjs --ref ORDER-123
//   node --env-file=.env.local scripts/license-keys.mjs --ref buyer@example.com
//   node --env-file=.env.local scripts/license-keys.mjs --check ROOST-XXXX-XXXX-XXXX-XXXX-XXXX
import { generateLicenseKey, checkLicenseKey } from "../lib/licenseServer.mjs";
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
try {
  if (flag("--check")) {
    const result = checkLicenseKey(flag("--check"));
    console.log(result.valid ? "VALID" : `NOT VALID: ${result.reason}`);
    process.exit(result.valid ? 0 : 1);
  }
  if (flag("--ref")) {
    console.log(generateLicenseKey(flag("--ref")));
  } else {
    const count = Math.min(Math.max(Number(flag("--count")) || 1, 1), 500);
    for (let i = 0; i < count; i++) console.log(generateLicenseKey());
  }
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}
