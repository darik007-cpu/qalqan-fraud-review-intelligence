import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_DAY,
  DEMO_TRANSACTIONS,
  DEFAULT_POLICY,
  LIMITS,
  scoreTransactions,
  evaluatePolicy,
  buildGraph,
  parseTransactionCSV,
  exportTransactionsCSV,
} from "./domain.js";

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

test("synthetic portfolio is reproducible, pseudonymous, labelled independently and contains both error types", () => {
  assert.equal(DEMO_DAY, "2026-10-23");
  assert.equal(DEMO_TRANSACTIONS.length, 84);
  assert.equal(new Set(DEMO_TRANSACTIONS.map((row) => row.id)).size, 84);
  assert.equal(
    new Set(DEMO_TRANSACTIONS.flatMap((row) => [row.sender, row.receiver]))
      .size,
    24,
  );
  assert.ok(
    DEMO_TRANSACTIONS.every(
      (row) => row.dataMode === "synthetic" && row.date === DEMO_DAY,
    ),
  );
  assert.deepEqual(
    scoreTransactions(DEMO_TRANSACTIONS),
    scoreTransactions(DEMO_TRANSACTIONS),
  );
  const evaluation = evaluatePolicy(DEMO_TRANSACTIONS);
  assert.ok(evaluation.confusion.fp > 0);
  assert.ok(evaluation.confusion.fn > 0);
  assert.ok(evaluation.confusion.tp > 0);
  const relabelled = DEMO_TRANSACTIONS.map((row) => ({
    ...row,
    outcome: "unknown",
  }));
  assert.deepEqual(
    scoreTransactions(relabelled).map((row) => row.score),
    evaluation.scored.map((row) => row.score),
  );
  assert.ok(Object.isFrozen(DEFAULT_POLICY));
});

test("past-inclusive sender window does not leak later transactions and includes exact boundary", () => {
  const rows = [
    transaction("late", 115),
    transaction("first", 100),
    transaction("middle", 110),
    transaction("expired", 116),
  ];
  const scored = scoreTransactions(rows);
  assert.deepEqual(
    scored.map((row) => row.id),
    rows.map((row) => row.id),
  );
  const byId = Object.fromEntries(scored.map((row) => [row.id, row]));
  assert.equal(byId.first.evidence.senderVelocity.count, 1);
  assert.equal(byId.middle.evidence.senderVelocity.count, 2);
  assert.deepEqual(byId.late.evidence.senderVelocity.transactionIds, [
    "first",
    "middle",
    "late",
  ]);
  assert.equal(
    byId.late.reasons.find((reason) => reason.code === "SENDER_VELOCITY")
      .points,
    20,
  );
  assert.deepEqual(byId.expired.evidence.senderVelocity.transactionIds, [
    "middle",
    "late",
    "expired",
  ]);
  assert.equal(byId.first.score, 0);
});

test("equal-minute observations use stable input ordering, with no forward tie leakage", () => {
  const rows = [
    transaction("z-first", 100),
    transaction("a-second", 100),
    transaction("m-third", 100),
  ];
  const scored = scoreTransactions(rows);
  assert.deepEqual(
    scored.map((row) => row.evidence.senderVelocity.count),
    [1, 2, 3],
  );
  assert.deepEqual(
    scored.map((row) => row.score),
    [0, 0, 20],
  );
  assert.deepEqual(scored[0].evidence.senderVelocity.transactionIds, [
    "z-first",
  ]);
});

test("fan-in counts distinct senders and uses only observations inside its past window", () => {
  const rows = [
    transaction("a1", 100),
    transaction("a2", 110),
    transaction("b1", 120, { sender: "C" }),
    transaction("c1", 160, { sender: "D" }),
    transaction("d1", 161, { sender: "E" }),
  ];
  const scored = scoreTransactions(rows);
  assert.deepEqual(
    scored.map((row) => row.evidence.receiverFanIn.distinctSenders),
    [1, 1, 2, 3, 4],
  );
  assert.ok(
    !scored[2].reasons.some((reason) => reason.code === "RECEIVER_FAN_IN"),
  );
  assert.ok(
    scored[3].reasons.some((reason) => reason.code === "RECEIVER_FAN_IN"),
  );
  assert.ok(!scored[4].evidence.receiverFanIn.transactionIds.includes("a1"));
});

