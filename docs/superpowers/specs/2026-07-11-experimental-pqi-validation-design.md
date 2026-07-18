# Experimental Powder Conditions Index Transparency and Validation

**Date:** 2026-07-11
**Status:** Approved design
**Depends on:** Integration baseline

## Purpose

Keep the existing heuristic visible as an experimental aid while making fresh snowfall the
primary signal and building evidence to decide whether the composite score should be
calibrated, simplified, or removed.

## Naming and claims

Rename the feature **Experimental Powder Conditions Index (EPCI)**. Every result carries:

> Experimental estimate based on forecast weather—not an observed measurement of snow
> quality.

Do not use “validated,” “physical snow-quality model,” or equivalent accuracy claims until
the long-term validation gate passes.

## Information hierarchy

1. Fresh snowfall is the headline and default sorting signal.
2. Temperature, rain, and wind appear separately beside the snowfall forecast.
3. EPCI is a secondary badge and interpretation.
4. An expanded explanation shows the formula version, inputs, per-factor effect, elevation,
   provider/model, forecast issue time, target date, and lead time.

Missing temperature, rain, or wind produces an unavailable or explicitly degraded score.
It must not be replaced silently with a neutral or favourable value. Rain and severe wind
remain visible even when the composite score is high.

## Formula governance

- Freeze the existing formula as `EPCI v1` before calibration.
- Store formula version with every snapshot and displayed score.
- Never rewrite historical scores under a changed formula.
- Every revision receives a new version, changelog, rationale, and reproducible evaluation.
- Formula coefficients remain heuristic until independent evaluation supports them.

## Track A: forecast-input validation

Persist immutable forecast snapshots containing:

- Resort identifier, coordinates, forecast elevation, and lift label.
- Provider, weather model when known, request/issue time, target time, and lead hours.
- Snowfall, temperature, rain, wind, raw units, EPCI version, and computed score.
- Retrieval success, missing variables, and source-data metadata.

Compare 1–7-day forecasts with independent official measurements where access and reuse
terms permit. Candidate pilots are:

- Swiss SLF manual snow fields and automated IMIS stations. Manual boards measure 24-hour
  new snow; automated new snow is modelled by SNOWPACK and must be labelled accordingly.
  See <https://www.slf.ch/en/avalanche-bulletin-and-snow-situation/measured-values/information-about-snow-measurement/>.
- GeoSphere Austria Data Hub: <https://data.hub.geosphere.at/en/dataset/>.
- Météo-France public observation API:
  <https://www.data.gouv.fr/dataservices/api-donnees-dobservation>.
- DWD daily snow observations:
  <https://www.dwd.de/EN/ourservices/rcccm/int/snow/snowclim_daily.html>.
- Stable, licensed regional Italian snow networks after a source feasibility review.

Station matching records horizontal distance, elevation difference, station type, exposure
metadata, temporal aggregation, and quality flags. A station with unsuitable elevation or
exposure is rejected rather than treated as resort truth.

Report by lead time, country/region, elevation band, and precipitation event:

- Snowfall mean absolute error and bias.
- Temperature mean absolute error and bias.
- Rain occurrence precision/recall or equivalent contingency metrics.
- Wind mean absolute error and high-wind event detection.
- Coverage, rejected matches, and measurement quality flags.

Open-Meteo archived previous runs may reconstruct lead-time forecasts, but model history is
not independent ground truth. See <https://open-meteo.com/en/docs/historical-forecast-api>.

## Track B: composite-score validation

Weather stations do not directly measure subjective ski quality. Establish independent
event labels from the strongest available combination of:

- Manual new-snow depth.
- Snow-water equivalent or measured/derived new-snow density.
- Official wet/dry snow or snowpack indicators.
- Structured condition reports containing timestamp, coordinates/resort, elevation, recent
  snow, rain/crust/wind effects, and a fixed rating scale.

Unstructured social posts, resort marketing reports, and the EPCI inputs themselves cannot
serve as sole ground truth.

Evaluate `EPCI v1` against:

1. Fresh snowfall alone.
2. Fresh snowfall with a simple freezing/rain exclusion rule.

Use time-separated calibration and evaluation seasons. Never use a random row split across
the same storms. Report uncertainty, regional coverage, and failure cases. EPCI is useful
only if it improves held-out ranking or classification over both transparent baselines.

## Decision policy

- Continue showing EPCI as experimental while evidence accumulates and data quality is
  disclosed.
- Do not promote it from experimental with fewer than two winter seasons of independent
  evaluation.
- If it fails to beat the baselines, simplify or remove the score while retaining snowfall,
  temperature, rain, and wind components.
- If evidence supports revision, release a newly versioned formula and retain the published
  evaluation report.

## Testing and operations

- Unit tests freeze `EPCI v1`, factor effects, bounds, missing inputs, and version output.
- Snapshot tests cover issue/target/lead-time semantics and duplicate-safe persistence.
- Station matching tests cover distance, elevation, time aggregation, rejection, and quality
  flags.
- Evaluation code runs reproducibly from pinned snapshots and observation datasets.
- Data-source failure never blocks the live forecast; it delays validation ingestion and is
  reported operationally.

## Acceptance gates

### Initial delivery gate

The initial feature is accepted when snowfall is visually primary, EPCI is renamed and
warned, all inputs and formula version are inspectable, missing inputs are honest, forecast
snapshots begin accumulating, and an observation-source feasibility report selects at least
one lawful pilot network. This gate does not declare the score validated.

### Long-term validation gate

After at least two winter seasons, publish a held-out comparison with both baselines and an
explicit keep/revise/remove decision. Until that gate passes, the experimental label remains.
