# Browser QA remediation

**Date:** 2026-07-14
**Status:** Design approved; written-specification review pending
**Depends on:** Repository/build stabilization and EPCI operations merged into local
`main`

## Goal

Resolve the four findings in the 2026-07-14 dogfood report with measurable server-render,
responsive-layout, and accessibility contracts while preserving all approved decision,
terrain, historical, and EPCI semantics.

Source report:
`C:/Users/falle/.codex/visualizations/2026/07/14/019f60b1-d9f1-76f2-96ed-c0153aeaf69a/dogfood-output/report.md`

## Finding-to-change map

| Finding | Required change |
|---|---|
| Mobile decision caption collapses | Full-width explanatory paragraph associated with the table |
| Freeride metrics clip/overflow | Wrapping desktop cells and a no-scroll mobile card presentation |
| Decision page renders all evidence | Fixed 50-row server pagination after filtering/sorting |
| Date inputs lack accessible purpose | Explicit visible labels, IDs, descriptions, and invalid state |

## Decision pagination contract

`/decision` uses a fixed `PAGE_SIZE = 50`. Pagination is presentation-only and is applied
after the complete joined dataset has passed the existing mode guard, filters, exclusion
accounting, and deterministic sort.

The controller/view model exposes:

```text
pagination.page
pagination.pageSize
pagination.totalRows
pagination.totalPages
pagination.firstVisible
pagination.lastVisible
pagination.hasPrevious
pagination.hasNext
```

`model.rows` passed to the template contains current-page rows only. Full-dataset totals,
warnings, exclusions, and exclusion reasons remain unchanged.

Behavior is fixed:

- Missing, non-numeric, zero, or negative `page` resolves to page 1.
- A page beyond the final page resolves to the final page.
- Empty results render no pagination navigation.
- Rank is global: page 2 starts at 51, not 1.
- Filter/date/mode/sort form submissions reset to page 1 by omitting stale page state.
- Pagination links preserve all recognized query parameters and replace only `page`.
- Unknown query parameters are not reflected into links.
- There is no `show all` mode and no user-controlled page-size parameter.

Navigation uses `<nav aria-label="Decision result pages">` with accessible Previous,
Next, and numbered links. The current page uses `aria-current="page"`.

For the current unfiltered 299-row decision dataset, page 1 renders exactly 50 result rows
and 50 evidence regions, reports `Showing 1-50 of 299`, and contains no markup for the
other 249 evidence regions. The result adapts if the canonical dataset count changes.

## Decision caption contract

The long comparison explanation moves from the table `<caption>` into a full-width
paragraph immediately before the table. It receives a stable ID, and the table references
that ID with `aria-describedby`.

At 390 pixels:

- the paragraph spans the decision container width;
- text wraps by normal words rather than becoming a one-word column;
- it does not push the first result down through excessive narrow-line wrapping;
- the semantic explanation remains exposed to assistive technology.

## Freeride responsive contract

Desktop retains one semantic table. Metric cells:

- use normal white-space and safe word wrapping;
- receive enough width for vertical, mapped length, and route count;
- never clip under the container at 1440x1000.

At the mobile breakpoint, each body row is visually presented as a full-width card while
retaining understandable row/cell relationships. Each value has a visible field label.
The order is:

1. resort and country;
2. mapped-routes score;
3. source/confidence state;
4. vertical;
5. mapped length;
6. route count;
7. freshness and limitations.

All evidence is visible at 390x844 without horizontal scrolling. Long resort names,
metric values, and unavailable reasons wrap rather than overlap.

## Date-input accessibility contract

Every date input has a unique `id` and visible `<label for>` relationship:

- `/decision`: `Start date`, `End date`;
- `/allHistory`: `From date`, `Until date`.

Format/help text has an ID connected through `aria-describedby`. Server-rendered invalid
values use `aria-invalid="true"` and connect to the applicable error message. Accessible
names must contain the full field purpose, not only locale-generated day/month/year names.

## Performance contract

Using the current full default dataset:

- initial `/decision?mode=go-soon` HTML is at most 250 KB before external assets;
- no more than 50 result rows and 50 evidence regions are present;
- pagination requires no client-side JavaScript;
- the existing evidence-expansion behavior may remain progressively enhanced, but
  off-page evidence is never emitted;
- deterministic result order and evidence content are identical to the corresponding
  slice of the pre-pagination full result.

## Automated test contract

Tests cover:

1. Default, invalid, negative, middle, and beyond-final page handling.
2. Global ranks across pages and no duplicate/missing resort at a page boundary.
3. Pagination after filtering and deterministic sorting.
4. Preserved recognized mode/date/filter/sort query parameters.
5. Reset to page 1 after a form change.
6. Correct total/exclusion counts from the full result.
7. Exactly 50 result/evidence regions on the full first page.
8. Rendered HTML at or below the 250 KB budget using the production-shaped dataset.
9. Decision paragraph/table association.
10. Accessible date names and invalid descriptions on both routes.
11. Required freeride metrics, source, freshness, beta limitation, and no-data states.
12. No combined score, no EPCI label regression, and no future forecast leakage.

## Browser verification matrix

Run the application with production-shaped local data and verify at both 390x844 and
1440x1000:

| Route | Required states |
|---|---|
| `/` | default roadmap evidence and navigation |
| `/decision` | Go soon page 1/page 2, filtered result, Plan future dates |
| `/freeride` | ranked and unavailable rows |
| `/allHistory` | initial form, valid result, invalid date state |
| `/powder-quality` | normal and degraded/unavailable EPCI evidence |

At each required state verify:

- no document-level horizontal overflow;
- no clipped or overlapping required content;
- readable keyboard focus and logical tab order;
- correct accessible names, roles, expanded states, and current-page state;
- no browser-console errors;
- no failed same-origin requests or assets.

Retain before/after screenshots for the four findings and a compact browser QA report.

## Local acceptance criteria

1. Every finding has a failing regression test before its implementation change.
2. Server pagination satisfies the exact 50-row contract without changing full-result
   calculations.
3. Decision caption is full width and semantically associated at both viewport sizes.
4. Freeride evidence is fully readable without horizontal scrolling at both sizes.
5. Date inputs expose the approved accessible names and error relationships.
6. The HTML budget and row/evidence-region limits pass on production-shaped data.
7. All routes in the browser matrix pass with screenshots and no console/network errors.
8. `npm test` and the complete project verification remain green.

## Product non-regression constraints

- Fresh snowfall remains the primary Go-soon ranking and visual element.
- Plan-future mode uses historical and terrain evidence only.
- No combined score is added or implied.
- Filtering, sorting, ties, exclusion counts, and horizon guards retain their approved
  semantics.
- EPCI remains experimental and degraded/unavailable behavior remains honest.
- Historical numerator/denominator, terrain source, freshness, methodology, beta label,
  limitations, and safety copy remain present.
- One unavailable evidence provider does not remove a resort unless the user selected a
  filter that explicitly requires that evidence.

## Explicitly out of scope

- A visual redesign, new design system, client-side application framework, or infinite
  scrolling.
- A `show all` response or user-selectable page size.
- Scoring, data-pipeline, identity, matching, or recommendation changes.
- New product modes or filters.
- Push or deployment without explicit authorization.
