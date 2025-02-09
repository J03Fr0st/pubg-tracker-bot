import time

class RateLimiter:
    def __init__(self, max_requests):
        self.max_requests = max_requests
        self.tokens = max_requests
        self.refill_rate = float(max_requests) / 60  # tokens per second
        self.last_refill_timestamp = time.time()

    def try_acquire(self):
        self.refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        else:
            time_until_next_token = (1 - self.tokens) / self.refill_rate
            time.sleep(time_until_next_token)
            return self.try_acquire()

    def refill(self):
        now = time.time()
        time_passed = now - self.last_refill_timestamp
        self.tokens = min(self.max_requests, self.tokens + time_passed * self.refill_rate)
        self.last_refill_timestamp = now
