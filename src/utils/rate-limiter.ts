import { warn, debug } from './logger';

/**
 * Implements a token bucket algorithm for rate limiting
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefillTimestamp: number;

  /**
   * Creates a new rate limiter instance
   * @param maxRequests - Maximum number of requests allowed per minute
   */
  constructor(maxRequests: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.refillRate = maxRequests / 60; // tokens per second
    this.lastRefillTimestamp = Date.now();
  }

  /**
   * Checks if a request can be made and consumes a token if available
   */
  public async tryAcquire(): Promise<boolean> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    
    // Calculate wait time until next token is available
    const timeUntilNextToken = Math.ceil(1000 / this.refillRate);
    warn(`Rate limit reached, waiting ${timeUntilNextToken}ms (${this.tokens.toFixed(1)}/${this.maxTokens} tokens)`);
    await new Promise(resolve => setTimeout(resolve, timeUntilNextToken));
    return this.tryAcquire();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTimestamp) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + timePassed * this.refillRate);
    this.lastRefillTimestamp = now;
  }
} 