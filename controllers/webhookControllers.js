// controllers/webhookController.js
const Config = require('../models/Config');
const Order = require('../models/Order');
const TradingService = require('../services/tradingService');
const BinanceService = require('../services/binanceService');
const RealtimeOrderService = require('../services/realtimeOrderService');

class WebhookController {
    static async processWebhook(req, res) {
        try {
            const signal = req.body;
            console.log('📡 Received signal:', signal);

            // Validate required signal fields
            const requiredSignalFields = ['symbol', 'plusDI', 'minusDI', 'adx', 'timeframe'];
            const missingSignalFields = requiredSignalFields.filter(
                field => signal[field] === undefined || signal[field] === null
            );

            if (missingSignalFields.length > 0) {
                return res.status(400).json({
                    error: `Missing signal fields: ${missingSignalFields.join(', ')}`
                });
            }

            // Get configuration
            const config = await Config.get();

            // Initialize Binance connection if not connected
            if (!BinanceService.isConnected) {
                console.log('🔌 Initializing Binance connection...');
                try {
                    console.log('🌐 Testing direct HTTP request...');
                    const https = require('https');
                    https.get('https://testnet.binance.vision/api/v3/time', (res) => {
                        console.log('✅ Direct HTTP request succeeded');
                    }).on('error', (err) => {
                        console.log('❌ Direct HTTP request failed:', err.message);
                    });
                    await BinanceService.initialize({
                        binanceApiKey: "7tFJ34BVavZbkyFL0EU916RiOmNymCPaqt4kudbOD26mN3Qz5n2nh4BQ8ZoQ6haH" || config.binanceApiKey,
                        binanceApiSecret: "3RuwshPjwYUUDtCcNJV33pJ7xARGovqtXYoVUF4M6LFkbnT2deC4BgLvlKIsRGL1" || config.binanceApiSecret,
                        useTestnet: process.env.USE_TESTNET === 'true' || config.useTestnet || true,
                        verbose: config.verbose || false,
                        enableLogging: config.enableLogging || false
                    });
                } catch (initError) {
                    console.error('❌ Failed to initialize Binance connection:', initError.message);
                    return res.status(503).json({
                        error: 'Trading service unavailable',
                        details: 'Could not establish connection to exchange',
                        message: 'Please check API credentials and network connection'
                    });
                }
            }


            // Validate signal
            const validation = TradingService.validateSignal(signal, config);

            if (!validation.valid) {
                console.log('❌ Signal not valid:', validation.reason);
                return res.json({
                    message: 'Signal received but not valid',
                    reason: validation.reason,
                    signal: signal
                });
            }

            // Get current price from Binance
            const currentPrice = await BinanceService.getPrice(signal.symbol);

            // Create order with enhanced data
            const order = TradingService.createOrder(signal, validation, currentPrice, config);

            // Enhance order with real-time trigger conditions
            const enhancedOrder = {
                ...order,
                triggerPrice: signal.triggerPrice || null,
                triggerCondition: signal.triggerCondition || null,
                stopLoss: signal.stopLoss || null,
                takeProfit: signal.takeProfit || null,
                trailingStop: signal.trailingStop || null,
                executionMode: signal.executionMode || 'immediate', // 'immediate', 'trigger', 'scheduled'
                scheduledTime: signal.scheduledTime || null,
                maxSlippage: signal.maxSlippage || config.maxSlippage || 0.5,
                partialFill: signal.allowPartialFill !== false,
                timeoutMinutes: signal.timeoutMinutes || config.orderTimeoutMinutes || 60
            };

            // Save order to database
            await Order.add(enhancedOrder);
            console.log('💾 Order saved:', enhancedOrder.id);

            // Handle different execution modes
            await WebhookController.handleOrderExecution(enhancedOrder, currentPrice, config);

            res.json({
                message: 'Signal processed successfully',
                order: {
                    id: enhancedOrder.id,
                    symbol: enhancedOrder.symbol,
                    side: enhancedOrder.side,
                    quantity: enhancedOrder.quantity,
                    executionMode: enhancedOrder.executionMode,
                    status: enhancedOrder.status
                },
                validation: validation,
                currentPrice: currentPrice
            });

        } catch (error) {
            console.error('❌ Error processing webhook:', error);
            res.status(500).json({
                error: 'Failed to process webhook',
                details: error.message
            });
        }
    }

