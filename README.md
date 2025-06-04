Name: Hendri Jonathan

## ✨ Features

- **Modular Architecture**: Clean, maintainable code structure with separation of concerns
- **TradingView Integration**: Webhook endpoint for receiving real-time trading signals
- **ADX-Based Strategy**: Uses Plus DI, Minus DI, and ADX indicators for signal validation
- **Risk Management**: Configurable take profit and stop loss percentages
- **Real-time Pricing**: Integration with Binance API for current market prices
- **Order Management**: Persistent storage and retrieval of trading orders
- **RESTful API**: Complete REST API for configuration and order management
- **Error Handling**: Comprehensive error handling and logging
- **Flexible Configuration**: Easy-to-modify trading parameters

## 🏗️ Architecture

The bot follows a modular MVC-like architecture:

```
├── Controllers    → Handle HTTP requests
├── Services       → Business logic and external APIs
├── Models         → Data management and persistence
├── Routes         → API endpoint definitions
├── Utils          → Reusable utilities
├── Config         → Configuration and constants
└── Middleware     → Cross-cutting concerns
```

## 📁 Project Structure

```
trading-strategy-bot/
├── config/
│   └── constants.js           # Configuration constants
├── controllers/
│   ├── configController.js    # Configuration endpoints
│   ├── orderController.js     # Order management endpoints
│   └── webhookController.js   # Webhook processing
├── middleware/
│   └── errorHandler.js        # Global error handling
├── models/
│   ├── Config.js             # Configuration data model
│   └── Order.js              # Order data model
├── routes/
│   └── index.js              # API route definitions
├── services/
│   ├── binanceService.js     # Binance API integration
│   └── tradingService.js     # Trading logic and calculations
├── utils/
│   └── fileManager.js        # File I/O utilities
├── app.js                    # Main application entry point
├── config.json               # Persistent configuration storage
├── orders.json               # Persistent order storage
└── package.json              # Project dependencies
```