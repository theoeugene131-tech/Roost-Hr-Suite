import test from "node:test";
import assert from "node:assert/strict";

process.env.LICENSE_SECRET = "test-secret-for-license-tests-at-least-32-chars";
const { generateLicenseKey, checkLicenseKey } = await import("../lib/licenseServer.mjs");

test("license key for the same payment reference is stable and verifies", () => {
  const first = generateLicenseKey("ORDER-123");
  const second = generateLicenseKey("order-123");
  assert.equal(first, second);
  assert.match(first, /^ROOST-[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
  assert.equal(checkLicenseKey(first).valid, true);
});

test("random license keys verify but tampered keys do not", () => {
  const key = generateLicenseKey();
  assert.equal(checkLicenseKey(key).valid, true);
  const last = key.endsWith("A") ? "B" : "A";
  assert.equal(checkLicenseKey(key.slice(0, -1) + last).valid, false);
});

test("revoked keys are rejected", () => {
  const key = generateLicenseKey("ORDER-REVOKED");
  process.env.REVOKED_LICENSES = key;
  assert.equal(checkLicenseKey(key).valid, false);
  process.env.REVOKED_LICENSES = "";
});
