# Provenance: filtered_weather_data.csv

**Confirmed UI term:** "modelled snowfall" (never "observed snowfall").

- **Upstream provider / retrieval:** Open-Meteo historical API, fetched via
  `getForecastFull_all_resorts.py` using `openmeteo-requests`.
- **Value type:** modelled / reanalysis daily `snowfall_sum`, not direct station
  observations or interpolated gauge data.
- **Columns:** `date` (timestamp), `snowfall_sum` (cm), `country`, `resort`,
  `elevation` (single metres value per resort).
- **Coverage:** 103 resorts across Austria, France, Germany, Italy, Slovenia,
  Switzerland; seasons 1994-95 through 2023-24 (record period 1994-12-01 to
  2024-04-29).
- **Time zone / calendar day:** each row's `date` is a per-resort local day; the
  batch keys days by MM-DD after truncating the timestamp to its date. Timestamps
  show 22:00:00 UTC offset, representing Europe/Berlin timezone processing.
- **Elevation handling:** one representative elevation per resort; no per-lift or
  per-pixel elevation.
- **Licence / reuse:** Open-Meteo non-commercial/attribution terms (confirm the
  exact tier before any commercial claim).
- **Missing-means-zero decision:** modelled series are dense; a missing day is
  treated as *absent* (excluded from completeness), and completeness is reported.
  Sums never silently backfill missing days with zero.

**Provenance gate:** the dataset is eligible for public historical claims because
its provider, value type, and record period are documented above. UI copy must
call it "modelled snowfall" and must not imply station observation.
