const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { PORT } = require('./config/constants');

const app = express();

app.use(cors(
  {
    origin: ['http://localhost:3000', 'https://trading-bot-fe-three.vercel.app'],
    credentials: true
  }
));
app.use(express.json());

app.use('/', routes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Trading Strategy Backend running on port ${PORT}`);
  console.log(`📊 Endpoints available:`);
  console.log(`   GET  /config     - Get active configuration`);
  console.log(`   POST /config     - Save configuration`);
  console.log(`   POST /webhook    - TradingView webhook`);
  console.log(`   GET  /orders     - Get all orders`);
});

module.exports = app;