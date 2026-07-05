const { error } = require('console');
const fs = require('fs');
const path = require('path');
const { stdout, stderr } = require('process');
const { exec } = require('child_process');
const os = require('os');



const allResortsForecastPath = path.join(__dirname, '../weather_dataFull_7.json')


// Controller function to get snowfall data from JSON
exports.getSnowfallForResorts = async (req, res) => {
    try {
        // Read and parse the weather data JSON file
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
        
        // Transform the data structure and extract top lift information
        const snowfallData = Object.entries(weatherData).map(([resortName, resortData]) => {
            // Log the data to see what we're getting
            //console.log('Resort Data:', resortName, resortData.url);
            
            return {
                resort: resortName,
                country: resortData.country,
                url: resortData.url || '', // Provide a default empty string if url is undefined
                elevation: resortData.elevations['Top Lift'].elevation_m,
                history14daySum: resortData.history14daySum['Top Lift'],
                threeDaySnowSum: resortData['3daysSnowSum']['Top Lift'],
                sevenDaySnowSum: resortData['7daysSnowSum']['Top Lift'],
                twoWeeksSnowSum: resortData['14daysSnowSum']['Top Lift']
            };
        });

        // Sort by 7-day snowfall and get top 10 resorts
        const sortedByUpcoming7Days = snowfallData
            .slice()
            .sort((a, b) => b.sevenDaySnowSum - a.sevenDaySnowSum)
            .slice(0, 10);

        // Sort by last 14-day historical snowfall and get top 10 resorts
        const sortedByLast14Days = snowfallData
            .slice()
            .sort((a, b) => b.history14daySum - a.history14daySum)
            .slice(0, 10);

        // Log the sorted data to verify URLs are present
        //console.log('Sorted 7 Days Data:', sortedByUpcoming7Days);
        //console.log('Sorted 14 Days Data:', sortedByLast14Days);

        //console.log('Sample URL:', snowfallData[0].url);

        res.render('index', {
            sortedByUpcoming7Days,
            sortedByLast14Days
        });
    } catch (error) {
        console.error('Error reading weather data:', error);
        res.status(500).render('error', { error: 'Failed to load snowfall data' });
    }
};


//lists by country
exports.getAllResortsForecast = async (req, res) => {
    try {
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));

        // List of countries to process
        const countries = ['Austria', 'Italy', 'Switzerland', 'France', 'Slovakia', 'Germany', 'Czech republic', 'Slovenia'];

        // Prepare an object to store top resorts by country
        let resortsByCountry = {};

        // Initialize country arrays
        countries.forEach(country => {
            resortsByCountry[country] = [];
        });

        // Process each resort
        Object.entries(weatherData).forEach(([resortName, resortInfo]) => {
            const resortCountry = resortInfo.country;
            
            if (countries.includes(resortCountry)) {
                resortsByCountry[resortCountry].push({
                    resort: resortName,
                    url: resortInfo.url || '#', // Provide fallback URL if missing
                    topLiftSevenDaySnowSum: resortInfo['7daysSnowSum']['Top Lift'] || 0,
                    topLiftElevation: resortInfo.elevations['Top Lift'].elevation_m || 0
                });
            }
        });

        // Sort resorts in each country by snow sum and get top 5
        Object.keys(resortsByCountry).forEach(country => {
            resortsByCountry[country] = resortsByCountry[country]
                .sort((a, b) => b.topLiftSevenDaySnowSum - a.topLiftSevenDaySnowSum)
                .slice(0, 5);
        });

        // Log some debug information
        console.log('Sample resort data:', Object.values(resortsByCountry)[0][0]);

        res.render('allResortsByCountry', { resortsByCountry });
    } catch (error) {
        console.error('Error processing resort data:', error);
        res.status(500).render('error', { error: 'Failed to load resort data' });
    }
};


//get all countries combined
exports.getCombinedForecast = async (req, res) => {
    try {
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));

        
        const countries = ['Austria', 'Italy','Switzerland','France','Slovakia','Germany','Czech republic','Slovenia'];
        let combinedResorts = [];

        Object.keys(weatherData).forEach((resortName) => {
            const resortInfo = weatherData[resortName];
            const resortCountry = resortInfo.country;
            const resort_url = resortInfo.url || '#';

            if (countries.includes(resortCountry)) {
                // Extract necessary data and round snowfall to the nearest integer
                const topLiftElevation = resortInfo.elevations['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(resortInfo['7daysSnowSum']['Top Lift'] || 0);
                const midLiftSnowfall = Math.round(resortInfo['7daysSnowSum']['Mid Lift'] || 0);
                const bottomLiftSnowfall = Math.round(resortInfo['7daysSnowSum']['Bottom Lift'] || 0);

                combinedResorts.push({
                    resort: resortName,
                    country: resortCountry,
                    url: resort_url,
                    topLiftElevation,
                    midLiftElevation,
                    bottomLiftElevation,
                    topLiftSnowfall,
                    midLiftSnowfall,
                    bottomLiftSnowfall,
                });
            }
        });

        // Sort resorts by snowfall at the top lift over 7 days in descending order
        combinedResorts.sort((a, b) => b.topLiftSnowfall - a.topLiftSnowfall);

        res.render('allResortsCombined', { combinedResorts });
    } catch (error) {
        console.error('Error reading weather data:', error);
        res.status(500).json({ error: 'Failed to load resort data' });
    }
}