    // Add initialization check helper method
    static async ensureBinanceConnection() {
        if (!BinanceService.isConnected) {
            console.log('🔌 Ensuring Binance connection...');

            const config = await Config.get();
            await BinanceService.initialize({
                binanceApiKey: process.env.BINANCE_API_KEY || config.binanceApiKey,
                binanceApiSecret: process.env.BINANCE_API_SECRET || config.binanceApiSecret,
                useTestnet: process.env.USE_TESTNET === 'true' || config.useTestnet || true,
                verbose: config.verbose || false,
                enableLogging: config.enableLogging || false
            });
        }
    }

    static async handleOrderExecution(order, currentPrice, config) {
        try {
            switch (order.executionMode) {
                case 'immediate':
                    await WebhookController.executeImmediateOrder(order, currentPrice);
                    break;

                case 'trigger':
                    await WebhookController.setupTriggerOrder(order);
                    break;

                case 'scheduled':
                    await WebhookController.scheduleOrder(order);
                    break;

                default:
                    console.log('⚡ Using immediate execution as default');
                    await WebhookController.executeImmediateOrder(order, currentPrice);
            }
        } catch (error) {
            console.error('❌ Error handling order execution:', error);
            throw error;
        }
    }

    static async executeImmediateOrder(order, currentPrice) {
        try {
            console.log('⚡ Executing immediate order:', order.id);

            // Ensure Binance connection
            await WebhookController.ensureBinanceConnection();

            // Check if market is open and suitable for trading
            const marketStatus = await WebhookController.checkMarketStatus(order.symbol);
            if (!marketStatus.canTrade) {
                console.log('⏸️ Market not suitable for immediate trading, switching to trigger mode');
                return await WebhookController.setupTriggerOrder(order);
            }

            // Prepare order for Binance
            const binanceOrder = {
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                quantity: order.quantity,
                price: order.price,
                timeInForce: order.timeInForce || 'GTC'
            };

            // Execute on Binance
            const binanceResult = await BinanceService.placeOrder(binanceOrder);

            // Update order status
            const updatedOrder = {
                ...order,
                status: 'executed',
                binanceOrderId: binanceResult.orderId,
                executedPrice: binanceResult.price || currentPrice,
                executedQuantity: binanceResult.executedQty || '0',
                executedAt: new Date().toISOString()
            };

            await Order.update(order.id, updatedOrder);

            // Setup stop loss and take profit monitoring if specified
            if (order.stopLoss || order.takeProfit) {
                await RealtimeOrderService.addOrderToMonitoring(updatedOrder);
            }

            console.log('✅ Immediate order executed successfully:', order.id);

        } catch (error) {
            console.error('❌ Error executing immediate order:', error);

            // Update order status to error
            await Order.update(order.id, {
                ...order,
                status: 'error',
                errorMessage: error.message,
                errorAt: new Date().toISOString()
            });

            throw error;
        }
    }

    static async setupTriggerOrder(order) {
        try {
            console.log('🎯 Setting up trigger order:', order.id);

            // Validate trigger conditions
            if (!order.triggerPrice) {
                throw new Error('Trigger price is required for trigger orders');
            }

            // Update order status
            const updatedOrder = {
                ...order,
                status: 'waiting_trigger',
                waitingTriggerSince: new Date().toISOString()
            };

            await Order.update(order.id, updatedOrder);

            // Add to real-time monitoring
            await RealtimeOrderService.addOrderToMonitoring(updatedOrder);

            console.log('✅ Trigger order setup complete:', order.id);

        } catch (error) {
            console.error('❌ Error setting up trigger order:', error);
            throw error;
        }
    }

