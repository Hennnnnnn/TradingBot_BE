// simple-binance-test.js
const https = require('https');
const crypto = require('crypto');

class SimpleBinanceClient {
    constructor(apiKey, apiSecret, useTestnet = true) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseUrl = useTestnet 
            ? 'testnet.binance.vision'
            : 'api.binance.com';
    }

    async makeRequest(endpoint, method = 'GET', params = {}) {
        return new Promise((resolve, reject) => {
            const queryString = new URLSearchParams(params).toString();
            const path = `/api/v3${endpoint}${queryString ? '?' + queryString : ''}`;
            
            const options = {
                hostname: this.baseUrl,
                port: 443,
                path: path,
                method: method,
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Simple-Binance-Client/1.0'
                },
                timeout: 10000
            };

            console.log(`📡 Making request to: https://${this.baseUrl}${path}`);

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${response.msg || data}`));
                        }
                    } catch (error) {
                        reject(new Error(`Parse error: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request error: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    async getServerTime() {
        console.log('⏰ Getting server time...');
        const response = await this.makeRequest('/time');
        const serverTime = new Date(response.serverTime);
        console.log(`🕐 Server time: ${serverTime.toISOString()}`);
        return response;
    }

    createSignature(queryString) {
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    async getAccountInfo() {
        console.log('🔐 Getting account info...');
        
        const timestamp = Date.now();
        const params = { timestamp };
        const queryString = new URLSearchParams(params).toString();
        const signature = this.createSignature(queryString);
        
        params.signature = signature;
        
        const response = await this.makeRequest('/account', 'GET', params);
        console.log(`💰 Account type: ${response.accountType}`);
        console.log(`🔄 Can trade: ${response.canTrade}`);
        return response;
    }
}

// Test the simple client
async function testSimpleClient() {
    console.log('🧪 Testing Simple Binance Client...\n');
    
    const client = new SimpleBinanceClient(
        process.env.BINANCE_API_KEY || 'your-api-key',
        process.env.BINANCE_API_SECRET || 'your-api-secret',
        true // Use testnet
    );

    try {
        // Test 1: Server time (no auth required)
        await client.getServerTime();
        console.log('✅ Server time test passed\n');

        // Test 2: Account info (auth required)
        if (process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
            await client.getAccountInfo();
            console.log('✅ Account info test passed\n');
        } else {
            console.log('⚠️ Skipping account test - no API credentials\n');
        }

        console.log('🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Test with original node-binance-api to compare
async function testOriginalLibrary() {
    console.log('🧪 Testing Original node-binance-api...\n');
    
    try {
        const Binance = require('node-binance-api');
        const binance = new Binance().options({
            test: true,
            verbose: false
        });

        console.log('⏰ Testing original library server time...');
        
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Original library timeout'));
            }, 5000);

            binance.time((error, response) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                } else {
                    resolve(response);
                }
            });
        });

        console.log('✅ Original library works:', new Date(result.serverTime).toISOString());
        
    } catch (error) {
        console.error('❌ Original library failed:', error.message);
    }
}

async function main() {
    await testSimpleClient();
    console.log('\n' + '='.repeat(50) + '\n');
    await testOriginalLibrary();
}

main().catch(console.error);