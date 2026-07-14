# Browser remediation verification - 2026-07-14

## Build under test

`0e5b084b519068f06618d974d1f9c599d7072f92` at `http://127.0.0.1:3199`, tested at 390x844 and 1440x1000.

## Automated evidence

`npm ci`, `npm run build`, and `npm test` exited 0. The complete suite reported 163 JavaScript tests and 75 Python tests. Production-shaped `/decision?mode=go-soon` HTML was 147,504 bytes with 50 result rows and 50 evidence-detail regions.

## Finding results

| Finding | Mobile | Desktop | Evidence |
| --- | --- | --- | --- |
| Decision explanation / pagination | overflow -15 px; caption 303 px and container 303 px; 50 rows/details | overflow -15 px; caption 1136 px and container 1136 px; 50 rows/details | `decision-mobile-after.png`, `decision-desktop-after.png` |
| Freeride metric visibility | overflow -15 px; container [36,339] and first metrics box [57,143] | overflow -15 px; container [144.5,1280.5] and first metrics box [1078.6,1366.6] | `freeride-mobile-after.png`, `freeride-desktop-after.png` |
| Decision date names / error | Start date and End date; invalid query returned `aria-invalid=true` and `Enter a valid start date.` | Start date and End date | `date-inputs-after.png` |
| History date names / error | From date and Until date; empty native submit set both `aria-invalid=true` and showed linked error text | From date and Until date | `history-date-inputs-after.png` |

Decision page 2 had global first rank 51 with 50 rows and no overflow. The country-filter query yielded 44 matching rows; Plan-future exposed no forecast column. Keyboard Tab navigation reached the decision date controls; pagination was inspected with its accessible `Decision result pages` navigation and current-page state.

## Route smoke

At both required viewports, `/`, `/decision` (Go-soon page 1/page 2, country filter, Plan-future, invalid date), `/freeride`, `/allHistory` (valid and empty/invalid states), and `/powder-quality` rendered without console errors or failed same-origin requests. Direct resource inspection on `/` and `/powder-quality` found 0 failed same-origin requests.

## Remaining limitations

EPCI remains experimental, mapped terrain remains beta/non-safety guidance, historical evidence remains modelled, and pagination does not alter full-result filtering or ranking.