    static async scheduleOrder(order) {
        try {
            console.log('📅 Scheduling order:', order.id);

            if (!order.scheduledTime) {
                throw new Error('Scheduled time is required for scheduled orders');
            }

            const scheduledTime = new Date(order.scheduledTime);
            const now = new Date();

            if (scheduledTime <= now) {
                console.log('⏰ Scheduled time is in the past, executing immediately');
                return await WebhookController.executeImmediateOrder(order, null);
            }

            // Update order status
            const updatedOrder = {
                ...order,
                status: 'scheduled',
                scheduledFor: scheduledTime.toISOString()
            };

            await Order.update(order.id, updatedOrder);

            // Setup timer for execution
            const delay = scheduledTime.getTime() - now.getTime();
            setTimeout(async () => {
                try {
                    console.log('⏰ Executing scheduled order:', order.id);
                    await WebhookController.ensureBinanceConnection();
                    const currentPrice = await BinanceService.getPrice(order.symbol);
                    await WebhookController.executeImmediateOrder(updatedOrder, currentPrice);
                } catch (error) {
                    console.error('❌ Error executing scheduled order:', error);
                }
            }, delay);

            console.log(`✅ Order scheduled for execution at ${scheduledTime.toISOString()}`);

        } catch (error) {
            console.error('❌ Error scheduling order:', error);
            throw error;
        }
    }

    static async checkMarketStatus(symbol) {
        try {
            // Ensure Binance connection
            await WebhookController.ensureBinanceConnection();

            // Get market info from Binance
            const exchangeInfo = await BinanceService.binance.exchangeInfo();
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);

            if (!symbolInfo) {
                return { canTrade: false, reason: 'Symbol not found' };
            }

            // Check if symbol is trading
            const isTrading = symbolInfo.status === 'TRADING';

            // Check market hours (if applicable)
            const now = new Date();
            const hour = now.getUTCHours();

            // Crypto markets are 24/7, but we can add specific logic here
            const isMarketHours = true; // Crypto markets are always open

            return {
                canTrade: isTrading && isMarketHours,
                status: symbolInfo.status,
                reason: !isTrading ? 'Market not trading' :
                    !isMarketHours ? 'Outside market hours' : 'OK'
            };

        } catch (error) {
            console.error('❌ Error checking market status:', error);
            return { canTrade: false, reason: 'Unable to check market status' };
        }
    }

    // New endpoint for manual order triggering
    static async triggerOrder(req, res) {
        try {
            const { orderId } = req.params;
            const { forceTrigger = false } = req.body;

            console.log(`🎯 Manual trigger requested for order ${orderId}`);

            // Ensure Binance connection
            await WebhookController.ensureBinanceConnection();

            // Get order from database
            const orders = await Order.getAll();
            const order = orders.find(o => o.id === orderId);

            if (!order) {
                return res.status(404).json({ error: 'Order not found' });
            }

            if (order.status !== 'waiting_trigger' && !forceTrigger) {
                return res.status(400).json({
                    error: 'Order is not waiting for trigger',
                    currentStatus: order.status
                });
            }

            // Get current price
            const currentPrice = await BinanceService.getPrice(order.symbol);

            // Execute the order
            await WebhookController.executeImmediateOrder(order, currentPrice);

            res.json({
                message: 'Order triggered successfully',
                orderId: orderId,
                currentPrice: currentPrice
            });

        } catch (error) {
            console.error('❌ Error triggering order:', error);
            res.status(500).json({
                error: 'Failed to trigger order',
                details: error.message
            });
        }
    }

    // New endpoint for cancelling trigger orders
    static async cancelTriggerOrder(req, res) {
        try {
            const { orderId } = req.params;

            console.log(`🛑 Cancel trigger requested for order ${orderId}`);

            // Cancel monitoring
            await RealtimeOrderService.cancelOrderMonitoring(orderId);

            // Update order status
            const orders = await Order.getAll();
            const order = orders.find(o => o.id === orderId);

            if (order) {
                await Order.update(orderId, {
                    ...order,
                    status: 'cancelled',
                    cancelledAt: new Date().toISOString(),
                    cancelReason: 'Manual cancellation'
                });
            }

            res.json({
                message: 'Trigger order cancelled successfully',
                orderId: orderId
            });

        } catch (error) {
            console.error('❌ Error cancelling trigger order:', error);
            res.status(500).json({
                error: 'Failed to cancel trigger order',
                details: error.message
            });
        }
    }

    // Get real-time monitoring status
    static async getMonitoringStatus(req, res) {
        try {
            const status = RealtimeOrderService.getMonitoringStatus();
            const binanceConnected = BinanceService.isConnected;

            res.json({
                realtimeService: status,
                binanceConnection: {
                    connected: binanceConnected,
                    reconnectAttempts: BinanceService.reconnectAttempts
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error getting monitoring status:', error);
            res.status(500).json({
                error: 'Failed to get monitoring status',
                details: error.message
            });
        }
    }
}

module.exports = WebhookController;