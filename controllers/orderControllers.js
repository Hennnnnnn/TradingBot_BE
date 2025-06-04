const Order = require('../models/Order');

class OrderController {
    static async getOrders(req, res) {
        try {
            const orders = await Order.getAll();
            res.json(orders);
        } catch (error) {
            console.error('Error reading orders:', error);
            res.status(500).json({ error: 'Failed to read orders' });
        }
    }

    static async clearOrders(req, res) {
        try {
            await Order.clear();
            res.json({ message: 'All orders cleared' });
        } catch (error) {
            console.error('Error clearing orders:', error);
            res.status(500).json({ error: 'Failed to clear orders' });
        }
    }
}

module.exports = OrderController;