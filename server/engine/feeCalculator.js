const RENT_FEE_SOL = 0.002039;      // Token account creation
const GAS_FEE_SOL = 0.000025;       // Priority execution bribe
const RAYDIUM_FEE_PCT = 0.0025;     // 0.25% AMM swap fee

// Default SOL price for simulation if live price isn't passed
const DEFAULT_SOL_PRICE = 150; 

function calculateVirtualBuy(positionSizeUSD, currentSolPrice = DEFAULT_SOL_PRICE) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice;
    const rentFeeUSD = RENT_FEE_SOL * currentSolPrice;
    const swapFeeUSD = positionSizeUSD * RAYDIUM_FEE_PCT;

    const totalFees = gasFeeUSD + rentFeeUSD + swapFeeUSD;
    
    return { 
        netWalletChange: -(positionSizeUSD + totalFees), 
        feesUsd: totalFees,
        breakdown: {
            entryGas: gasFeeUSD,
            entryRent: rentFeeUSD,
            entrySwap: swapFeeUSD,
            exitGas: 0,
            exitRentRefund: 0,
            exitSwap: 0
        }
    }; 
}

function calculateVirtualSell(grossExitValueUSD, currentSolPrice = DEFAULT_SOL_PRICE, isFullClose = true) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice;
    const rentRefundUSD = isFullClose ? (RENT_FEE_SOL * currentSolPrice) : 0;
    const swapFeeUSD = grossExitValueUSD * RAYDIUM_FEE_PCT;

    const netWalletChange = grossExitValueUSD - gasFeeUSD - swapFeeUSD + rentRefundUSD;
    
    return { 
        netWalletChange, 
        exitFriction: gasFeeUSD + swapFeeUSD - rentRefundUSD,
        breakdown: {
            exitGas: gasFeeUSD,
            exitRentRefund: rentRefundUSD,
            exitSwap: swapFeeUSD
        }
    };
}

function calculateVirtualRugPull(currentSolPrice = DEFAULT_SOL_PRICE) {
    const gasFeeUSD = GAS_FEE_SOL * currentSolPrice; 
    const rentRefundUSD = RENT_FEE_SOL * currentSolPrice; 

    const netWalletChange = rentRefundUSD - gasFeeUSD;
    
    return { 
        netWalletChange, 
        exitFriction: gasFeeUSD - rentRefundUSD,
        breakdown: {
            exitGas: gasFeeUSD,
            exitRentRefund: rentRefundUSD,
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
