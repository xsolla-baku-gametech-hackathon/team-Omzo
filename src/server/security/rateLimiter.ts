/**
 * In-memory Token Bucket Rate Limiter.
 *
 * Provides high-performance, zero-external-dependency rate limiting
 * across authentication, report ingestion, and access token grants.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly limit: number;
  readonly retryAfterSec: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets: Map<string, Bucket> = new Map();

// Periodic garbage collection to prevent memory leaks from inactive IPs
const GC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const BUCKET_TTL_MS = 60 * 60 * 1000; // 1 hour

if (typeof setInterval !== "undefined") {
  const gcTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now - bucket.lastRefillMs > BUCKET_TTL_MS) {
        buckets.delete(key);
      }
    }
  }, GC_INTERVAL_MS);

  // Allow Node process to exit gracefully without keeping event loop open
  if (gcTimer.unref) {
    gcTimer.unref();
  }
}

/**
 * Checks and consumes tokens for a given rate-limiting key.
 *
 * @param key Unique key (e.g., "auth:192.168.1.1", "ingest:user123")
 * @param capacity Maximum tokens the bucket can hold
 * @param refillRatePerSec How many tokens are added back per second
 * @param tokensToConsume Tokens consumed for this request (default: 1)
 */
export function rateLimit(
  key: string,
  capacity: number,
  refillRatePerSec: number,
  tokensToConsume: number = 1,
  nowMs: number = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = {
      tokens: capacity,
      lastRefillMs: nowMs,
    };
    buckets.set(key, bucket);
  } else {
    // Refill tokens based on elapsed time
    const elapsedSec = Math.max(0, (nowMs - bucket.lastRefillMs) / 1000);
    const addedTokens = elapsedSec * refillRatePerSec;
    bucket.tokens = Math.min(capacity, bucket.tokens + addedTokens);
    bucket.lastRefillMs = nowMs;
  }

  if (bucket.tokens >= tokensToConsume) {
    bucket.tokens -= tokensToConsume;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      limit: capacity,
      retryAfterSec: 0,
    };
  }

  // Not enough tokens
  const deficit = tokensToConsume - bucket.tokens;
  const retryAfterSec = Math.ceil(deficit / Math.max(0.001, refillRatePerSec));

  return {
    allowed: false,
    remaining: 0,
    limit: capacity,
    retryAfterSec,
  };
}

/**
 * Helper to reset bucket (for tests or manual unblocking).
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Clear all rate limits (useful in test teardown).
 */
export function clearAllRateLimits(): void {
  buckets.clear();
}
