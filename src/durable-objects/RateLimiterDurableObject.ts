/**
 * @fileoverview Rate limiter Durable Object for REST API endpoints.
 *
 * Each user session gets its own RateLimiter instance. Uses a fixed window
 * approach where requests are counted within time windows that reset after
 * the configured duration.
 */

/**
 * Tracks request count and window expiration for a single endpoint.
 */
interface RateLimitCounter {
  /** Number of requests made in current window */
  count: number;
  /** Timestamp when the current window expires */
  resetAt: number;
}

/**
 * Request body for checking/incrementing rate limit.
 */
interface RateLimitCheckRequest {
  /** Endpoint identifier (e.g., "POST:/api/notes") */
  endpoint: string;
  /** Maximum requests allowed per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Per-session rate limiter using fixed window algorithm.
 *
 * Each session (identified by session ID) gets its own DO instance.
 * Counters are tracked per endpoint, allowing different limits for
 * different API operations.
 */
export class RateLimiterDurableObject implements DurableObject {
  private state: DurableObjectState;
  private counters: Map<string, RateLimitCounter>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.counters = new Map();
  }

  /**
   * Handles rate limit check requests.
   *
   * POST: Check and increment rate limit for an endpoint.
   * Returns 200 if allowed, 429 if rate limited.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const { endpoint, limit, windowMs } = await request.json() as RateLimitCheckRequest;

      const now = Date.now();
      let counter = this.counters.get(endpoint);

      // Reset counter if window has expired
      if (!counter || now > counter.resetAt) {
        counter = { count: 0, resetAt: now + windowMs };
        this.counters.set(endpoint, counter);
      }

      counter.count++;

      if (counter.count > limit) {
        const retryAfter = Math.ceil((counter.resetAt - now) / 1000);
        return new Response('Rate limited', {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(counter.resetAt / 1000)),
          },
        });
      }

      return new Response('OK', {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(limit - counter.count),
          'X-RateLimit-Reset': String(Math.ceil(counter.resetAt / 1000)),
        },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