//get all countries combined for 14 days


exports.get14dayForecastCombined = async (req, res) => {
    try {
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));

        
        const countries = ['Austria', 'Italy','Switzerland','France','Slovakia','Germany','Czech republic','Slovenia'];
        let combinedResorts = [];

        Object.keys(weatherData).forEach((resortName) => {
            const resortInfo = weatherData[resortName];
            const resortCountry = resortInfo.country;
            const resort_url = resortInfo.url || '#';

            if (countries.includes(resortCountry)) {
                // Extract necessary data and round snowfall to the nearest integer
                const topLiftElevation = resortInfo.elevations['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(resortInfo['14daysSnowSum']['Top Lift'] || 0);
                const midLiftSnowfall = Math.round(resortInfo['14daysSnowSum']['Mid Lift'] || 0);
                const bottomLiftSnowfall = Math.round(resortInfo['14daysSnowSum']['Bottom Lift'] || 0);

                combinedResorts.push({
                    resort: resortName,
                    country: resortCountry,
                    url: resort_url,
                    topLiftElevation,
                    midLiftElevation,
                    bottomLiftElevation,
                    topLiftSnowfall,
                    midLiftSnowfall,
                    bottomLiftSnowfall,
                });
            }
        });

        // Sort resorts by snowfall at the top lift over 7 days in descending order
        combinedResorts.sort((a, b) => b.topLiftSnowfall - a.topLiftSnowfall);

        res.render('14dayForecastCombined', { combinedResorts });
    } catch (error) {
        console.error('Error reading weather data:', error);
        res.status(500).json({ error: 'Failed to load resort data' });
    }
}




exports.getPast14DaySnow = async (req, res) => {
    try {
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));

        
        const countries = ['Austria', 'Italy','Switzerland','France'];
        let combinedResorts = [];

        Object.keys(weatherData).forEach((resortName) => {
            const resortInfo = weatherData[resortName];
            const resortCountry = resortInfo.country;
            const resort_url = resortInfo.url || '#';

            if (countries.includes(resortCountry)) {
                // Extract necessary data and round snowfall to the nearest integer
                //I am going to extract url in future here 
                //url
                //url
                const topLiftElevation = resortInfo.elevations['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(resortInfo['history14daySum']['Top Lift'] || 0);
                const midLiftSnowfall = Math.round(resortInfo['history14daySum']['Mid Lift'] || 0);
                const bottomLiftSnowfall = Math.round(resortInfo['history14daySum']['Bottom Lift'] || 0);

                combinedResorts.push({
                    resort: resortName,
                    country: resortCountry,
                    url: resort_url,
                    topLiftElevation,
                    midLiftElevation,
                    bottomLiftElevation,
                    topLiftSnowfall,
                    midLiftSnowfall,
                    bottomLiftSnowfall,
                });
            }
        });

        // Sort resorts by snowfall at the top lift over 7 days in descending order
        combinedResorts.sort((a, b) => b.topLiftSnowfall - a.topLiftSnowfall);

        res.render('past14daysnow', { combinedResorts });
    } catch (error) {
        console.error('Error reading weather data:', error);
        res.status(500).json({ error: 'Failed to load resort data' });
    }
}







exports.getHistoryData = async (req, res) => {
    try {
        // Render the 'history' view with no results initially
        res.render('history', { results: null, message: null });
    } catch (error) {
        console.error('Error loading history page:', error);
        res.status(500).render('error', { error: 'Failed to load history page' });
    }

}

// Controller function to render the future short forecast page
exports.getShortForecast = (req, res) => {
    res.render('shortForecast');
};



