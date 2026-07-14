# European Powder Forecast

## About
A comprehensive web platform for tracking and predicting powder conditions across European ski resorts, with a special focus on the Alps. The site combines real-time forecasts with historical analysis to help skiers find the best powder opportunities.

Visit the live platform: [powderforecasteurope.onrender.com](https://powderforecasteurope.onrender.com/)

**Project Inspiration**: This project was inspired by [wepowder.com](https://wepowder.com/en/forecast#snow-cumulative:168). However, after noticing potential snowfall data inflation issues (possibly due to different weather models), I decided to create a more accurate alternative.

## Platform Overview

![Main Dashboard](docs/Main.png)
*Main dashboard showing resort overview and current conditions*

![Forecast View](docs/forecast.png)
*Detailed 7-day powder forecast visualization*

![Historical Analysis](docs/history.png)
*Historical snow data and powder probability analysis*

## Features

- **Snowfall Forecasts**
  - 7-day forecasts for all monitored resorts
  - 14-day extended forecasts
  - 3-day detailed predictions
  - Country-specific forecasting views

- **Historical Analysis**
  - 30-season historical trip reliability, computed per resort for any chosen date window
  - Powder day probability calculations (10cm+ fresh modelled snow)
  - Season-by-season evidence with confidence badges (High/Moderate/Limited by sample size)
  - Recent 14-day snowfall tracking

- **Experimental Powder Conditions Index (EPCI)**
  - Snowfall-first: resorts are ranked by best fresh-snow day, with EPCI shown as a secondary, experimental badge
  - Every result carries an explicit disclaimer: *"Experimental estimate based on forecast weather—not an observed measurement of snow quality."*
  - Current formula version `epci/v1`; the version, every input factor, and per-factor breakdown are inspectable in the expanded view
  - Temperature, rain, and wind are always shown as their own separate figures, never folded invisibly into the index
  - Missing forecast inputs are shown as degraded/unavailable, never silently treated as favourable
  - Long-term accuracy validation is planned but not yet underway: the immutable forecast-snapshot infrastructure is built and tested but not yet wired to run on a schedule, so no snapshot history has begun accumulating; once it is, snapshots will be compared against observed conditions and transparent baselines across at least two winter seasons before any accuracy claim is made — see `docs/epci-acceptance-gates.md`

- **Navigation Structure**
  - Home (Overview and top rankings)
  - Week Ahead Forecast
  - Forecast by Country
  - 2-Week Forecast
  - Recent Snowfall
  - Historical Data
  - Powder Quality (EPCI, experimental)

## Compare resorts (combined decision view)

`/decision` compares resorts without blending evidence into a single score.

- **Go soon** ranks resorts by accumulated fresh snowfall over a date range inside the
  7-day forecast horizon. Temperature, rain, wind, terrain, and historical reliability are
  shown as separate columns. The EPCI badge is a secondary, experimental interpretation.
- **Plan future dates** ranks by historical reliability for a recurring calendar window and
  shows no forecast or EPCI. Historical reliability is not a forecast for the selected year.

Missing evidence is always shown as `unavailable` (never zero). Filters that remove resorts
report an exclusion count. Terrain ranking is not avalanche guidance.

## Key Insights

### Historical Trip Reliability
The Historical Data page answers "how often has powder actually shown up here in this date window?" using empirical season-by-season evidence rather than a single average or forecast:

- **Reliability** = the share of comparably complete historical seasons with at least one powder day in the chosen window (e.g. "18 of 30 seasons — 60%")
- **Confidence badges** (High ≥25 seasons, Moderate 15–24, Limited <15) flag how much historical sample backs each result
- Every number exposes its count and denominator, plus median/IQR snowfall and a recent-10-season check, so nothing is presented as a bare percentage

## Methodology

The historical reliability analysis is based on:
- Definition of a powder day: 10cm+ fresh modelled snow in one local day
- Up to 30 seasons of modelled historical snowfall (Open-Meteo reanalysis, see `docs/historical-provenance.md`)
- Seasons below 90% data completeness for the chosen window are excluded, never counted as zero
- Inspired by [Best Snow](https://bestsnow.net/pwdrpct.htm) methodology

## Technical Implementation

The website is built with:
- Node.js/Express backend
- EJS templating
- Python for data analysis
- Responsive design with mobile-friendly navigation
- Interactive data tables and visualizations

## Future Development

Areas for potential enhancement:
- Additional historical data analysis features
- Enhanced visualization tools
- Real-time condition updates
- Caching and optimization of memory

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
