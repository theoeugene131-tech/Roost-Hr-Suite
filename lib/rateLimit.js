const buckets = new Map();

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Best-effort only on serverless: counters are per warm instance, not shared across instances.
export function rateLimit(request, name, { limit = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const key = `${name}:${clientIp(request)}`;
  const hits = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [bucket, timestamps] of buckets) {
      if (!timestamps.some((time) => now - time < windowMs)) buckets.delete(bucket);
    }
  }
  if (hits.length > limit) {
    return Response.json({ valid: false, reason: "Too many attempts. Please wait a minute and try again." }, {
      status:  429,
      headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
    });
  }
  return null;
}
