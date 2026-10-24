import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_POLICY,
  scoreTransactions,
  evaluatePolicy,
  buildGraph,
  parseTransactionCSV,
} from "./domain.js";

// Render production React components without mounting a browser or running effects.
// Only the application entry point and stylesheet imports are omitted.
const sourceURL = new URL("./main.jsx", import.meta.url);
const require = createRequire(sourceURL);
const source = await readFile(sourceURL, "utf8");
const entryPoint =
  /createRoot\(\s*document\.getElementById\(["']root["']\)\s*\)\.render\(\s*<App\s*\/>\s*\);?/;
assert.match(
  source,
  entryPoint,
  "The SSR harness must remove the actual browser entry point.",
);
const compiled = await transform(
  source.replace(entryPoint, "") +
    "\nexport { Purpose, TransactionTable, Review, Policy, CaseCard, readCases };",
  { loader: "jsx", format: "cjs" },
);
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled.code)(
  (id) => (id.endsWith(".css") ? {} : require(id)),
  loaded,
  loaded.exports,
);
const { Purpose, TransactionTable, Review, Policy, CaseCard, readCases } =
  loaded.exports;
const render = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, props));
const transaction = (id, minute, overrides = {}) => ({
  id,
  sender: "A",
  receiver: "B",
  amountKzt: 100,
  minute,
  newPayee: false,
  newDevice: false,
  outcome: "unknown",
  dataMode: "imported",
  ...overrides,
});

test("past evidence is unchanged when later observations are added in arbitrary input positions", () => {
  const past = Object.freeze([
    Object.freeze(transaction("early", 1, { sender: "C" })),
    Object.freeze(transaction("middle", 4)),
    Object.freeze(
      transaction("last", 15, { amountKzt: 500000, newPayee: true }),
    ),
  ]);
  const prior = scoreTransactions(past);
  const extended = scoreTransactions([
    transaction("future-first-in-file", 25, {
      sender: "D",
      outcome: "fraud",
      newDevice: true,
    }),
    ...past,
    transaction("future-last-in-file", 1440),
  ]);
  assert.deepEqual(
    extended.filter((row) => past.some((old) => old.id === row.id)),
    prior,
  );
  assert.equal(past[0].score, undefined);
  assert.equal(prior[2].evidence.receiverFanIn.throughMinute, 15);
});

test("an entirely unknown-outcome queue has workload but no quality estimate", () => {
  const rows = [
    transaction("u1", 0, {
      newDevice: true,
      newPayee: true,
      amountKzt: 600000,
    }),
    transaction("u2", 70, {
      newDevice: true,
      newPayee: true,
      amountKzt: 600000,
    }),
    transaction("u3", 140),
  ];
  const result = evaluatePolicy(rows, DEFAULT_POLICY, {
    minutesPerReview: 15,
    analysts: 2,
  });
  assert.equal(result.alertCount, 2);
  assert.equal(result.unknownAlertCount, 2);
  assert.equal(result.knownCount, 0);
  assert.equal(result.precision, null);
  assert.equal(result.recall, null);
  assert.deepEqual(result.confusion, { tp: 0, fp: 0, tn: 0, fn: 0 });
  assert.equal(result.reviewHours, 0.5);
  assert.equal(result.teamHours, 0.25);
});

test("CSV cannot supply trusted provenance or a precomputed review conclusion", () => {
  const result = parseTransactionCSV(
    "id,sender,receiver,amountKzt,minute,score,flagged,risk,dataMode,date,labelSource\nX,A,B,0.01,1,100,true,priority,synthetic,2026-01-01,verified",
  );
  assert.deepEqual(result.errors, []);
  const [row] = result.transactions;
  assert.equal(row.dataMode, "imported");
  assert.equal(row.date, undefined);
  assert.equal(row.outcome, "unknown");
  assert.match(row.labelSource, /unverified/i);
  const [scored] = scoreTransactions(result.transactions);
  assert.equal(scored.score, 0);
  assert.equal(scored.flagged, false);
  assert.equal(scored.risk, "routine");
});

test("normalised duplicate CSV columns fail without partially applying evidence", () => {
  const result = parseTransactionCSV(
    "\uFEFFid,sender,receiver,amountKzt,amount_kzt,minute\r\nT,A,B,1,900000,0",
  );
  assert.ok(
    result.errors.some((message) => /same transaction field/i.test(message)),
  );
  assert.deepEqual(result.transactions, []);
});

test("large monetary values cannot hide fractional minor units inside a numeric tolerance", () => {
  for (const amount of [
    "999999999999.9995",
    "999999999999.9999",
    "1000000000.0000001",
  ]) {
    const result = parseTransactionCSV(
      `id,sender,receiver,amountKzt,minute\nT,A,B,${amount},0`,
    );
    assert.ok(
      result.errors.some((message) => /two decimal places/.test(message)),
      amount,
    );
    assert.deepEqual(result.transactions, []);
  }
  for (const amount of [
    "0.01",
    "0.29",
    "1000000000.01",
    "999999999999.99",
    "1000000000000",
  ]) {
    const result = parseTransactionCSV(
      `id,sender,receiver,amountKzt,minute\nT,A,B,${amount},0`,
    );
    assert.deepEqual(result.errors, [], amount);
    assert.equal(
      evaluatePolicy(result.transactions).totalAmountKzt,
      Number(amount),
    );
  }
});

