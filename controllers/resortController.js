const { error } = require('console');
const fs = require('fs');
const path = require('path');
const { stdout, stderr } = require('process');
const { exec } = require('child_process');
const { rankedTerrain, loadFreerideTerrain } = require('../utils/freerideScore');
const { buildResortEPCI, epciBand, EPCI_VERSION } = require('../utils/epci');
const { forecastDayLabel, offsetForDate } = require('../utils/forecastDate');
const { buildHistoricalReliability } = require('../utils/historicalReliability');
const { buildGoSoon, buildPlanFuture, SORTS } = require('../utils/combinedDecision');



const allResortsForecastPath = process.env.WEATHER_DATA_PATH ||
    path.join(__dirname, '../weather_dataFull_7.json');

const historyRecordsPath = process.env.HISTORY_RECORDS_PATH ||
    path.join(__dirname, '..', 'history_season_records.json');

let historyRecordsCache = null;
function loadHistoryRecords() {
    if (historyRecordsCache) return historyRecordsCache;
    const raw = fs.readFileSync(historyRecordsPath, 'utf-8');
    historyRecordsCache = JSON.parse(raw);
    return historyRecordsCache;
}

// terrain records loaded once; mirrors loadHistoryRecords caching. Reuses
// loadFreerideTerrain (utils/freerideScore.js) instead of re-parsing the file,
// since that function already strips _metadata and shapes { _metadata, resorts }.
const freerideTerrainPath = process.env.FREERIDE_TERRAIN_PATH ||
    path.join(__dirname, '..', 'freeride_terrain.json');
let terrainCache = null;
function loadTerrain() {
    if (terrainCache) return terrainCache;
    terrainCache = loadFreerideTerrain(freerideTerrainPath);
    return terrainCache;
}

function parseWindowParam(windowStr) {
    const m = /^(\d{2}-\d{2})\.\.(\d{2}-\d{2})$/.exec(String(windowStr || ''));
    return m ? { startMMDD: m[1], endMMDD: m[2] } : { startMMDD: '02-01', endMMDD: '02-05' };
}

function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function collectFilters(q) {
    const filters = {};
    if (q.country) filters.country = q.country;
    if (q.minSnow) filters.minSnow = Number(q.minSnow);
    if (q.minTerrain) filters.minTerrain = Number(q.minTerrain);
    if (q.terrainSource) filters.terrainSource = q.terrainSource;
    if (q.minConfidence) filters.minConfidence = q.minConfidence;
    return filters;
}

exports.getDecisionView = (req, res) => {
    try {
        const q = req.query || {};
        const mode = q.mode === 'plan-future' ? 'plan-future' : 'go-soon';
        const now = q.today ? new Date(`${q.today}T12:00:00`) : new Date();
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
        const terrainData = loadTerrain();
        const historyRecords = loadHistoryRecords();
        const filters = collectFilters(q);
        const weatherFreshness = (() => { try { return fs.statSync(allResortsForecastPath).mtime.toISOString(); } catch { return null; } })();

        let model;
        let startParam = null;
        let endParam = null;
        if (mode === 'plan-future') {
            model = buildPlanFuture({ terrainData, historyRecords, window: parseWindowParam(q.window), now,
                sort: q.sort || 'reliability', filters });
        } else {
            let startOffset = q.start ? offsetForDate(q.start, now) : 0;
            let endOffset = q.end ? offsetForDate(q.end, now) : startOffset;
            // Guard against an inverted range (start after end): swapping keeps the
            // selected two dates but always iterates them in chronological order,
            // instead of silently producing a zero-iteration range that reports
            // accumulatedSnowCm: 0 for every resort.
            if (startOffset > endOffset) {
                const tmp = startOffset; startOffset = endOffset; endOffset = tmp;
            }
            model = buildGoSoon({ weatherData, terrainData, historyRecords, startOffset, endOffset, now,
                sort: q.sort || 'snowfall', filters, weatherFreshness });
            // Derive the redisplayed form dates from the POST-swap offsets (not the raw
            // q.start/q.end), so an inverted range the guard corrected above doesn't get
            // echoed back to the user unchanged. Mirrors the local-day arithmetic in
            // utils/forecastDate.js's windowFromOffsets/offsetForDate.
            startParam = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + startOffset));
            endParam = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + endOffset));
        }
        res.render('combinedDecision', { model, mode, sortOptions: SORTS[mode], startParam, endParam });
    } catch (error) {
        console.error('Error building decision view:', error);
        res.status(500).render('error', { error: 'Failed to load decision view' });
    }
};

