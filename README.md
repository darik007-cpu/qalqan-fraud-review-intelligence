# QALQAN — Fraud Review Intelligence

An independent English-language demonstration workspace for reviewing suspicious transfers in Kazakhstan banking. The product connects a transfer, transparent rule evidence, policy tradeoffs and a local case record.

## Start

Requires Node.js 22.12+ or 24.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4174/. Build with `npm run build`, run all 24 domain and independent review tests with `npm test`, and serve the build with `npm run preview`.

This directory is a standalone application. It does not import the STRATUM oil product, share its data, or share its browser storage keys.

## Working experience

- Purpose page explaining the problem, the proposed workflow and existing national capabilities.
- Real Three.js account graph with directed transfers, account selection, time filtering, spatial separation, motion speed, pause and exportable GLB geometry.
- Transfer search, review queue and explicit scoring contributions.
- Candidate threshold comparison, workload estimates and known-outcome confusion matrix.
- Case creation, investigation, required outcome reasoning, reopening, local persistence and JSON export.
- Validated CSV import, preview, template, restore and export.
- Separate real geographic map with OpenStreetMap attribution and Google Maps links. Geographic context is not evidence of customer, branch or account location.

## Demonstration data and method

The seeded day contains 84 fictional transfers between 24 pseudonymous accounts. All amounts use KZT. Synthetic outcome labels intentionally include missed cases and false alerts; they are not a model performance benchmark.

The score assigns points for amount, supplied new-payee and new-device indicators, preceding sender activity and preceding receiver fan-in. Equal timestamps use source row order. Future transfers do not contribute to earlier scores. Scores are capped at 100 and are **review priorities, not fraud probabilities**.

Precision and recall exclude unknown outcomes. Empty denominators are unavailable, not zero. Flagged transaction value is neither confirmed loss nor prevented loss. Review-time estimates assume the selected minutes per case and evenly distributed analyst work.

CSV input represents one local day. The importer does not infer a calendar date, cross-day history, geolocation or external bank evidence. It accepts at most 2,000 transactions and 2 MB of text. Inputs are validated as a whole before applying. Monetary evidence retains up to two decimal places.

## Persistence and privacy

Imported transactions are kept in memory and reset on page reload. Cases retain an evidence snapshot in the browser's local storage. Storage failure is visibly reported. Case records are local editable data, not authenticated approvals or an immutable audit trail. No payment, customer restriction, email or regulatory submission is sent by the app.

Map tiles load from OpenStreetMap over the internet. Other application data processing is local. Public provider links open only when selected. Do not treat map tile availability as guaranteed production infrastructure.

## Design and verification

See `docs/design-direction.md` for the original design informed by the requested references, `docs/research.md` for primary sources and product hypotheses, `docs/maps.md` for geographic sources and attribution, and `docs/verification.md` for checks actually completed.

## Before a real deployment

This prototype needs authorized bank data, authenticated roles, protected server-side storage, enforceable retention, immutable audit records, monitored integrations, evaluated rule/model performance, analyst usability trials and operator-approved procedures. It is not a certified anti-fraud system, a replacement for the national Anti-Fraud Center, or a live bank connection.
