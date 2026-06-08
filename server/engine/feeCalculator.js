const GAS_FEE_SOL = 0.000025;       // Priority execution bribe
const RAYDIUM_FEE_PCT = 0.0025;     // 0.25% AMM swap fee

// Default SOL price for simulation if live price isn't passed
const DEFAULT_SOL_PRICE = 150; 

function calculateVirtualBuy(positionSizeUSD, currentSolPrice = DEFAULT_SOL_PRICE) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice;
    const swapFeeUSD = positionSizeUSD * RAYDIUM_FEE_PCT;

    const sunkFriction = gasFeeUSD + swapFeeUSD;
    
    return { 
        netWalletChange: -(positionSizeUSD + sunkFriction), 
        feesUsd: sunkFriction,
        breakdown: {
            entryGas: gasFeeUSD,
            entrySwap: swapFeeUSD,
            exitGas: 0,
            exitSwap: 0
        }
    }; 
}

function calculateVirtualSell(grossExitValueUSD, currentSolPrice = DEFAULT_SOL_PRICE) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice;
    const swapFeeUSD = grossExitValueUSD * RAYDIUM_FEE_PCT;

    const sunkFriction = gasFeeUSD + swapFeeUSD;
    
    return { 
        netWalletChange: grossExitValueUSD - sunkFriction, 
        exitFriction: sunkFriction,
        breakdown: {
            exitGas: gasFeeUSD,
            exitSwap: swapFeeUSD
        }
    };
}

function calculateVirtualRugPull(currentSolPrice = DEFAULT_SOL_PRICE) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice; 

    const sunkFriction = gasFeeUSD;
    
    return { 
        netWalletChange: -gasFeeUSD, 
        exitFriction: sunkFriction,
        breakdown: {
            exitGas: gasFeeUSD,
            exitSwap: 0
        }
    }; 
}

module.exports = {
    calculateVirtualBuy,
    calculateVirtualSell,
    calculateVirtualRugPull,
    DEFAULT_SOL_PRICE
};
