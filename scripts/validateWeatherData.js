#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateWeatherData } = require('../utils/weatherArtifact');

const root = path.join(__dirname, '..');
const weatherPath = process.argv[2] || path.join(root, 'weather_dataFull_7.json');
const resortPath = process.argv[3] || path.join(root, 'resorts_for_forecast.json');
const weather = JSON.parse(fs.readFileSync(weatherPath, 'utf8'));
const resorts = JSON.parse(fs.readFileSync(resortPath, 'utf8'));
const summary = validateWeatherData(weather, resorts, { expectedCount: 294 });
process.stdout.write(`${JSON.stringify(summary)}\n`);