const getLiftElevation = (resortData, liftName) => {
    return resortData?.elevations?.[liftName]?.elevation_m ?? 0;
};

const getLiftSnowSum = (resortData, sumName, liftName) => {
    return resortData?.[sumName]?.[liftName] ?? 0;
};

const FORECAST_START = 14;
const seriesSnow = (rd, lift, i) =>
    Math.round(Number(rd?.elevations?.[lift]?.snowfall_sum?.[FORECAST_START + i]) || 0);
const seriesVar = (rd, lift, key, i) => {
    const v = Number(rd?.elevations?.[lift]?.[key]?.[FORECAST_START + i]);
    return Number.isFinite(v) ? Math.round(v) : null;
};

exports.getFreerideTerrain = (req, res) => {
    try {
        res.render('freerideLeaderboard', rankedTerrain());
    } catch (error) {
        console.error('Error reading freeride terrain:', error);
        res.status(500).render('error', { error: 'Failed to load freeride terrain' });
    }
};


// Controller function to get snowfall data from JSON
exports.getSnowfallForResorts = async (req, res) => {
    try {
        // Read and parse the weather data JSON file
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
        
        // Transform the data structure and extract top lift information
        const snowfallData = Object.entries(weatherData).reduce((resorts, [resortName, resortData]) => {
            if (!resortData?.elevations?.['Top Lift']) {
                console.warn(`Skipping resort with missing top lift data: ${resortName}`);
                return resorts;
            }

            resorts.push({
                resort: resortName,
                country: resortData.country,
                url: resortData.url || '', // Provide a default empty string if url is undefined
                elevation: getLiftElevation(resortData, 'Top Lift'),
                history14daySum: getLiftSnowSum(resortData, 'history14daySum', 'Top Lift'),
                threeDaySnowSum: getLiftSnowSum(resortData, '3daysSnowSum', 'Top Lift'),
                sevenDaySnowSum: getLiftSnowSum(resortData, '7daysSnowSum', 'Top Lift'),
                twoWeeksSnowSum: getLiftSnowSum(resortData, '14daysSnowSum', 'Top Lift')
            });

            return resorts;
        }, []);

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

        const now = new Date();
        const topPowder = Object.entries(weatherData)
            .map(([resortName, resortData]) => {
                const epci = buildResortEPCI(resortData);
                const top = epci.perElevation['Top Lift'];
                const bestSnowDayResult = top ? top.daily[epci.bestSnowDay.offset] : null;
                return {
                    resort: resortName, country: resortData.country,
                    bestSnow: Math.round(epci.bestSnowDay.snow),
                    peakDayLabel: forecastDayLabel(epci.bestSnowDay.offset, now),
                    peakScore: Math.round((bestSnowDayResult && bestSnowDayResult.score) || 0),
                    band: epciBand(bestSnowDayResult),
                    status: bestSnowDayResult ? bestSnowDayResult.status : 'unavailable',
                };
            })
            .filter((r) => r.bestSnow > 0 || r.status === 'unavailable')
            .sort((a, b) => b.bestSnow - a.bestSnow)
            .slice(0, 5);

        // Log the sorted data to verify URLs are present
        //console.log('Sorted 7 Days Data:', sortedByUpcoming7Days);
        //console.log('Sorted 14 Days Data:', sortedByLast14Days);

        //console.log('Sample URL:', snowfallData[0].url);

        res.render('index', {
            sortedByUpcoming7Days,
            sortedByLast14Days,
            freerideTop5: rankedTerrain().ranked.filter(item => item.source === 'measured').slice(0, 5),
            topPowder,
            epciVersion: EPCI_VERSION,
            epciDisclaimer: EPCI_DISCLAIMER
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
                    topLiftSevenDaySnowSum: getLiftSnowSum(resortInfo, '7daysSnowSum', 'Top Lift'),
                    topLiftElevation: getLiftElevation(resortInfo, 'Top Lift')
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
                const topLiftElevation = resortInfo.elevations?.['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations?.['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations?.['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '7daysSnowSum', 'Top Lift'));
                const midLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '7daysSnowSum', 'Mid Lift'));
                const bottomLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '7daysSnowSum', 'Bottom Lift'));

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
                const topLiftElevation = resortInfo.elevations?.['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations?.['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations?.['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '14daysSnowSum', 'Top Lift'));
                const midLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '14daysSnowSum', 'Mid Lift'));
                const bottomLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, '14daysSnowSum', 'Bottom Lift'));

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
                const topLiftElevation = resortInfo.elevations?.['Top Lift']?.elevation_m || '-';
                const midLiftElevation = resortInfo.elevations?.['Mid Lift']?.elevation_m || '-';
                const bottomLiftElevation = resortInfo.elevations?.['Bottom Lift']?.elevation_m || '-';

                const topLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, 'history14daySum', 'Top Lift'));
                const midLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, 'history14daySum', 'Mid Lift'));
                const bottomLiftSnowfall = Math.round(getLiftSnowSum(resortInfo, 'history14daySum', 'Bottom Lift'));

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

