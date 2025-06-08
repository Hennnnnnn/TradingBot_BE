// services/realtimeOrderService.js
const EventEmitter = require('events');
const BinanceService = require('./binanceService');
const Order = require('../models/Order');
const Config = require('../models/Config');

class RealtimeOrderService extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.pendingOrders = new Map();
        this.priceTargets = new Map();
        this.stopLossTargets = new Map();
        this.monitoredSymbols = new Set();
        this.orderQueue = [];
        this.processingQueue = false;
    }

    // Initialize real-time order service
    async initialize() {
        try {
            console.log('🚀 Initializing Real-time Order Service...');
            
            // Setup event listeners for Binance service
            this.setupBinanceEventListeners();
            
            // Load pending orders from database
            await this.loadPendingOrders();
            
            // Start monitoring
            this.isActive = true;
            
            console.log('✅ Real-time Order Service initialized');
            this.emit('initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Real-time Order Service:', error.message);
            throw error;
        }
    }

    // Setup event listeners for Binance WebSocket events
    setupBinanceEventListeners() {
        // Listen for price updates
        BinanceService.on('priceUpdate', (priceData) => {
            this.handlePriceUpdate(priceData);
        });

        // Listen for order updates
        BinanceService.on('orderUpdate', (executionReport) => {
            this.handleOrderUpdate(executionReport);
        });

        // Listen for connection events
        BinanceService.on('connected', () => {
            console.log('📡 Binance connected - resuming order monitoring');
            this.resumeMonitoring();
        });

        BinanceService.on('reconnected', () => {
            console.log('📡 Binance reconnected - resuming order monitoring');
            this.resumeMonitoring();
        });

        // Listen for stream errors
        BinanceService.on('streamError', (error) => {
            console.error('❌ Binance stream error:', error.message);
            this.handleStreamError(error);
        });
    }

    // Load pending orders from database
    async loadPendingOrders() {
        try {
            const orders = await Order.getAll();
            const pendingOrders = orders.filter(order => 
                order.status === 'pending' || 
                order.status === 'partial' ||
                order.status === 'waiting_trigger'
            );

            for (const order of pendingOrders) {
                this.addOrderToMonitoring(order);
            }

            console.log(`📋 Loaded ${pendingOrders.length} pending orders for monitoring`);
        } catch (error) {
            console.error('❌ Error loading pending orders:', error.message);
        }
    }

    // Add order to real-time monitoring
    addOrderToMonitoring(order) {
        try {
            this.pendingOrders.set(order.id, order);
            this.monitoredSymbols.add(order.symbol);

            // Add price targets if order has conditions
            if (order.triggerPrice) {
                this.priceTargets.set(`${order.symbol}_${order.id}`, {
                    orderId: order.id,
                    symbol: order.symbol,
                    targetPrice: order.triggerPrice,
                    condition: order.triggerCondition || 'above', // 'above' or 'below'
                    orderType: 'trigger'
                });
            }

            // Add stop loss targets
            if (order.stopLoss) {
                this.stopLossTargets.set(`${order.symbol}_${order.id}_sl`, {
                    orderId: order.id,
                    symbol: order.symbol,
                    targetPrice: order.stopLoss,
                    condition: order.side === 'BUY' ? 'below' : 'above',
                    orderType: 'stopLoss'
                });
            }

            // Add take profit targets
            if (order.takeProfit) {
                this.priceTargets.set(`${order.symbol}_${order.id}_tp`, {
                    orderId: order.id,
                    symbol: order.symbol,
                    targetPrice: order.takeProfit,
                    condition: order.side === 'BUY' ? 'above' : 'below',
                    orderType: 'takeProfit'
                });
            }

            // Start price monitoring for this symbol
            this.startSymbolMonitoring(order.symbol);

            console.log(`📊 Added order ${order.id} to real-time monitoring`);
            this.emit('orderAddedToMonitoring', order);

        } catch (error) {
            console.error('❌ Error adding order to monitoring:', error.message);
        }
    }

    // Start monitoring a specific symbol
    startSymbolMonitoring(symbol) {
        if (!this.monitoredSymbols.has(symbol)) {
            return;
        }

        try {
            // Start price stream for this symbol
            BinanceService.startPriceStream(symbol);
            console.log(`📡 Started price monitoring for ${symbol}`);
        } catch (error) {
            console.error(`❌ Error starting monitoring for ${symbol}:`, error.message);
        }
    }

    // Handle real-time price updates
    handlePriceUpdate(priceData) {
        const { symbol, price, timestamp } = priceData;

        // Check all price targets for this symbol
        this.checkPriceTargets(symbol, price, timestamp);
        
        // Emit price update event
        this.emit('priceUpdate', priceData);
    }

    // Check if any price targets are hit
    checkPriceTargets(symbol, currentPrice, timestamp) {
        try {
            // Check regular price targets
            for (const [targetKey, target] of this.priceTargets) {
                if (target.symbol !== symbol) continue;

                const isTriggered = this.isPriceTargetTriggered(target, currentPrice);
                
                if (isTriggered) {
                    console.log(`🎯 Price target hit for ${symbol}: ${currentPrice} (target: ${target.targetPrice})`);
                    this.triggerOrder(target, currentPrice, timestamp);
                    this.priceTargets.delete(targetKey);
                }
            }

            // Check stop loss targets
            for (const [targetKey, target] of this.stopLossTargets) {
                if (target.symbol !== symbol) continue;

                const isTriggered = this.isPriceTargetTriggered(target, currentPrice);
                
                if (isTriggered) {
                    console.log(`🛑 Stop loss triggered for ${symbol}: ${currentPrice} (target: ${target.targetPrice})`);
                    this.triggerOrder(target, currentPrice, timestamp);
                    this.stopLossTargets.delete(targetKey);
                }
            }

        } catch (error) {
            console.error('❌ Error checking price targets:', error.message);
        }
    }

    // Check if price target is triggered
    isPriceTargetTriggered(target, currentPrice) {
        const { targetPrice, condition } = target;
        
        switch (condition) {
            case 'above':
                return currentPrice >= targetPrice;
            case 'below':
                return currentPrice <= targetPrice;
            case 'equal':
                return Math.abs(currentPrice - targetPrice) < (targetPrice * 0.001); // 0.1% tolerance
            default:
                return false;
        }
    }

    // Trigger order execution
    async triggerOrder(target, currentPrice, timestamp) {
        try {
            const order = this.pendingOrders.get(target.orderId);
            if (!order) {
                console.error(`❌ Order ${target.orderId} not found in pending orders`);
                return;
            }

            console.log(`⚡ Triggering order ${order.id} - ${target.orderType}`);

            // Add to order queue for sequential processing
            this.orderQueue.push({
                order,
                target,
                triggerPrice: currentPrice,
                timestamp
            });

            // Process queue if not already processing
            if (!this.processingQueue) {
                this.processOrderQueue();
            }

        } catch (error) {
            console.error('❌ Error triggering order:', error.message);
        }
    }

    // Process order queue sequentially
    async processOrderQueue() {
        if (this.processingQueue || this.orderQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        try {
            while (this.orderQueue.length > 0) {
                const orderData = this.orderQueue.shift();
                await this.executeTriggeredOrder(orderData);
                
                // Small delay between orders to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error('❌ Error processing order queue:', error.message);
        } finally {
            this.processingQueue = false;
        }
    }

    // Execute triggered order
    async executeTriggeredOrder({ order, target, triggerPrice, timestamp }) {
        try {
            console.log(`🚀 Executing triggered order ${order.id}`);

            let orderToPlace;

            switch (target.orderType) {
                case 'trigger':
                    // Execute main order
                    orderToPlace = {
                        symbol: order.symbol,
                        side: order.side,
                        type: order.type,
                        quantity: order.quantity,
                        price: order.price || triggerPrice,
                        timeInForce: order.timeInForce
                    };
                    break;

                case 'stopLoss':
                    // Execute stop loss
                    orderToPlace = {
                        symbol: order.symbol,
                        side: order.side === 'BUY' ? 'SELL' : 'BUY', // Opposite side
                        type: 'MARKET', // Market order for immediate execution
                        quantity: order.quantity
                    };
                    break;

                case 'takeProfit':
                    // Execute take profit
                    orderToPlace = {
                        symbol: order.symbol,
                        side: order.side === 'BUY' ? 'SELL' : 'BUY', // Opposite side
                        type: 'LIMIT',
                        quantity: order.quantity,
                        price: triggerPrice,
                        timeInForce: 'GTC'
                    };
                    break;

                default:
                    throw new Error(`Unknown order type: ${target.orderType}`);
            }

            // Place order on Binance
            const binanceOrder = await BinanceService.placeOrder(orderToPlace);

            // Update order in database
            const updatedOrder = {
                ...order,
                status: 'executed',
                binanceOrderId: binanceOrder.orderId,
                executedPrice: binanceOrder.price || triggerPrice,
                executedQuantity: binanceOrder.executedQty,
                executedAt: new Date(timestamp).toISOString(),
                triggerPrice: triggerPrice,
                orderType: target.orderType
            };

            await Order.update(order.id, updatedOrder);

            // Remove from pending orders
            this.pendingOrders.delete(order.id);

            console.log(`✅ Order ${order.id} executed successfully`);
            this.emit('orderExecuted', {
                order: updatedOrder,
                binanceOrder,
                triggerPrice,
                orderType: target.orderType
            });

        } catch (error) {
            console.error(`❌ Error executing order ${order.id}:`, error.message);
            
            // Update order status to error
            try {
                await Order.update(order.id, {
                    ...order,
                    status: 'error',
                    errorMessage: error.message,
                    errorAt: new Date().toISOString()
                });
            } catch (updateError) {
                console.error('❌ Error updating order status:', updateError.message);
            }

            this.emit('orderExecutionError', {
                order,
                error: error.message,
                triggerPrice,
                orderType: target.orderType
            });
        }
    }

    // Handle Binance order updates
    handleOrderUpdate(executionReport) {
        try {
            const binanceOrderId = executionReport.i;
            const status = executionReport.X;
            const symbol = executionReport.s;

            console.log(`📋 Binance order update: ${binanceOrderId} - ${status}`);

            // Find corresponding order in our system
            for (const [orderId, order] of this.pendingOrders) {
                if (order.binanceOrderId === binanceOrderId) {
                    this.updateOrderFromBinance(order, executionReport);
                    break;
                }
            }

            this.emit('binanceOrderUpdate', executionReport);

        } catch (error) {
            console.error('❌ Error handling order update:', error.message);
        }
    }

    // Update order from Binance execution report
    async updateOrderFromBinance(order, executionReport) {
        try {
            const updatedOrder = {
                ...order,
                status: this.mapBinanceStatusToOrderStatus(executionReport.X),
                executedQuantity: executionReport.z,
                remainingQuantity: parseFloat(order.quantity) - parseFloat(executionReport.z),
                lastExecutedPrice: executionReport.L,
                commission: executionReport.n,
                commissionAsset: executionReport.N,
                updatedAt: new Date().toISOString()
            };

            await Order.update(order.id, updatedOrder);

            // Remove from pending if fully executed or cancelled
            if (executionReport.X === 'FILLED' || executionReport.X === 'CANCELED') {
                this.pendingOrders.delete(order.id);
                this.cleanupOrderTargets(order.id);
            }

            console.log(`📋 Order ${order.id} updated from Binance`);

        } catch (error) {
            console.error('❌ Error updating order from Binance:', error.message);
        }
    }

    // Map Binance order status to our order status
    mapBinanceStatusToOrderStatus(binanceStatus) {
        const statusMap = {
            'NEW': 'pending',
            'PARTIALLY_FILLED': 'partial',
            'FILLED': 'filled',
            'CANCELED': 'cancelled',
            'PENDING_CANCEL': 'cancelling',
            'REJECTED': 'rejected',
            'EXPIRED': 'expired'
        };

        return statusMap[binanceStatus] || 'unknown';
    }

    // Cleanup order targets when order is complete
    cleanupOrderTargets(orderId) {
        // Remove price targets
        for (const [key, target] of this.priceTargets) {
            if (target.orderId === orderId) {
                this.priceTargets.delete(key);
            }
        }

        // Remove stop loss targets
        for (const [key, target] of this.stopLossTargets) {
            if (target.orderId === orderId) {
                this.stopLossTargets.delete(key);
            }
        }
    }

    // Resume monitoring after reconnection
    resumeMonitoring() {
        try {
            // Restart price streams for all monitored symbols
            for (const symbol of this.monitoredSymbols) {
                BinanceService.startPriceStream(symbol);
            }

            console.log('✅ Order monitoring resumed');
            this.emit('monitoringResumed');

        } catch (error) {
            console.error('❌ Error resuming monitoring:', error.message);
        }
    }

    // Handle stream errors
    handleStreamError(error) {
        console.error('📡 WebSocket stream error - implementing recovery...', error.message);
        
        // Implement exponential backoff for reconnection
        setTimeout(() => {
            this.resumeMonitoring();
        }, 5000);
    }

    // Cancel order monitoring
    async cancelOrderMonitoring(orderId) {
        try {
            const order = this.pendingOrders.get(orderId);
            if (!order) {
                console.log(`📋 Order ${orderId} not found in monitoring`);
                return;
            }

            // Remove from pending orders
            this.pendingOrders.delete(orderId);
            
            // Cleanup targets
            this.cleanupOrderTargets(orderId);

            console.log(`🛑 Cancelled monitoring for order ${orderId}`);
            this.emit('orderMonitoringCancelled', orderId);

        } catch (error) {
            console.error('❌ Error cancelling order monitoring:', error.message);
        }
    }

    // Get monitoring status
    getMonitoringStatus() {
        return {
            isActive: this.isActive,
            pendingOrdersCount: this.pendingOrders.size,
            monitoredSymbols: Array.from(this.monitoredSymbols),
            priceTargetsCount: this.priceTargets.size,
            stopLossTargetsCount: this.stopLossTargets.size,
            queueLength: this.orderQueue.length,
            processingQueue: this.processingQueue
        };
    }

    // Stop real-time monitoring
    async stop() {
        try {
            console.log('🛑 Stopping Real-time Order Service...');
            
            this.isActive = false;
            this.pendingOrders.clear();
            this.priceTargets.clear();
            this.stopLossTargets.clear();
            this.monitoredSymbols.clear();
            this.orderQueue = [];
            this.processingQueue = false;

            console.log('✅ Real-time Order Service stopped');
            this.emit('stopped');

        } catch (error) {
            console.error('❌ Error stopping Real-time Order Service:', error.message);
        }
    }
}

module.exports = new RealtimeOrderService();