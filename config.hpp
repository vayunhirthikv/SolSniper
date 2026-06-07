#pragma once

#include <string>
#include <cstdint>
#include <stdexcept>
#include <cstdlib>

struct Config {
    std::string helius_rpc_http;
    std::string helius_rpc_ws;

    static constexpr uint64_t ENTRY_LAMPORTS      = 2000;
    static constexpr double   ENTRY_SOL            = 0.000002;
    static constexpr double   TRIGGER_MULTIPLIER   = 200.0;
    static constexpr double   SELL_FRACTION        = 0.25;
    static constexpr int      POLL_INTERVAL_SEC    = 10;
    static constexpr int      MAX_RPC_REQ_PER_SEC  = 8;

    static constexpr double   SIM_ENTRY_PENALTY    = 1.5;
    static constexpr double   SIM_EXIT_PENALTY     = 0.85;

    static constexpr double   VIRTUAL_SOL_START    = 1.0;

    static Config load() {
        Config cfg;
        const char* http = std::getenv("HELIUS_RPC_HTTP");
        const char* ws = std::getenv("HELIUS_RPC_WS");
        if (!http || !ws) {
            throw std::runtime_error("Missing required environment variables: HELIUS_RPC_HTTP or HELIUS_RPC_WS");
        }
        cfg.helius_rpc_http = http;
        cfg.helius_rpc_ws = ws;
        return cfg;
    }
};

extern Config g_config;
