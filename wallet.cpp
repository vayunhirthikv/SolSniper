#include "wallet.hpp"
#include <iostream>
#include <iomanip>
#include <chrono>

VirtualWallet::VirtualWallet(double start_balance) : sol_balance(start_balance) {}

bool VirtualWallet::has_mint(const std::string& mint) const {
    std::lock_guard<std::mutex> lock(mtx);
    return known_mints.find(mint) != known_mints.end();
}

bool VirtualWallet::add_position(const Position& p) {
    std::lock_guard<std::mutex> lock(mtx);
    if (known_mints.find(p.mint) != known_mints.end()) {
        return false;
    }
    known_mints.insert(p.mint);
    positions[p.mint] = p;
    total_buys++;
    sol_spent += p.entry_cost_sol;
    return true;
}

Position* VirtualWallet::get_position(const std::string& mint) {
    std::lock_guard<std::mutex> lock(mtx);
    auto it = positions.find(mint);
    if (it != positions.end()) {
        return &it->second;
    }
    return nullptr;
}

void VirtualWallet::update_position(const Position& p) {
    std::lock_guard<std::mutex> lock(mtx);
    if (positions.find(p.mint) != positions.end()) {
        positions[p.mint] = p;
    }
}

void VirtualWallet::remove_position(const std::string& mint) {
    std::lock_guard<std::mutex> lock(mtx);
    positions.erase(mint);
}

double VirtualWallet::get_sol_balance() const {
    std::lock_guard<std::mutex> lock(mtx);
    return sol_balance;
}

void VirtualWallet::deduct_sol(double amount) {
    std::lock_guard<std::mutex> lock(mtx);
    sol_balance -= amount;
}

void VirtualWallet::add_sol(double amount) {
    std::lock_guard<std::mutex> lock(mtx);
    sol_balance += amount;
}

std::vector<std::string> VirtualWallet::get_active_mints() const {
    std::lock_guard<std::mutex> lock(mtx);
    std::vector<std::string> active;
    for (const auto& kv : positions) {
        if (!kv.second.marked_for_gc) {
            active.push_back(kv.first);
        }
    }
    return active;
}

void VirtualWallet::print_summary() const {
    std::lock_guard<std::mutex> lock(mtx);
    
    // Determine active vs total
    int active = 0;
    for (const auto& kv : positions) {
        if (!kv.second.marked_for_gc) active++;
    }

    auto now = std::chrono::system_clock::now();
    std::time_t now_c = std::chrono::system_clock::to_time_t(now);
    std::tm* tm_utc = std::gmtime(&now_c);

    double net = sol_gained - sol_spent;

    char time_buf[64];
    std::strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_utc);

    std::cout << "[" << time_buf << "] [SUMMARY] "
              << "positions=" << positions.size() << "  "
              << "active=" << active << "  "
              << "total_buys=" << total_buys << "  "
              << "total_sells=" << total_sells << "  "
              << std::fixed << std::setprecision(6)
              << "sol_spent=" << sol_spent << "  "
              << "sol_gained=" << sol_gained << "  "
              << "net=" << std::showpos << net << std::noshowpos << " SOL  "
              << std::setprecision(1) << "best_mult=" << best_mult << "x\n"
              << std::flush;
}

void VirtualWallet::record_sell_stats(double sol_gained_amt, double mult) {
    std::lock_guard<std::mutex> lock(mtx);
    total_sells++;
    sol_gained += sol_gained_amt;
    if (mult > best_mult) best_mult = mult;
}
