const fs = require('fs').promises;

class FileManager {
    static async readJsonFile(filePath, defaultValue = null) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return defaultValue;
            }
            throw error;
        }
    }

    static async writeJsonFile(filePath, data) {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }
}

module.exports = FileManager;