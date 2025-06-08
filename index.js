// app.js or server.js - Enhanced initialization
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import services
const BinanceService = require('./services/binanceService');
const RealtimeOrderService = require('./services/realtimeOrderService');
const Config = require('./models/Config');

// Import controllers
const ConfigController = require('./controllers/configController');
const OrderController = require('./controllers/orderControllers');
const WebhookController = require('./controllers/webhookControllers');

class TradingApp {
    constructor() {
        this.app = express();
        this.isShuttingDown = false;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use('/api/', limiter);

        // Webhook specific rate limiting (more restrictive)
        const webhookLimiter = rateLimit({
            windowMs: 1 * 60 * 1000, // 1 minute
            max: 10, // limit each IP to 10 webhook requests per minute
            message: 'Too many webhook requests'
        });
        this.app.use('/api/webhook', webhookLimiter);

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                services: {
                    binance: BinanceService.isConnected,
                    realtimeOrders: RealtimeOrderService.isActive
                }
            });
        });

        // Configuration routes
        this.app.get('/api/config', ConfigController.getConfig);
        this.app.post('/api/config', ConfigController.saveConfig);

        // Order routes
        this.app.get('/api/orders', OrderController.getOrders);
        this.app.delete('/api/orders', OrderController.clearOrders);

        // Webhook routes
        this.app.post('/api/webhook', WebhookController.processWebhook);
        this.app.post('/api/orders/:orderId/trigger', WebhookController.triggerOrder);
        this.app.delete('/api/orders/:orderId/trigger', WebhookController.cancelTriggerOrder);

        // Monitoring routes
        this.app.get('/api/monitoring/status', WebhookController.getMonitoringStatus);

        // Binance connection routes
        this.app.post('/api/binance/connect', async (req, res) => {
            try {
                const config = await Config.get();
                await BinanceService.initialize(config);
                res.json({ message: 'Binance connection established' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/binance/disconnect', async (req, res) => {
            try {
                await BinanceService.disconnect();
                res.json({ message: 'Binance connection closed' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/binance/account', async (req, res) => {
            try {
                const accountInfo = await BinanceService.getAccountInfo();
                res.json(accountInfo);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/binance/orders/:symbol?', async (req, res) => {
            try {
                const { symbol } = req.params;
                const openOrders = await BinanceService.getOpenOrders(symbol);
                res.json(openOrders);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Real-time service routes
        this.app.post('/api/realtime/start', async (req, res) => {
            try {
                await RealtimeOrderService.initialize();
                res.json({ message: 'Real-time order service started' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/api/realtime/stop', async (req, res) => {
            try {
                await RealtimeOrderService.stop();
                res.json({ message: 'Real-time order service stopped' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    setupErrorHandling() {
        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('❌ Unhandled error:', error);
            
            if (res.headersSent) {
                return next(error);
            }

            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.gracefulShutdown('uncaughtException');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            this.gracefulShutdown('unhandledRejection');
        });

        // Handle SIGTERM
        process.on('SIGTERM', () => {
            console.log('📡 SIGTERM received');
            this.gracefulShutdown('SIGTERM');
        });

        // Handle SIGINT
        process.on('SIGINT', () => {
            console.log('📡 SIGINT received');
            this.gracefulShutdown('SIGINT');
        });
    }

    async gracefulShutdown(signal) {
        if (this.isShuttingDown) {
            console.log('⏳ Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        console.log(`🛑 Starting graceful shutdown due to ${signal}...`);

        try {
            // Stop accepting new requests
            console.log('🔒 Stopping server...');
            this.server?.close();

            // Stop real-time services
            console.log('⏸️ Stopping real-time order service...');
            await RealtimeOrderService.stop();

            // Disconnect from Binance
            console.log('🔌 Disconnecting from Binance...');
            await BinanceService.disconnect();

            console.log('✅ Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Trading Application...');

            // Load configuration
            console.log('📋 Loading configuration...');
            const config = await Config.get();
            
            if (!config.binanceApiKey || !config.binanceApiSecret) {
                console.log('⚠️ Binance API credentials not configured');
                console.log('🔧 Please configure your API credentials via /api/config endpoint');
            } else {
                // Initialize Binance connection
                console.log('🔗 Connecting to Binance...');
                await BinanceService.initialize(config);

                // Initialize real-time order service
                console.log('⚡ Starting real-time order service...');
                await RealtimeOrderService.initialize();

                // Setup event listeners for better logging
                this.setupServiceEventListeners();
            }

            console.log('✅ Trading Application initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            throw error;
        }
    }

    setupServiceEventListeners() {
        // Binance service events
        BinanceService.on('connected', () => {
            console.log('✅ Binance service connected');
        });

        BinanceService.on('reconnected', () => {
            console.log('🔄 Binance service reconnected');
        });

        BinanceService.on('orderPlaced', (order) => {
            console.log(`✅ Order placed on Binance: ${order.orderId}`);
        });

        BinanceService.on('orderError', (error) => {
            console.log(`❌ Binance order error: ${error.error}`);
        });

        // Real-time order service events
        RealtimeOrderService.on('initialized', () => {
            console.log('✅ Real-time order service initialized');
        });

        RealtimeOrderService.on('orderExecuted', (data) => {
            console.log(`⚡ Order executed: ${data.order.id} at ${data.triggerPrice}`);
        });

        RealtimeOrderService.on('orderExecutionError', (data) => {
            console.log(`❌ Order execution error: ${data.order.id} - ${data.error}`);
        });

        RealtimeOrderService.on('priceUpdate', (priceData) => {
            // Optional: log price updates (can be very verbose)
            // console.log(`📊 Price update: ${priceData.symbol} = ${priceData.price}`);
        });
    }

    async start(port = process.env.PORT || 3001) {
        try {
            // Initialize services
            await this.initialize();

            // Start server
            this.server = this.app.listen(port, () => {
                console.log(`🌟 Trading Application running on port ${port}`);
                console.log(`📡 Webhook endpoint: http://localhost:${port}/api/webhook`);
                console.log(`🏥 Health check: http://localhost:${port}/api/health`);
                console.log(`📊 Monitoring: http://localhost:${port}/api/monitoring/status`);
            });

            return this.server;

        } catch (error) {
            console.error('❌ Failed to start application:', error);
            process.exit(1);
        }
    }
}

// Export for use in other files
module.exports = TradingApp;

// If this file is run directly, start the application
if (require.main === module) {
    const app = new TradingApp();
    app.start();
}