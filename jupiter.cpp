#include "jupiter.hpp"
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <iostream>
#include <thread>

using json = nlohmann::json;

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

static std::string http_get(const std::string& url) {
    CURL* curl = curl_easy_init();
    if (!curl) return "";

    std::string readBuffer;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 5L);

    // Provide some standard headers
    struct curl_slist* headers = NULL;
    headers = curl_slist_append(headers, "Accept: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        return "";
    }
    return readBuffer;
}

static std::string http_get_with_retry(const std::string& url) {
    int retries = 0;
    int backoff_sec = 1;
    while (retries <= 3) {
        std::string resp = http_get(url);
        if (!resp.empty()) {
            return resp;
        }
        if (retries == 3) break;
        std::this_thread::sleep_for(std::chrono::seconds(backoff_sec));
        backoff_sec *= 2;
        retries++;
    }
    return "";
}

double fetch_price_sol(const std::string& mint) {
    std::string url = "https://price.jup.ag/v6/price?ids=" + mint + "&vsToken=So11111111111111111111111111111111111111112";
    std::string response = http_get_with_retry(url);
    if (response.empty()) return 0.0;

    try {
        auto j = json::parse(response);
        if (j.contains("data") && j["data"].contains(mint) && j["data"][mint].contains("price")) {
            return j["data"][mint]["price"].get<double>();
        }
    } catch (...) {
        // Parsing error
    }
    return 0.0;
}

std::unordered_map<std::string, double> fetch_prices_sol_batch(const std::vector<std::string>& mints) {
    std::unordered_map<std::string, double> result;
    if (mints.empty()) return result;

    std::string ids = mints[0];
    for (size_t i = 1; i < mints.size(); ++i) {
        ids += "," + mints[i];
    }

    std::string url = "https://price.jup.ag/v6/price?ids=" + ids + "&vsToken=So11111111111111111111111111111111111111112";
    std::string response = http_get_with_retry(url);
    if (response.empty()) return result;

    try {
        auto j = json::parse(response);
        if (j.contains("data")) {
            for (const auto& mint : mints) {
                if (j["data"].contains(mint) && j["data"][mint].contains("price")) {
                    result[mint] = j["data"][mint]["price"].get<double>();
                }
            }
        }
    } catch (...) {
        // Parsing error
    }

    return result;
}