test("signals have transparent points, cap at 100 and use threshold-consistent risk", () => {
  const rows = [
    transaction("x1", 100, { sender: "C" }),
    transaction("x2", 101, { sender: "D" }),
    transaction("x3", 102),
    transaction("x4", 103),
    transaction("x5", 104, {
      amountKzt: 500000,
      newPayee: true,
      newDevice: true,
    }),
  ];
  const scored = scoreTransactions(rows);
  assert.equal(scored[4].score, 100);
  assert.equal(
    scored[4].reasons.reduce((sum, reason) => sum + reason.points, 0),
    100,
  );
  assert.equal(scored[4].risk, "priority");
  assert.ok(
    scored.every(
      (row) => row.flagged === row.score >= DEFAULT_POLICY.threshold,
    ),
  );
  const highThreshold = scoreTransactions(
    [
      transaction("h1", 0, {
        amountKzt: 1000000,
        newPayee: true,
        newDevice: true,
      }),
    ],
    { threshold: 90 },
  );
  assert.equal(highThreshold[0].score, 60);
  assert.equal(highThreshold[0].risk, "routine");
});

test("unknown labels are excluded from quality denominators but included in review load", () => {
  const rows = [
    transaction("tp", 10, {
      newPayee: true,
      newDevice: true,
      amountKzt: 600000,
      outcome: "fraud",
    }),
    transaction("fp", 100, {
      newPayee: true,
      newDevice: true,
      amountKzt: 600000,
      outcome: "legitimate",
    }),
    transaction("unknown", 200, {
      newPayee: true,
      newDevice: true,
      amountKzt: 600000,
    }),
    transaction("fn", 300, { outcome: "fraud" }),
    transaction("tn", 400, { outcome: "legitimate" }),
  ];
  const result = evaluatePolicy(rows, DEFAULT_POLICY, {
    minutesPerReview: 8,
    analysts: 2,
  });
  assert.deepEqual(result.confusion, { tp: 1, fp: 1, tn: 1, fn: 1 });
  assert.equal(result.knownCount, 4);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.alertCount, 3);
  assert.equal(result.unknownAlertCount, 1);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.reviewHours, 24 / 60);
  assert.equal(result.teamHours, 12 / 60);
  assert.equal(result.flaggedAmountKzt, 1800000);
  const unknownOnly = evaluatePolicy([transaction("u", 0)]);
  assert.equal(unknownOnly.precision, null);
  assert.equal(unknownOnly.recall, null);
  assert.deepEqual(evaluatePolicy([]).confusion, {
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
  });
});

test("raising only the decision threshold cannot increase alert count or change scores", () => {
  const low = evaluatePolicy(DEMO_TRANSACTIONS, { threshold: 20 });
  const high = evaluatePolicy(DEMO_TRANSACTIONS, { threshold: 80 });
  assert.ok(high.alertCount <= low.alertCount);
  assert.deepEqual(
    high.scored.map((row) => row.score),
    low.scored.map((row) => row.score),
  );
  assert.ok(high.flaggedAmountKzt <= low.flaggedAmountKzt);
});

test("network includes every transaction and total account incident value is twice transfer value", () => {
  const result = evaluatePolicy(DEMO_TRANSACTIONS);
  const graph = buildGraph(result.scored);
  assert.equal(graph.nodes.length, 24);
  assert.equal(graph.links.length, 84);
  assert.equal(
    graph.links.filter((link) => link.flagged).length,
    result.alertCount,
  );
  assert.equal(
    graph.nodes.reduce((sum, node) => sum + node.volumeKzt, 0),
    result.totalAmountKzt * 2,
  );
  assert.equal(
    graph.nodes.reduce((sum, node) => sum + node.reviewCount, 0),
    result.alertCount * 2,
  );
});

test("CSV accepts quoted commas and defaults missing outcomes to unknown without invented date", () => {
  const result = parseTransactionCSV(
    'id,sender,receiver,amountKzt,minute,newPayee,newDevice\n"T,1","Account, A",B,100.25,1440,true,0',
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.transactions[0].id, "T,1");
  assert.equal(result.transactions[0].amountKzt, 100.25);
  assert.equal(result.transactions[0].newPayee, true);
  assert.equal(result.transactions[0].newDevice, false);
  assert.equal(result.transactions[0].outcome, "unknown");
  assert.equal(result.transactions[0].dataMode, "imported");
  assert.equal(result.transactions[0].date, undefined);
});

