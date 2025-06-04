class TradingService {
    static validateSignal(signal, config) {
        const { plusDI, minusDI, adx } = signal;
        const { plusDIThreshold, minusDIThreshold, adxMinimum } = config;

        if (adx < adxMinimum) {
            return { valid: false, action: null, reason: 'ADX below minimum' };
        }

        if (plusDI > plusDIThreshold && minusDI < minusDIThreshold) {
            return { valid: true, action: 'BUY', reason: 'Buy conditions met' };
        }

        if (minusDI > plusDIThreshold && plusDI < minusDIThreshold) {
            return { valid: true, action: 'SELL', reason: 'Sell conditions met' };
        }

        return { valid: false, action: null, reason: 'No clear signal' };
    }

    static calculatePrices(entryPrice, takeProfitPercent, stopLossPercent, action) {
        if (action === 'BUY') {
            const tpPrice = entryPrice * (1 + takeProfitPercent / 100);
            const slPrice = entryPrice * (1 - stopLossPercent / 100);
            return { tpPrice, slPrice };
        } else {
            const tpPrice = entryPrice * (1 - takeProfitPercent / 100);
            const slPrice = entryPrice * (1 + stopLossPercent / 100);
            return { tpPrice, slPrice };
        }
    }

    static createOrder(signal, validation, currentPrice, config) {
        const { tpPrice, slPrice } = this.calculatePrices(
            currentPrice,
            config.takeProfitPercent,
            config.stopLossPercent,
            validation.action
        );

        return {
            symbol: signal.symbol,
            action: validation.action,
            price_entry: currentPrice.toFixed(2),
            tp_price: tpPrice.toFixed(2),
            sl_price: slPrice.toFixed(2),
            leverage: `${config.leverage}x`,
            timeframe: signal.timeframe,
            timestamp: new Date().toISOString(),
            signal_data: {
                plusDI: signal.plusDI,
                minusDI: signal.minusDI,
                adx: signal.adx
            }
        };
    }
}

module.exports = TradingService;