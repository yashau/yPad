/**
 * Durable Object for per-session REST API rate limiting
 *
 * Uses a sliding window approach to track request counts per endpoint.
 * Each session gets its own RateLimiter DO instance.
 */

interface RateLimitCounter {
  count: number;
  resetAt: number;
}

interface RateLimitCheckRequest {
  endpoint: string;
  limit: number;
  windowMs: number;
}

export class RateLimiterDurableObject implements DurableObject {
  private state: DurableObjectState;
  private counters: Map<string, RateLimitCounter>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.counters = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const { endpoint, limit, windowMs } = await request.json() as RateLimitCheckRequest;

      const now = Date.now();
      let counter = this.counters.get(endpoint);

      // Reset counter if window has passed
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
