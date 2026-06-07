#pragma once
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <mutex>

struct Position {
    std::string mint;
    double      token_balance;
    double      entry_price_sol;
    double      entry_cost_sol;
    uint64_t    entry_timestamp;
    int         sell_count;
    double      total_sol_recovered;
    bool        marked_for_gc;
};

class VirtualWallet {
    mutable std::mutex mtx;
    double sol_balance;
    std::unordered_map<std::string, Position> positions;
    std::unordered_set<std::string> known_mints;

    // Stats
    int total_buys = 0;
    int total_sells = 0;
    double sol_spent = 0.0;
    double sol_gained = 0.0;
    double best_mult = 0.0;

public:
    explicit VirtualWallet(double start_balance);

    bool      has_mint(const std::string& mint) const;
    bool      add_position(const Position& p);
    Position* get_position(const std::string& mint);
    void      update_position(const Position& p);
    void      remove_position(const std::string& mint);
    double    get_sol_balance() const;
    void      deduct_sol(double amount);
    void      add_sol(double amount);
    std::vector<std::string> get_active_mints() const;
    void      print_summary() const;
    
    // Additional tracking methods
    void      record_sell_stats(double sol_gained_amt, double mult);
};

extern VirtualWallet* g_wallet;
