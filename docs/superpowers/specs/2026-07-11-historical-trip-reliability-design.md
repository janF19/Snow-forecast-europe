# Historical Trip Reliability

**Date:** 2026-07-11
**Status:** Approved design
**Depends on:** Integration baseline

## Purpose

Replace average-only snowfall rankings with an empirical, season-by-season answer to:
“Where has this calendar window historically offered the best chance of powder?”

This is historical climatology, not a forecast for a future year.

## Data provenance gate

Before public calculations change, document how `filtered_weather_data.csv` was created:

- Upstream provider and retrieval method.
- Whether values are direct observations, interpolations, model analysis, or reanalysis.
- Dataset/model version, spatial resolution, units, time zone, elevation handling, licence,
  and generation date.
- Resort-coordinate and elevation mapping.

The UI must use the confirmed term. It must not call modelled/reanalysis values “observed
snowfall.” If provenance or reuse rights cannot be established, the dataset is not eligible
for public historical claims and must be regenerated from a documented source.

## Statistical definitions

- A **powder day** has at least 10 cm of fresh snowfall in one local calendar day.
- A **window** is an inclusive recurring month/day range selected by the user.
- A **winter season** is labelled by its starting year, for example `2023–24`.
- A cross-year window such as December 20–January 5 is evaluated within one winter season.
- February 29 is omitted from non-leap seasons; expected-day counts adjust accordingly.
- A season is valid when at least 90% of expected daily records are present.
- Missing days in a valid season are excluded from sums only if the provenance audit
  confirms that missing does not mean zero. The result exposes completeness.
- Invalid seasons are excluded from numerators and denominators, never treated as zero.

For every resort/window, compute:

- Valid, excluded, and expected season counts.
- Probability of at least one powder day.
- Probability of at least two powder days.
- Median and mean window snowfall.
- 25th and 75th percentile window snowfall.
- Percentage of valid seasons with less than 10 cm total snowfall, labelled “very low
  snowfall windows.”
- Best and worst valid season with snowfall totals.
- The same success probability for the most recent ten valid seasons.
- Dataset completeness and record period.

Percentiles use one documented deterministic method across languages. Probabilities expose
both count and denominator, for example `18/30 (60%)`.

## Historical reliability

The 0–100 historical reliability value is exactly:

```text
100 × seasons with at least one 10 cm powder day / valid seasons
```

It is not a weighted composite. Full-record reliability controls the default ranking.
Recent-ten-season reliability is supporting evidence and never silently replaces it.

Sample confidence describes denominator size only:

- High: at least 25 valid seasons.
- Moderate: 15–24 valid seasons.
- Limited: fewer than 15 valid seasons.

Limited results remain visible but are excluded from the default top ranking.

## Application architecture

Implement season/window calculation behind a focused, testable boundary that returns
structured data. Do not parse human-readable Python console output in the controller.
Do not create a virtual environment or install pandas per request.

Accept validated month/day values and an optional country. Return typed/validated JSON with
statistics, season outcomes, provenance, and availability state. Cache identical queries or
precompute season records so normal requests do not repeatedly scan the complete CSV.

Resorts outside the current 103-resort historical coverage return `unavailable`; they are
not assigned zero reliability.

## Presentation

- Default order: historical reliability, then median snowfall, then resort name.
- Leading text: “Powder in 18 of 30 comparable seasons — 60% historical reliability.”
- Show median, interquartile range, two-powder-day probability, recent-ten comparison,
  elevation, record period, and confidence badge.
- Expandable evidence lists individual season totals and powder-day counts.
- Explain that climate change, complex terrain, spatial resolution, local measurement
  uncertainty, and future variability limit historical comparisons.
- Remove hard-coded monthly probability tables and “advanced machine learning” claims when
  the new dynamic result replaces them.
- Retire `ml_prediction.py` and do not add scikit-learn to runtime dependencies.

## Testing

- Same-month, multi-month, and cross-year windows.
- Leap and non-leap seasons.
- Exact 10 cm threshold and exactly one/two powder days.
- Validity at, above, and below 90% completeness.
- Missing days, invalid input, country filters, ties, and unavailable resorts.
- Deterministic quartiles and recent-ten selection.
- Hand-calculated multi-season fixtures checked independently from production code.
- Controller/API and rendered missing-data states.

## Acceptance gate

The feature is accepted when provenance is documented, all calculations pass independent
fixtures, runtime requests require no environment installation, every result exposes its
numerator/denominator and record period, and no ML or future-forecast claim remains.
