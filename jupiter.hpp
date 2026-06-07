#pragma once
#include <string>
#include <unordered_map>
#include <vector>

double fetch_price_sol(const std::string& mint);
std::unordered_map<std::string, double> fetch_prices_sol_batch(const std::vector<std::string>& mints);
