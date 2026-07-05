const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');
const resortRoutes = require('./routes/resorts');
const cron = require('node-cron');
const { exec, execFile } = require('child_process');
const fs = require('fs');

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

// Start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

const scriptPath = path.join(__dirname, 'getForecastFull_all_resorts.py');
const dataDir = process.env.DATA_DIR || __dirname;
const jsonPath = path.join(__dirname, 'weather_dataFull_7.json');
const venvPythonPath = path.join(__dirname, 'venv', 'bin', 'python3');
const pythonPath = process.env.PYTHON_PATH || (fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function fetchWeatherData() {
    console.log('Starting weather data fetch...');
    console.log('Script path:', scriptPath);
    console.log('JSON output path:', jsonPath);

    console.log('Python executable:', pythonPath);

    // Log Python packages
    execFile(pythonPath, ['-m', 'pip', 'list'], (error, stdout, stderr) => {
        if (error) {
            console.error('Unable to list Python packages:', error.message);
            return;
        }
        console.log('Installed Python packages:', stdout);
    });

    const options = {
        timeout: 300000, // Increased timeout to 5 minutes
        maxBuffer: 1024 * 1024 * 10,
        cwd: __dirname,
        env: {
            ...process.env,
            PYTHONUNBUFFERED: "1"
        }
    };

    execFile(pythonPath, [scriptPath], options, (error, stdout, stderr) => {
        if (error) {
            console.error('Execution error:', error);
            console.error('Error code:', error.code);
            console.error('Error signal:', error.signal);
            return;
        }

        if (stderr) {
            console.error('Python stderr:', stderr);
        }

        console.log('Python stdout:', stdout);

        try {
            if (fs.existsSync(jsonPath)) {
                const weatherData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                console.log('Weather data loaded successfully');
            } else {
                console.error('Weather data file not found at:', jsonPath);
            }
        } catch (err) {
            console.error('Error reading/parsing weather data:', err);
        }
    });
}

// Initial fetch
fetchWeatherData();

