const express = require('express');
const ConfigController = require('../controllers/configController');
const WebhookController = require('../controllers/webhookControllers');
const OrderController = require('../controllers/orderControllers');

const router = express.Router();

// Config 
router.get('/config', ConfigController.getConfig);
router.post('/config', ConfigController.saveConfig);

router.post('/webhook', WebhookController.processWebhook);

router.get('/orders', OrderController.getOrders);
router.delete('/orders', OrderController.clearOrders);

module.exports = router;

const errorHandler = (error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
};

module.exports = errorHandler;