const EPCI_DISCLAIMER =
    'Experimental estimate based on forecast weather—not an observed measurement of snow quality.';

exports.getPowderQuality = async (req, res) => {
    try {
        const weatherData = JSON.parse(fs.readFileSync(allResortsForecastPath, 'utf-8'));
        const now = new Date();
        const dayLabels = Array.from({ length: 7 }, (_, i) => forecastDayLabel(i, now));

        const resorts = Object.entries(weatherData)
            .map(([resortName, resortData]) => {
                const epci = buildResortEPCI(resortData);
                const top = epci.perElevation['Top Lift'];
                const elevations = {};
                ['Top Lift', 'Mid Lift', 'Bottom Lift'].forEach((lift) => {
                    const series = epci.perElevation[lift];
                    elevations[lift] = series ? series.daily.map((d, i) => ({
                        score: d.score === null ? null : Math.round(d.score),
                        band: epciBand(d), status: d.status,
                        snow: seriesSnow(resortData, lift, i),
                        tmax: seriesVar(resortData, lift, 'temperature_2m_max', i),
                        rain: seriesVar(resortData, lift, 'rain_sum', i),
                        wind: seriesVar(resortData, lift, 'wind_speed_10m_max', i),
                    })) : null;
                });
                const bestSnowDayResult = top ? top.daily[epci.bestSnowDay.offset] : null;
                const status = bestSnowDayResult ? bestSnowDayResult.status : 'unavailable';
                return {
                    resort: resortName, country: resortData.country, url: resortData.url || '#',
                    bestSnow: Math.round(epci.bestSnowDay.snow),
                    bestSnowLabel: forecastDayLabel(epci.bestSnowDay.offset, now),
                    peakScore: Math.round((bestSnowDayResult && bestSnowDayResult.score) || 0),
                    band: epciBand(bestSnowDayResult), status,
                    degradedDays: epci.degradedDays, unavailableDays: epci.unavailableDays,
                    elevations,
                };
            })
            .filter((r) => r.bestSnow > 0 || r.status === 'unavailable')
            .sort((a, b) => b.bestSnow - a.bestSnow);

        res.render('epci', { resorts, dayLabels, epciVersion: EPCI_VERSION, disclaimer: EPCI_DISCLAIMER });
    } catch (error) {
        console.error('Error computing EPCI:', error);
        res.status(500).render('error', { error: 'Failed to load EPCI data' });
    }
};

exports.calculateAllHistory = (req, res) => {
    const dateFormatRegex = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const country = req.body.country || 'all';

    if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start date and end date are required' });
    }
    if (!dateFormatRegex.test(startDate) || !dateFormatRegex.test(endDate)) {
        return res.status(400).json({ message: 'Invalid date format. Use MM-DD format.' });
    }

    try {
        const records = loadHistoryRecords();
        const result = buildHistoricalReliability(records, {
            startMMDD: startDate, endMMDD: endDate, country,
        });
        return res.json(result);
    } catch (error) {
        console.error('Error computing historical reliability:', error);
        return res.status(500).json({ message: 'Error computing historical reliability' });
    }
};
