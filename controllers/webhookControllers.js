const Config = require('../models/Config');
const Order = require('../models/Order');
const TradingService = require('../services/tradingService');
const BinanceService = require('../services/binanceService');

class WebhookController {
    static async processWebhook(req, res) {
        try {
            const signal = req.body;
            console.log('Received signal:', signal);

            const requiredSignalFields = ['symbol', 'plusDI', 'minusDI', 'adx', 'timeframe'];
            const missingSignalFields = requiredSignalFields.filter(
                field => signal[field] === undefined || signal[field] === null
            );

            if (missingSignalFields.length > 0) {
                return res.status(400).json({
                    error: `Missing signal fields: ${missingSignalFields.join(', ')}`
                });
            }

            const config = await Config.get();
            const validation = TradingService.validateSignal(signal, config);

            if (!validation.valid) {
                console.log('Signal not valid:', validation.reason);
                return res.json({
                    message: 'Signal received but not valid',
                    reason: validation.reason,
                    signal: signal
                });
            }

            const currentPrice = await BinanceService.getPrice(signal.symbol);
            const order = TradingService.createOrder(signal, validation, currentPrice, config);

            await Order.add(order);
            console.log('Order created:', order);

            res.json({
                message: 'Signal processed and order created',
                order: order,
                validation: validation
            });

        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).json({ error: 'Failed to process webhook' });
        }
    }
}

module.exports = WebhookController;