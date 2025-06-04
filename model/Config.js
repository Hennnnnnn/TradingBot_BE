const FileManager = require('../utils/fileManager');
const { CONFIG_FILE, DEFAULT_CONFIG } = require('../config/constants');

class Config {
    static async get() {
        return await FileManager.readJsonFile(CONFIG_FILE, DEFAULT_CONFIG);
    }

    static async save(configData) {
        const config = { ...DEFAULT_CONFIG, ...configData };

        const requiredFields = [
            'symbol', 'timeframe', 'plusDIThreshold',
            'minusDIThreshold', 'adxMinimum', 'takeProfitPercent',
            'stopLossPercent', 'leverage'
        ];

        const missingFields = requiredFields.filter(
            field => config[field] === undefined || config[field] === null
        );

        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        await FileManager.writeJsonFile(CONFIG_FILE, config);
        return config;
    }
}

module.exports = Config; F