// services/binanceService.js
const Binance = require('node-binance-api');
const WebSocket = require('ws');
const EventEmitter = require('events');

class BinanceService extends EventEmitter {
    constructor() {
        super();
        this.binance = null;
        this.websockets = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // 1 second initial delay
        this.initializationInProgress = false;
    }

    // Initialize Binance connection with testnet support
    async initialize(config) {
        // Prevent multiple simultaneous initializations
        if (this.initializationInProgress) {
            console.log('⏳ Initialization already in progress, waiting...');
            // Wait for current initialization to complete
            while (this.initializationInProgress) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.isConnected;
        }

        if (this.isConnected) {
            console.log('✅ Binance already connected');
            return true;
        }

        this.initializationInProgress = true;

        try {
            console.log('🔌 Starting Binance initialization...');
            
            // Validate required config
            if (!config.binanceApiKey || !config.binanceApiSecret) {
                throw new Error('Binance API key and secret are required');
            }

            const useTestnet = config.useTestnet !== false; // Default to true for safety
            console.log(`🔧 Using ${useTestnet ? 'Testnet' : 'Mainnet'} environment`);

            // Create Binance client with proper configuration
            this.binance = new Binance().options({
                APIKEY: config.binanceApiKey,
                APISECRET: config.binanceApiSecret,
                test: useTestnet,
                useServerTime: true,
                recvWindow: 60000,
                verbose: config.verbose || false,
                log: config.enableLogging ? (...args) => console.log('📊 Binance:', ...args) : () => {},
                
                // Proper URL configuration
                urls: useTestnet ? {
                    base: 'https://testnet.binance.vision/api/',
                    wapi: 'https://testnet.binance.vision/wapi/',
                    sapi: 'https://testnet.binance.vision/sapi/',
                    fapi: 'https://testnet.binancefuture.com/fapi/',
                    stream: 'wss://testnet.binance.vision/ws/',
                    combineStream: 'wss://testnet.binance.vision/stream'
                } : undefined // Use default URLs for mainnet
            });

            // Wait a bit for the client to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Test connection with retry logic
            let connectionTestPassed = false;
            let testAttempts = 0;
            const maxTestAttempts = 3;

            while (!connectionTestPassed && testAttempts < maxTestAttempts) {
                testAttempts++;
                try {
                    console.log(`🔍 Testing connection (attempt ${testAttempts}/${maxTestAttempts})...`);
                    await this.testConnection();
                    connectionTestPassed = true;
                } catch (testError) {
                    console.log(`❌ Connection test ${testAttempts} failed:`, testError.message);
                    if (testAttempts < maxTestAttempts) {
                        console.log('⏳ Retrying in 2 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }

            if (!connectionTestPassed) {
                throw new Error('Failed to establish connection after multiple attempts');
            }

            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.initializationInProgress = false;
            
            console.log(`✅ Binance ${useTestnet ? 'Testnet' : 'Mainnet'} connection established successfully`);
            this.emit('connected');
            
            return true;

        } catch (error) {
            this.initializationInProgress = false;
            this.isConnected = false;
            this.binance = null;
            
            console.error('❌ Failed to initialize Binance connection:', error.message);
            
            // More specific error messages
            if (error.message.includes('Invalid API-key')) {
                console.error('🔑 Check your API key - it may be invalid or expired');
            } else if (error.message.includes('Signature')) {
                console.error('🔐 Check your API secret - signature validation failed');
            } else if (error.message.includes('IP')) {
                console.error('🌍 Check IP restrictions on your API key');
            } else if (error.message.includes('permissions')) {
                console.error('🔒 Check API key permissions - trading may not be enabled');
            }
            
            throw error;
        }
    }

    // Test connection stability with better error handling
    async testConnection() {
        try {
            if (!this.binance) {
                throw new Error('Binance client not initialized');
            }

            // Test server time first (doesn't require authentication)
            console.log('⏰ Testing server time...');
            const timeResponse = await new Promise((resolve, reject) => {
                this.binance.time((error, response) => {
                    if (error) {
                        reject(new Error(`Server time error: ${error.body || error.message || error}`));
                    } else {
                        resolve(response);
                    }
                });
            });

            const serverTime = new Date(timeResponse.serverTime);
            const localTime = new Date();
            const timeDiff = Math.abs(serverTime.getTime() - localTime.getTime());
            
            console.log(`⏰ Server time: ${serverTime.toISOString()}`);
            console.log(`⏰ Local time: ${localTime.toISOString()}`);
            console.log(`⏰ Time difference: ${timeDiff}ms`);

            if (timeDiff > 5000) {
                console.warn('⚠️ Large time difference detected - this may cause issues');
            }

            // Test account info (requires authentication)
            console.log('🔐 Testing account access...');
            const accountResponse = await new Promise((resolve, reject) => {
                this.binance.account((error, response) => {
                    if (error) {
                        reject(new Error(`Account access error: ${error.body || error.message || error}`));
                    } else {
                        resolve(response);
                    }
                });
            });

            console.log('📊 Connection test successful');
            console.log(`💰 Account type: ${accountResponse.accountType}`);
            console.log(`🔄 Can trade: ${accountResponse.canTrade}`);
            console.log(`📤 Can withdraw: ${accountResponse.canWithdraw}`);
            console.log(`📥 Can deposit: ${accountResponse.canDeposit}`);
            
            return true;

        } catch (error) {
            console.error('❌ Connection test failed:', error.message);
            throw error;
        }
    }

    async getPrice(symbol) {
        try {
            if (!this.isConnected || !this.binance) {
                throw new Error('Binance connection not established');
            }

            console.log(`💰 Getting price for ${symbol}...`);

            const priceResponse = await new Promise((resolve, reject) => {
                this.binance.prices(symbol, (error, ticker) => {
                    if (error) {
                        reject(new Error(`Price fetch error: ${error.body || error.message || error}`));
                    } else {
                        resolve(ticker);
                    }
                });
            });

            const price = parseFloat(priceResponse[symbol]);
            console.log(`💰 ${symbol} price: $${price}`);
            
            return price;

        } catch (error) {
            console.error(`❌ Error getting price for ${symbol}:`, error.message);
            throw error;
        }
    }

    // Place order with enhanced error handling
    async placeOrder(orderData) {
        try {
            if (!this.isConnected || !this.binance) {
                throw new Error('Binance connection not established');
            }

            const {
                symbol,
                side,
                type,
                quantity,
                price,
                timeInForce = 'GTC',
                stopPrice,
                icebergQty
            } = orderData;

            let orderParams = {
                symbol,
                side: side.toUpperCase(),
                type: type.toUpperCase(),
                quantity: parseFloat(quantity).toFixed(8),
                timeInForce
            };

            // Add price for limit orders
            if (type.toUpperCase() === 'LIMIT') {
                orderParams.price = parseFloat(price).toFixed(8);
            }

            // Add stop price for stop orders
            if (stopPrice) {
                orderParams.stopPrice = parseFloat(stopPrice).toFixed(8);
            }

            // Add iceberg quantity if specified
            if (icebergQty) {
                orderParams.icebergQty = parseFloat(icebergQty).toFixed(8);
            }

            console.log('📝 Placing order:', orderParams);
            
            const result = await new Promise((resolve, reject) => {
                this.binance.order(orderParams, (error, response) => {
                    if (error) {
                        reject(new Error(`Order placement error: ${error.body || error.message || error}`));
                    } else {
                        resolve(response);
                    }
                });
            });
            
            console.log('✅ Order placed successfully:', {
                orderId: result.orderId,
                symbol: result.symbol,
                side: result.side,
                quantity: result.executedQty,
                price: result.price
            });

            this.emit('orderPlaced', result);
            return result;

        } catch (error) {
            console.error('❌ Error placing order:', error.message);
            this.emit('orderError', { error: error.message, orderData });
            throw error;
        }
    }

    // Start real-time price monitoring
    startPriceStream(symbols) {
        try {
            if (!this.isConnected || !this.binance) {
                throw new Error('Binance connection not established');
            }

            if (!Array.isArray(symbols)) {
                symbols = [symbols];
            }

            symbols.forEach(symbol => {
                const streamKey = `${symbol.toLowerCase()}@ticker`;
                
                if (this.websockets.has(streamKey)) {
                    console.log(`📡 Price stream for ${symbol} already active`);
                    return;
                }

                console.log(`🚀 Starting price stream for ${symbol}`);
                
                const ws = this.binance.websockets.miniTicker([symbol], (ticker) => {
                    const priceData = {
                        symbol: ticker.symbol,
                        price: parseFloat(ticker.close),
                        change: parseFloat(ticker.change),
                        changePercent: parseFloat(ticker.changePercent),
                        volume: parseFloat(ticker.volume),
                        timestamp: Date.now()
                    };

                    this.emit('priceUpdate', priceData);
                });

                this.websockets.set(streamKey, ws);
            });

        } catch (error) {
            console.error('❌ Error starting price stream:', error.message);
            this.emit('streamError', error);
        }
    }

    // Get account information
    async getAccountInfo() {
        try {
            if (!this.isConnected || !this.binance) {
                throw new Error('Binance connection not established');
            }

            const account = await new Promise((resolve, reject) => {
                this.binance.account((error, response) => {
                    if (error) {
                        reject(new Error(`Account info error: ${error.body || error.message || error}`));
                    } else {
                        resolve(response);
                    }
                });
            });

            return {
                accountType: account.accountType,
                balances: account.balances.filter(balance => 
                    parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
                ),
                canTrade: account.canTrade,
                canWithdraw: account.canWithdraw,
                canDeposit: account.canDeposit
            };

        } catch (error) {
            console.error('❌ Error getting account info:', error.message);
            throw error;
        }
    }

    // Auto-reconnect mechanism
    async handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                // Reset connection state
                this.isConnected = false;
                this.binance = null;
                
                // Try to reconnect
                const config = {
                    binanceApiKey: process.env.BINANCE_API_KEY,
                    binanceApiSecret: process.env.BINANCE_API_SECRET,
                    useTestnet: process.env.USE_TESTNET === 'true'
                };
                
                await this.initialize(config);
                console.log('✅ Reconnection successful');
                this.emit('reconnected');
            } catch (error) {
                console.error('❌ Reconnection failed:', error.message);
                this.handleReconnection();
            }
        }, delay);
    }

    // Cleanup and disconnect
    async disconnect() {
        try {
            console.log('🔌 Disconnecting from Binance...');
            
            // Stop all websocket streams
            for (const [streamKey, ws] of this.websockets) {
                try {
                    if (this.binance && this.binance.websockets) {
                        this.binance.websockets.terminate(ws);
                    }
                } catch (error) {
                    console.error(`Error stopping stream ${streamKey}:`, error.message);
                }
            }
            
            this.websockets.clear();
            this.isConnected = false;
            this.binance = null;
            this.initializationInProgress = false;
            
            console.log('✅ Disconnected from Binance');
        } catch (error) {
            console.error('❌ Error during disconnect:', error.message);
        }
    }
}

module.exports = new BinanceService();