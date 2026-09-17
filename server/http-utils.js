// Small helpers shared by the HTTP API: JSON in/out, client IP, CORS, rate limits.

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(json);
}

export function readJson(req, limitBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new HttpError(413, "body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(data && typeof data === "object" ? data : {});
      } catch {
        reject(new HttpError(400, "bad_json"));
      }
    });
    req.on("error", reject);
  });
}

export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers["fly-client-ip"] || req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

// Same-origin requests are always allowed; other origins only when listed.
export function isOriginAllowed(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (bots, native shells, curl)
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch {
    return false;
  }
  return allowedOrigins.includes(origin);
}

export function applyCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
}

// Token bucket per key (usually an IP address or account id).
export class RateLimiter {
  constructor({ capacity, refillPerSecond, now = Date.now }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.now = now;
    this.buckets = new Map();
  }

  take(key, cost = 1) {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    bucket.tokens = Math.min(this.capacity, bucket.tokens + ((now - bucket.at) / 1000) * this.refillPerSecond);
    bucket.at = now;
    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 10_000) this._prune(now);
    return allowed;
  }

  _prune(now) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at > (this.capacity / this.refillPerSecond) * 1000) this.buckets.delete(key);
    }
  }
}
