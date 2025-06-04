const path = require('path');

module.exports = {
    PORT: 3001,
    CONFIG_FILE: path.join(__dirname, '..', 'config.json'),
    ORDERS_FILE: path.join(__dirname, '..', 'orders.json'),
    MAX_ORDERS: 100,

    DEFAULT_CONFIG: {
        symbol: 'BTCUSDT',
        timeframe: '5m',
        plusDIThreshold: 25,
        minusDIThreshold: 20,
        adxMinimum: 20,
        takeProfitPercent: 2,
        stopLossPercent: 1,
        leverage: 10
    }
};