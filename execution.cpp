#include "execution.hpp"
#include "wallet.hpp"
#include "jupiter.hpp"
#include "config.hpp"
#include <iostream>
#include <iomanip>
#include <chrono>
#include <cmath>

static std::string truncate_mint(const std::string& mint) {
    if (mint.length() > 8) {
        return mint.substr(0, 8) + "...";
    }
    return mint;
}

static std::string get_utc_time_string() {
    auto now = std::chrono::system_clock::now();
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm* tm_utc = std::gmtime(&now_c);
    char time_buf[64];
    std::strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_utc);
    return std::string(time_buf);
}

void simulate_buy(const std::string& mint) {
    double raw_price = fetch_price_sol(mint);
    if (raw_price <= 0.0) return;

    double penalized_price = raw_price * Config::SIM_ENTRY_PENALTY;
    double tokens_received = Config::ENTRY_SOL / penalized_price;

    if (!g_wallet) return;

    g_wallet->deduct_sol(Config::ENTRY_SOL);

    uint64_t now_sec = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    Position p;
    p.mint = mint;
    p.token_balance = tokens_received;
    p.entry_price_sol = penalized_price;
    p.entry_cost_sol = Config::ENTRY_SOL;
    p.entry_timestamp = now_sec;
    p.sell_count = 0;
    p.total_sol_recovered = 0.0;
    p.marked_for_gc = false;

    if (g_wallet->add_position(p)) {
        double sol_bal = g_wallet->get_sol_balance();
        std::cout << "[" << get_utc_time_string() << "] [BUY]   "
                  << "mint=" << truncate_mint(mint) << "  "
                  << std::fixed << std::setprecision(10)
                  << "raw_price=" << raw_price << " SOL  "
                  << "penalized=" << penalized_price << " SOL  "
                  << std::setprecision(2)
                  << "tokens=" << tokens_received << "  "
                  << std::setprecision(6)
                  << "sol_bal=" << sol_bal << "\n"
                  << std::flush;
    } else {
        // Refund if we failed to add (mint already exists)
        g_wallet->add_sol(Config::ENTRY_SOL);
    }
}

void simulate_cascade_sell(const std::string& mint, double current_price) {
    if (!g_wallet) return;

    Position* p_ptr = g_wallet->get_position(mint);
    if (!p_ptr || p_ptr->marked_for_gc) return;

    Position p = *p_ptr; // Copy to work with

    double sell_amount = std::floor(p.token_balance * Config::SELL_FRACTION);
    if (sell_amount < 1.0) {
        p.marked_for_gc = true;
        g_wallet->update_position(p);
        return;
    }

    double penalized_price = current_price * Config::SIM_EXIT_PENALTY;
    double sol_gained = sell_amount * penalized_price;
    double remaining = p.token_balance - sell_amount;

    p.token_balance = remaining;
    p.sell_count += 1;
    p.total_sol_recovered += sol_gained;

    g_wallet->add_sol(sol_gained);

    // Update global tracking stats
    double mult = current_price / p.entry_price_sol;
    g_wallet->record_sell_stats(sol_gained, mult);

    if (remaining < 1.0) {
        p.marked_for_gc = true;
    }

    g_wallet->update_position(p);

    double sol_bal = g_wallet->get_sol_balance();

    std::cout << "[" << get_utc_time_string() << "] [SELL]  "
              << "mint=" << truncate_mint(mint) << "  "
              << "sell#=" << p.sell_count << "  "
              << std::fixed << std::setprecision(2)
              << "sold=" << sell_amount << " tokens  "
              << std::setprecision(6)
              << "price=" << current_price << " SOL  "
              << "penalized=" << penalized_price << "  "
              << "sol_gained=" << sol_gained << "  "
              << std::setprecision(1)
              << "mult=" << mult << "x  "
              << std::setprecision(2)
              << "remaining=" << remaining << "  "
              << std::setprecision(6)
              << "sol_bal=" << sol_bal << "\n"
              << std::flush;
}
