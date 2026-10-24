# QALQAN verification

This record separates automated checks from browser observations. QALQAN is an independent local demonstration, not a validated fraud detector or a connected banking control.

## Banking-specific redesign — 24 October 2026

The former shared editorial template was replaced by a light white/emerald ledger workspace, serif headings, unnumbered navigation and a primary transfer table beside a contained relationship scene. The map is now a city directory with its own layout and an Astana initial view. The Three.js scene uses emerald, ivory and champagne colors.

The final redesign passed all 24 tests and the standard production build. Root inspected the actual interface at approximately 860 and 1270 pixels wide through CUA. Selecting Almaty changed the map and provider URLs to 43.252, 76.911. Selecting AC-007 narrowed the ledger to 7 transfers and highlighted the account; timeline 720 showed 42 transfers and spatial separation reached 80%. The wide transfer screen displayed the ledger and real Three.js scene side by side. Evidence: `artifacts/qalqan-ledger-overview.png` and `artifacts/qalqan-banking-map.png`.

Earlier observations below remain historical feature checks; they do not imply that every workflow was repeated after this visual redesign.

## Automated checks

Run from `banking/`:

```powershell
npm test
```

After the Geography integration and final source formatting, `npm test` passed on 23 October 2026: **24 tests passed, 0 failed**. These comprise 13 domain tests and 11 independent review tests. The independent review had also run the two suites directly.

- The deterministic portfolio contains 84 transfers and 24 pseudonymous accounts. Scenario labels are assigned independently of scores; the portfolio deliberately includes false positives and false negatives.
- Past-window rules include the current transfer and their exact start boundary, exclude future transfers, and use stable input order for equal timestamps. Adding later observations leaves existing past scores and evidence unchanged.
- Unknown outcomes contribute to review workload but never to quality-metric denominators. Entirely unknown datasets report unavailable precision and recall, not zero or perfect performance.
- Monetary calculations preserve minor units and reject invalid amounts and unsafe aggregate ranges. Actual table and evidence components retain valid sub-tenge amounts.
- Imports reject invalid rows as a whole, duplicate IDs, duplicate normalized fields, invalid times, malformed booleans, unsupported self-transfers, and oversized datasets. Missing outcomes remain unknown. Uploaded score, risk, provenance, and date columns cannot establish trusted conclusions.
- Graph totals reconcile to source transfers; an account's incident volume is incoming plus outgoing value. Summed account incident volume counts each transfer twice and is not a second estimate of total transfer value.
- Actual React components escape supplied identifiers and case reasoning, distinguish uploaded graph provenance, match open cases to their evidence snapshot rather than reused IDs, and render missing quality metrics as unavailable.
- Large values with fractional minor units are rejected rather than silently rounded by a magnitude-dependent tolerance. Malformed persisted case fields, malformed JSON, and denied storage reads recover without rendering invalid objects; valid saved records survive the schema check.

The React tests transpile `main.jsx` and render the production components with React's server renderer. The harness removes only the browser mounting statement and CSS imports. It does not mount a browser, run effects, exercise WebGL, or prove click/keyboard behavior.

`node --check network3d.js` also passed after the independent review changes. Those changes remove a hidden focus outline and clear an old graph highlight when the selected account is cleared or outside the displayed subset. Browser confirmation is recorded separately below.

The standard `npm run build` command also passed after final formatting (Vite 7.3.7, 5.97 seconds). Geography is loaded as a separate 160.27 kB JavaScript chunk with its own styles; the initial app does not load Leaflet until that chapter is requested. The build reported two ignored `"use client"` directives in `lucide-react` and a size advisory for the 565.29 kB Three.js chunk (143.09 kB gzip). These were warnings, with no build errors. All source, styles, configuration, tests and documentation were formatted using the project's `npm run format` command.

## Browser verification

The root agent reported these interactive observations through CUA:

- The initial synthetic portfolio selected 17 transfers for review. TX-0063 displayed score 80 with contributions of 20 + 15 + 25 + 20.
- A case was opened, moved to investigation, and refused closure without the required 12-character explanation. An inconclusive outcome with a note closed successfully and survived a full page reload.
- Changing the review threshold from 55 to 75 changed the candidate queue from 17 to 2 signals. The displayed seeded-label precision was 50% and recall 8.3%. Applying the policy changed the atlas to 2 signals and ₸1,515,000 selected value.
- Moving the graph timeline to minute 0 showed 0 visible transfers; minute 720 showed 42. Spatial separation 0.85 and motion speed 1.8 were exercised. Selecting AC-007 through the UI opened its lens with 7 transfers.
- CSV import rejected a negative amount. A two-row imported snapshot displayed amounts of ₸0.01 and ₸100.25 without losing minor units. Both outcomes were unknown, so precision and recall displayed em dashes. Reload restored the synthetic portfolio, consistent with imports being session data.
- Geography displayed actual OpenStreetMap tiles, first at the Kazakhstan view and then at the Almaty preset (43.252, 76.911, zoom 10). Zooming in to 11 updated the current-view Google Maps, Google satellite and OpenStreetMap URLs. The [saved map screenshot](../artifacts/qalqan-real-map.png) shows city roads, surrounding mountains and visible attribution. This confirms the embedded basemap and URL updates; it does not establish successful rendering by every external provider.

The graph export interaction produced its prepared/download toast, but no actual downloaded GLB file was located. A successful GLB download, file validation and external-editor roundtrip are therefore **not verified** for QALQAN. Graph selection clearing and the complete CSV template/export workflow have not yet been browser-verified in this record. The independent reviewer did not run a second browser automation system.

A separate source review found no material map lifecycle, attribution or keyboard-focus issues. Observer and window listeners are removed on cleanup, failed-tile bookkeeping matches Leaflet events, and provider links remain available if map initialization fails. The offline/tile-error notices were source-reviewed; they have not been exercised through a browser network-failure simulation.

## Demonstration boundaries

- Scores are transparent heuristic priorities, not fraud probabilities or findings of wrongdoing.
- Imported labels and flags are unverified. A snapshot represents one local day; the application does not infer a missing date, cross-day history, or cross-currency relationships.
- The timeline filters visible transfers; policy calculations use the complete active snapshot. Geometry, height, spatial separation, and motion are illustrative. A capped scene does not exclude records from calculations.
- Flagged value is transfer value selected for review, not loss or prevented loss. Review time assumes constant effort and evenly shared work.
- Case records are editable browser storage, not an authenticated or immutable audit log. Imported transfers are session data. No payment, customer restriction, or regulatory message is sent.
- These tests are not production security certification, detection-performance validation, assistive-technology certification, or a maximum-load performance assessment. External GLB editor roundtrips, mobile devices, reduced-motion behavior, and browser-storage denial need their own explicit evidence before being claimed as verified.
