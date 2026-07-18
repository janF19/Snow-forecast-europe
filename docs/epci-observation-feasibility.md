# EPCI Observation-Source Feasibility Report

## Purpose

Before any part of the Experimental Powder Conditions Index (EPCI) pipeline compares forecast inputs
against real outcomes, we need a lawful, well-documented source of official
weather and snow observations to check them against. This report surveys the
candidate official observation networks that cover Alpine terrain, records
their current primary-source references and reuse terms, and selects at least
one pilot network to begin validation ingestion against. It is a feasibility
and source-selection document only — it does not implement any ingestion code.

## Candidates table

| Network | Primary source | Data / parameters | Reuse terms | Access |
| --- | --- | --- | --- | --- |
| **GeoSphere Austria Data Hub** | `https://data.hub.geosphere.at/en/dataset/`, API docs `https://dataset.api.hub.geosphere.at/v1/docs/` | `Stationsdaten-v2 (10 min)` — precipitation, temperature, wind, and snow; `SNOWGRID-Klima v2.1` — snow depth and snow-water-equivalent | CC BY 4.0 / CC BY-SA 4.0 / CC0 (licence documented per dataset on the hub) | Automated API access |
| **Météo-France public observation API** | `https://portail-api.meteofrance.fr/web/fr/api/DonneesPubliquesObservation` | 6-min/hourly/daily station observations | Etalab Open Licence 2.0 | "Ouvert avec compte" — free account required; rate limit 50 req/min |
| **DWD Open Data / CDC** | `https://opendata.dwd.de/climate_environment/CDC/` | Daily KL station data (36 parameters including snow depth) | GeoZG / open reuse | Anonymous access |
| **Swiss SLF** | `https://www.slf.ch/en/avalanche-bulletin-and-snow-situation/measured-values/information-about-snow-measurement/` | Manual boards measure 24-hour new snow; automated (IMIS) new snow is **modelled by SNOWPACK**, not measured, and must be labelled as modelled | Reuse terms not yet confirmed — must be confirmed before ingestion | Manual boards + automated IMIS network |
| **Italian regional networks** | (per-region) | Deferred | Deferred pending a per-region licence review | Deferred — named as future work, not selected |

## Selected pilot

**GeoSphere Austria Data Hub** is the selected pilot: `Stationsdaten-v2` for
temperature, wind, and precipitation, and `SNOWGRID-Klima` for snow depth and
snow-water-equivalent (SWE). It is chosen for its documented CC BY 4.0 reuse
licence, its automated API access, and its overlap with the resort footprint.

**Météo-France** is listed as the second pilot, pending account provisioning
for its "Ouvert avec compte" access tier.

Italian regional networks and the Swiss SLF network are not selected as pilots
at this stage: Italian regional networks are deferred pending a per-region
licence review, and SLF's reuse terms must be confirmed before any ingestion
is attempted from that source.

## Explicit caveats

- Weather stations do not measure subjective ski quality. Station observations
  (temperature, wind, precipitation, snow depth, SWE) are physical
  measurements of the atmosphere and snowpack at a point location — they are
  not a measure of the day's actual skiing conditions.
- Automated new-snow figures from the SLF/IMIS network are **modelled by
  SNOWPACK**, not measured. Only the SLF manual boards produce a directly
  measured 24-hour new-snow value; the automated IMIS new-snow figures are a
  model output and must be labelled as modelled wherever they are surfaced or
  compared.
- SWE-derived new-snow density (e.g. from GeoSphere's `SNOWGRID-Klima`) is
  modelled/derived, not a direct field measurement, and must be treated
  accordingly in any comparison.
- Station matching will record the following metadata for every candidate
  station before it is used in validation: horizontal **distance** from the
  resort, **elevation** difference from the resort, station type, **exposure**
  metadata (aspect/terrain exposure), temporal aggregation of the observation,
  and **quality** flags reported by the source network. Stations with
  unsuitable elevation or exposure relative to the resort will be rejected
  outright rather than treated as resort truth.

## Operational note

Observation ingestion is a validation-only concern. If ingestion from any of
the above networks fails or is delayed, it never blocks the live forecast
delivered to users — it only delays validation ingestion, and the delay is
reported operationally (e.g. via logs/alerts to the team) rather than
surfaced to end users or allowed to affect forecast availability.
