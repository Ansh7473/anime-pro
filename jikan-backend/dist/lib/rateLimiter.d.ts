/**
 * Rate Limiter for API requests
 * Prevents overwhelming external services with too many requests
 */
interface RateLimiterConfig {
    maxRequests: number;
    windowMs: number;
}
declare class RateLimiter {
    private requests;
    private config;
    constructor(config: RateLimiterConfig);
    acquire(): Promise<void>;
    reset(): void;
}
export declare const animelokLimiter: RateLimiter;
export declare const desidubLimiter: RateLimiter;
export declare const animehindidubbedLimiter: RateLimiter;
export declare const delay: (ms: number) => Promise<void>;
export declare function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
export {};
//# sourceMappingURL=rateLimiter.d.ts.map