exports.calculateHistorySnow = (req, res) => {
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;

    console.log("Received startDate:", startDate);
    console.log("Received endDate:", endDate);

    exec(`python calculateHistory.py ${startDate} ${endDate}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({message: 'Error calculating snowfall'});
        }
        
        // Parse the output from the Python script into a usable format
        const results = stdout.split('\n')
            .filter(line => line.startsWith('Location:')) // Filter only lines that start with 'Location:'
            .map(line => {
                const parts = line.split(', ');
                return {
                    location: parts[0].split(': ')[1], // Get the location name
                    avg_snowfall: parseFloat(parts[1].split(': ')[1]), // Get the average snowfall
                    total_snowfall: parseFloat(parts[2].split(': ')[1]) // Get the total snowfall
                };
            })
            .filter(stat => stat.location); // Filter out any empty results

            if (results.length > 0) {
                res.json({ results });
            } else {
                res.json({ results: [], message: 'No data found for the specified dates.' });
            }

    });

}








exports.getAllHistoryData = (req, res) => {
    res.render('allHistory');
};

exports.calculateAllHistory = (req, res) => {
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const country = req.body.country || 'all';

    console.log('Received parameters:', { startDate, endDate, country });
    console.log('Environment variables:', {
        VIRTUAL_ENV: process.env.VIRTUAL_ENV,
        PATH: process.env.PATH
    });

    // Input validation
    if (!startDate || !endDate) {
        console.log('Missing date parameters');
        return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Validate date format (MM-DD)
    const dateFormatRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    if (!dateFormatRegex.test(startDate) || !dateFormatRegex.test(endDate)) {
        console.log('Invalid date format received:', { startDate, endDate });
        return res.status(400).json({ message: 'Invalid date format. Use MM-DD format.' });
    }

    // Construct the absolute path to the Python script
    const scriptPath = path.join(__dirname, '..', 'calculateAllHistory.py');
    const csvPath = path.join(__dirname, '..', 'filtered_weather_data.csv');
    
    console.log('Executing Python script:', scriptPath);
    console.log('CSV path:', csvPath);
    console.log('Current working directory:', process.cwd());
    
    // Check if the CSV file exists
    if (!fs.existsSync(csvPath)) {
        console.error('CSV file not found at path:', csvPath);
        return res.status(500).json({ message: 'Data file not found' });
    }

    // Create a temporary directory for the virtual environment
    const tempVenvDir = path.join(os.tmpdir(), 'temp_venv_' + Date.now());
    console.log('Creating temporary virtual environment at:', tempVenvDir);

    // Create a virtual environment and install pandas
    const setupCommand = `python3 -m venv ${tempVenvDir} && 
                         ${tempVenvDir}/bin/pip install pandas && 
                         ${tempVenvDir}/bin/python "${scriptPath}" "${startDate}" "${endDate}" "${country}"`;
    
    console.log('Running setup command:', setupCommand);
    
    exec(setupCommand, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
        // Log all outputs for debugging
        console.log('Python stdout:', stdout);
        if (stderr) {
            console.error('Python stderr:', stderr);
        }
        
        // Clean up the temporary virtual environment
        try {
            exec(`rm -rf ${tempVenvDir}`);
            console.log('Cleaned up temporary virtual environment');
        } catch (cleanupError) {
            console.error('Error cleaning up virtual environment:', cleanupError);
        }
        
        if (error) {
            console.error('Python script execution error:', error);
            return res.status(500).json({ 
                message: 'Error calculating snowfall', 
                error: error.message,
                stderr: stderr
            });
        }

        try {
            // Split output into lines and process only relevant lines
            const lines = stdout.split('\n');
            const results = [];

            for (const line of lines) {
                if (!line.startsWith('Location:')) continue;
                
                // Parse the line using more robust string manipulation
                const parts = line.split(', ');
                if (parts.length >= 4) {
                    const location = parts[0].replace('Location:', '').trim();
                    const avgSnowfall = parseFloat(parts[1].replace('Avg Snowfall:', '').trim());
                    const totalSnowfall = parseFloat(parts[2].replace('Total Snowfall:', '').trim());
                    const country = parts[3].replace('Country:', '').trim();

                    if (location && !isNaN(avgSnowfall) && !isNaN(totalSnowfall)) {
                        results.push({
                            location,
                            avg_snowfall: avgSnowfall,
                            total_snowfall: totalSnowfall,
                            country
                        });
                    }
                }
            }

            if (results.length > 0) {
                res.json({ results });
            } else {
                res.json({ 
                    results: [], 
                    message: country === 'all' 
                        ? 'No data found for the specified dates.' 
                        : `No data found for ${country} in the specified dates.`
                });
            }
        } catch (parseError) {
            console.error('Error parsing output:', parseError);
            res.json({
                results: [],
                message: 'Error parsing snowfall data. Please try again.'
            });
        }
    });
};
