#include "helius.hpp"
#include "config.hpp"
#include "rate_limiter.hpp"
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <iostream>

using json = nlohmann::json;

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

std::string extract_mint_from_signature(const std::string& signature) {
    if (g_rate_limiter) {
        g_rate_limiter->acquire();
    }

    CURL* curl = curl_easy_init();
    if (!curl) return "";

    std::string readBuffer;
    json rpc_req = {
        {"jsonrpc", "2.0"},
        {"id", 1},
        {"method", "getTransaction"},
        {"params", {
            signature,
            {
                {"encoding", "jsonParsed"},
                {"maxSupportedTransactionVersion", 0}
            }
        }}
    };

    std::string payload = rpc_req.dump();

    curl_easy_setopt(curl, CURLOPT_URL, g_config.helius_rpc_http.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, payload.c_str());
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 5L);

    struct curl_slist* headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);

    CURLcode res = curl_easy_perform(curl);
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        return "";
    }

    try {
        auto j = json::parse(readBuffer);
        if (j.contains("result") && !j["result"].is_null()) {
            auto& tx = j["result"]["transaction"];
            auto& msg = tx["message"];
            
            // Following spec exactly: check message.accountKeys
            if (msg.contains("accountKeys") && msg["accountKeys"].is_array()) {
                for (auto& acc : msg["accountKeys"]) {
                    // Check if the account has owner and space (some RPCs or parsed tx might inject this)
                    if (acc.contains("owner") && acc["owner"] == "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
                        acc.contains("space") && acc["space"] == 82) {
                        if (acc.contains("pubkey")) {
                            return acc["pubkey"].get<std::string>();
                        }
                    }
                }
            }

            // Fallback: check inner instructions or instructions for createAccount (standard jsonParsed)
            auto check_instructions = [&](const json& insts) -> std::string {
                if (!insts.is_array()) return "";
                for (auto& inst : insts) {
                    if (inst.contains("programId") && inst["programId"] == "11111111111111111111111111111111") {
                        if (inst.contains("parsed") && inst["parsed"].is_object()) {
                            auto& parsed = inst["parsed"];
                            if (parsed.contains("type") && parsed["type"] == "createAccount") {
                                auto& info = parsed["info"];
                                if (info.contains("owner") && info["owner"] == "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
                                    info.contains("space") && info["space"] == 82) {
                                    if (info.contains("newAccount")) return info["newAccount"].get<std::string>();
                                }
                            }
                        }
                    }
                }
                return "";
            };

            std::string mint = check_instructions(msg["instructions"]);
            if (!mint.empty()) return mint;

            if (j["result"].contains("meta") && j["result"]["meta"].contains("innerInstructions")) {
                for (auto& inner : j["result"]["meta"]["innerInstructions"]) {
                    mint = check_instructions(inner["instructions"]);
                    if (!mint.empty()) return mint;
                }
            }
        }
    } catch (...) {
        // Parsing error
    }

    return "";
}
