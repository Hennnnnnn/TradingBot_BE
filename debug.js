// debug-binance-connection.js
const https = require('https');
const http = require('http');

async function debugBinanceConnection() {
    console.log('🔍 Starting Binance connection debugging...\n');

    // Test 1: Raw HTTPS request to testnet
    console.log('📡 Test 1: Raw HTTPS request to testnet time endpoint');
    try {
        await testRawHttps('https://testnet.binance.vision/api/v3/time');
    } catch (error) {
        console.error('❌ Raw HTTPS test failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: Raw HTTPS request to mainnet (for comparison)
    console.log('📡 Test 2: Raw HTTPS request to mainnet time endpoint');
    try {
        await testRawHttps('https://api.binance.com/api/v3/time');
    } catch (error) {
        console.error('❌ Mainnet HTTPS test failed:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Test with node-binance-api library
    console.log('📡 Test 3: Using node-binance-api library');
    try {
        await testBinanceLibrary();
    } catch (error) {
        console.error('❌ Binance library test failed:', error.message);
    }
}

function testRawHttps(url) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        console.log(`⏰ Starting request to: ${url}`);
        
        const timeout = setTimeout(() => {
            console.log('⏱️  Request timed out after 10 seconds');
            reject(new Error('Request timeout'));
        }, 10000);

        const request = https.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Node.js/Debug-Test'
            }
        }, (response) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            console.log(`✅ Response received in ${duration}ms`);
            console.log(`📊 Status: ${response.statusCode}`);
            console.log(`📋 Headers:`, Object.keys(response.headers));

            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    console.log(`🕐 Server time: ${new Date(parsed.serverTime).toISOString()}`);
                    console.log(`🕐 Local time: ${new Date().toISOString()}`);
                    resolve(parsed);
                } catch (parseError) {
                    console.log(`📄 Raw response: ${data.substring(0, 200)}...`);
                    resolve(data);
                }
            });
        });

        request.on('error', (error) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            console.log(`❌ Request failed after ${duration}ms: ${error.message}`);
            reject(error);
        });

        request.on('timeout', () => {
            clearTimeout(timeout);
            console.log('⏱️  Request socket timeout');
            request.destroy();
            reject(new Error('Socket timeout'));
        });

        console.log('📤 Request sent, waiting for response...');
    });
}

async function testBinanceLibrary() {
    const Binance = require('node-binance-api');
    
    console.log('🔧 Creating Binance client for testnet...');
    const binance = new Binance().options({
        test: true,
        useServerTime: true,
        recvWindow: 60000,
        verbose: true,
        urls: {
            base: 'https://testnet.binance.vision/api/',
            wapi: 'https://testnet.binance.vision/wapi/',
            sapi: 'https://testnet.binance.vision/sapi/',
            fapi: 'https://testnet.binancefuture.com/fapi/',
            stream: 'wss://testnet.binance.vision/ws/',
            combineStream: 'wss://testnet.binance.vision/stream'
        }
    });

    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        console.log('⏰ Calling binance.time()...');
        
        const timeout = setTimeout(() => {
            console.log('⏱️  Binance library call timed out after 10 seconds');
            reject(new Error('Binance library timeout'));
        }, 10000);

        binance.time((error, response) => {
            clearTimeout(timeout);
            const duration = Date.now() - startTime;
            
            if (error) {
                console.log(`❌ Binance library error after ${duration}ms:`, error);
                reject(error);
            } else {
                console.log(`✅ Binance library success after ${duration}ms`);
                console.log(`🕐 Server time: ${new Date(response.serverTime).toISOString()}`);
                resolve(response);
            }
        });
        
        console.log('📤 Binance library call initiated, waiting...');
    });
}

// Network diagnostics
function printNetworkInfo() {
    console.log('🌐 Network Information:');
    console.log(`Node.js version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);
    console.log(`Architecture: ${process.arch}`);
    
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    console.log('Network interfaces:', Object.keys(networkInterfaces));
}

// Run the debug tests
async function main() {
    printNetworkInfo();
    console.log('\n' + '='.repeat(50) + '\n');
    
    try {
        await debugBinanceConnection();
        console.log('\n✅ All tests completed');
    } catch (error) {
        console.log('\n❌ Debug tests failed:', error.message);
    }
}

main().catch(console.error);