test("transaction evidence preserves sub-tenge values and escapes imported identifiers", () => {
  const rows = scoreTransactions([
    transaction("<img src=x onerror=alert(1)>", 0, {
      sender: "<script>alert(1)</script>",
      amountKzt: 0.01,
    }),
    transaction("T2", 1, { amountKzt: 1200.25 }),
  ]);
  const html = render(TransactionTable, { rows, onSelect() {} });
  assert.match(html, /₸0\.01/);
  assert.match(html, /₸1,200\.25/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<(?:script|img)\b/);
});

test("purpose page identifies uploaded graph provenance instead of calling it synthetic", () => {
  const graph = buildGraph(scoreTransactions([transaction("UPLOADED", 1)]));
  const html = render(Purpose, { navigate() {}, graph, imported: true });
  assert.match(html, /[Uu]ploaded|[Ii]mported/);
  assert.doesNotMatch(html, /Synthetic data/);
});

test("review cases match their evidence snapshot rather than a reused transaction ID", () => {
  const [current] = scoreTransactions([
    transaction("REUSED-ID", 20, { amountKzt: 0.01 }),
  ]);
  const props = {
    evaluation: evaluatePolicy([current]),
    selectedId: current.id,
    onSelect() {},
    createCase() {},
  };
  const oldCase = {
    id: "old",
    transactionId: current.id,
    status: "review",
    snapshot: { ...current, amountKzt: 900000, sender: "OLD-SENDER" },
  };
  const differentEvidence = render(Review, { ...props, cases: [oldCase] });
  assert.match(differentEvidence, /Open review case/);
  assert.doesNotMatch(differentEvidence, /Case already open/);
  assert.match(differentEvidence, /₸0\.01/);
  const matching = render(Review, {
    ...props,
    cases: [{ ...oldCase, snapshot: current }],
  });
  assert.match(matching, /Case already open/);
  assert.match(matching, /<button[^>]*disabled=""[^>]*>/);
  const closed = render(Review, {
    ...props,
    cases: [{ ...oldCase, snapshot: current, status: "closed" }],
  });
  assert.match(closed, /Open review case/);
});

test("policy page represents missing label metrics as unavailable with explicit denominator limits", () => {
  const rows = [
    transaction("UNLABELLED", 0, {
      newPayee: true,
      newDevice: true,
      amountKzt: 600000,
    }),
  ];
  const html = render(Policy, {
    rows,
    policy: DEFAULT_POLICY,
    setPolicy() {},
    evaluation: evaluatePolicy(rows),
    toast() {},
  });
  assert.match(html, /0 known \/ 1 unknown/);
  assert.match(html, /Precision on known labels<\/span><strong>—<\/strong>/);
  assert.match(html, /Recall on known labels<\/span><strong>—<\/strong>/);
  assert.match(html, /[Uu]nknown/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("case reasoning renders imported text as text, preserving a recorded outcome", () => {
  const html = render(CaseCard, {
    item: {
      id: "case-1",
      transactionId: "T1",
      status: "closed",
      title: "<script>alert(1)</script>",
      summary: "<img src=x>",
      dataMode: "imported",
      policyThreshold: 55,
      score: 60,
      events: [
        {
          at: "2026-10-23T10:00:00Z",
          text: "inconclusive: <img src=x onerror=alert(1)>",
        },
      ],
    },
    updateCase() {},
  });
  assert.match(html, /inconclusive: &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<(?:script|img)\b/);
  assert.match(html, /Reopen review/);
});

test("malformed persisted cases cannot crash the journal while valid cases survive recovery", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const valid = {
    id: "valid",
    transactionId: "T",
    status: "closed",
    title: "Saved case",
    summary: "Evidence retained.",
    dataMode: "imported",
    policyThreshold: 55,
    score: 60,
    events: [{ at: "2026-10-23T10:00:00Z", text: "Review recorded." }],
  };
  const badOverrides = [
    { summary: { legacy: "value" } },
    { dataMode: {} },
    { score: {} },
    { policyThreshold: "55" },
    { events: [{ at: "invalid-date", text: "Review" }] },
  ];
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () =>
          JSON.stringify([
            valid,
            ...badOverrides.map((overrides, index) => ({
              ...valid,
              id: `bad-${index}`,
              ...overrides,
            })),
          ]),
      },
    });
    const cases = readCases();
    assert.deepEqual(
      cases.map((item) => item.id),
      ["valid"],
    );
    assert.doesNotThrow(() =>
      render(CaseCard, { item: cases[0], updateCase() {} }),
    );
    globalThis.localStorage.getItem = () => "{malformed";
    assert.deepEqual(readCases(), []);
    globalThis.localStorage.getItem = () => {
      throw new Error("Storage access denied.");
    };
    assert.deepEqual(readCases(), []);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