test("CSV is all-or-nothing for duplicate ids, self-transfers, invalid labels, booleans and numbers", () => {
  const header =
    "id,sender,receiver,amountKzt,minute,newPayee,newDevice,outcome";
  for (const row of [
    "T,A,A,100,5,false,false,unknown",
    "T,A,B,NaN,5,false,false,unknown",
    "T,A,B,1e308,5,false,false,unknown",
    "T,A,B,100,1441,false,false,unknown",
    "T,A,B,100,5.5,false,false,unknown",
    "T,A,B,0,5,false,false,unknown",
    "T,A,B,100.001,5,false,false,unknown",
    "T,A,B,100,5,yes,false,unknown",
    "T,A,B,100,5,false,false,maybe",
  ]) {
    const result = parseTransactionCSV(`${header}\n${row}`);
    assert.ok(result.errors.length > 0, row);
    assert.deepEqual(result.transactions, []);
  }
  assert.ok(
    parseTransactionCSV(
      `${header}\nT,A,B,100,5,false,false,unknown\nT,A,B,200,6,false,false,unknown`,
    ).errors.length,
  );
  assert.ok(parseTransactionCSV("id,sender\nT,A").errors.length);
  assert.ok(
    parseTransactionCSV("id,id,sender,receiver,amountKzt,minute\nT,T,A,B,100,5")
      .errors.length,
  );
});

test("CSV rejects oversized inputs and too many rows before scoring", () => {
  assert.ok(
    parseTransactionCSV("x".repeat(LIMITS.maxInputCharacters + 1)).errors
      .length,
  );
  const rows = Array.from(
    { length: 2001 },
    (_, index) => `T${index},A,B,100,5`,
  ).join("\n");
  assert.ok(
    parseTransactionCSV(`id,sender,receiver,amountKzt,minute\n${rows}`).errors
      .length,
  );
});

test("CSV exports preserve known labels, handle formulas safely and roundtrip ordinary evidence", () => {
  const reimport = parseTransactionCSV(
    exportTransactionsCSV(DEMO_TRANSACTIONS),
  );
  assert.deepEqual(reimport.errors, []);
  assert.equal(reimport.transactions.length, 84);
  assert.deepEqual(
    reimport.transactions.map((row) => row.outcome),
    DEMO_TRANSACTIONS.map((row) => row.outcome),
  );
  assert.deepEqual(
    scoreTransactions(reimport.transactions).map((row) => row.score),
    scoreTransactions(DEMO_TRANSACTIONS).map((row) => row.score),
  );
  const safe = exportTransactionsCSV([
    transaction("=SUM(1)", 0, { sender: "+Account" }),
  ]);
  assert.ok(safe.includes("'=SUM(1)"));
  assert.ok(safe.includes("'+Account"));
});

test("monetary sums retain cents and reject aggregate or policy numeric overflow", () => {
  const result = evaluatePolicy([
    transaction("a", 1, { amountKzt: 0.1 }),
    transaction("b", 2, { amountKzt: 0.2 }),
  ]);
  assert.equal(result.totalAmountKzt, 0.3);
  assert.throws(
    () => scoreTransactions([transaction("bad", 1, { amountKzt: Infinity })]),
    /amountKzt/,
  );
  assert.throws(
    () => scoreTransactions(DEMO_TRANSACTIONS, { threshold: -1 }),
    /threshold/,
  );
  assert.throws(
    () => scoreTransactions(DEMO_TRANSACTIONS, { windowMinutes: 0 }),
    /windowMinutes/,
  );
  assert.throws(
    () => scoreTransactions(DEMO_TRANSACTIONS, { velocityCount: 0.5 }),
    /velocityCount/,
  );
  assert.throws(
    () => evaluatePolicy([], DEFAULT_POLICY, { analysts: 0 }),
    /analysts/,
  );
  const huge = Array.from({ length: 100 }, (_, index) =>
    transaction(`H${index}`, index, { amountKzt: 1e12 }),
  );
  assert.throws(() => scoreTransactions(huge), /exact monetary range/);
});
