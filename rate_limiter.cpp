#include "rate_limiter.hpp"
#include <thread>

RateLimiter::RateLimiter(int max_per_sec) : tokens(max_per_sec), max_tokens(max_per_sec) {
    last_refill = std::chrono::steady_clock::now();
}

void RateLimiter::acquire() {
    std::unique_lock<std::mutex> lock(mtx);
    while (true) {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - last_refill).count();
        if (elapsed >= 1) {
            tokens = max_tokens;
            last_refill = now;
        }

        if (tokens > 0) {
            tokens--;
            return;
        }

        auto next_refill = last_refill + std::chrono::seconds(1);
        cv.wait_until(lock, next_refill);
    }
}
