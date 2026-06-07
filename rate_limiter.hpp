#pragma once
#include <mutex>
#include <condition_variable>
#include <chrono>

class RateLimiter {
    std::mutex mtx;
    std::condition_variable cv;
    int tokens;
    int max_tokens;
    std::chrono::steady_clock::time_point last_refill;

public:
    explicit RateLimiter(int max_per_sec);
    void acquire();
};

extern RateLimiter* g_rate_limiter;
