const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const resortRoutes = require('./routes/resorts');
const { captureForecastSnapshot } = require('./snapshots/captureSnapshot');

// Initialize the app and configure environment variables
dotenv.config();
const app = express();

// Set up middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files
app.use('/styles', express.static(path.join(__dirname, 'styles')));

// Use resort routes
app.use('/', resortRoutes);

function startServer({
    port = process.env.PORT || 3002,
    host = '0.0.0.0',
    capture = captureForecastSnapshot,
    logger = console,
    captureOptions = {},
} = {}) {
    const dataDir = captureOptions.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
    try {
        capture({
            weatherPath: path.join(__dirname, 'weather_dataFull_7.json'),
            resortMetaPath: path.join(__dirname, 'resorts_for_forecast.json'),
            dataDir,
            logger,
            ...captureOptions,
        });
    } catch (error) {
        logger.error(`EPCI snapshot capture failed; serving forecast: ${error.message}`);
    }
    return app.listen(port, host, () => logger.info(`Server running on port ${port}`));
}

if (require.main === module) startServer();

module.exports = app;
module.exports.startServer = startServer;

