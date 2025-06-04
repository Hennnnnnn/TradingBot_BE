const FileManager = require('../utils/fileManager');
const { ORDERS_FILE, MAX_ORDERS } = require('../config/constants');

class Order {
  static async getAll() {
    return await FileManager.readJsonFile(ORDERS_FILE, []);
  }

  static async add(orderData) {
    const existingOrders = await this.getAll();
    existingOrders.unshift(orderData);

    if (existingOrders.length > MAX_ORDERS) {
      existingOrders.splice(MAX_ORDERS);
    }

    await FileManager.writeJsonFile(ORDERS_FILE, existingOrders);
    return orderData;
  }

  static async clear() {
    await FileManager.writeJsonFile(ORDERS_FILE, []);
  }
}

module.exports = Order;
