const Config = require('../models/Config');

class ConfigController {
    static async getConfig(req, res) {
        try {
            const config = await Config.get();
            res.json(config);
        } catch (error) {
            console.error('Error reading config:', error);
            res.status(500).json({ error: 'Failed to read configuration' });
        }
    }

    static async saveConfig(req, res) {
        try {
            const config = await Config.save(req.body);
            console.log('Configuration saved:', config);
            res.json({ message: 'Configuration saved successfully', config });
        } catch (error) {
            console.error('Error saving config:', error);
            if (error.message.includes('Missing required fields')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to save configuration' });
            }
        }
    }
}

module.exports = ConfigController;