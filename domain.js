/**
 * QALQAN — deterministic fraud-review demonstration.
 * Synthetic outcomes are scenario labels, independent of the heuristic score.
 * Scores are review priorities, not probabilities or validated fraud predictions.
 * `minute` is local time on DEMO_DAY; 1440 denotes the end-of-day boundary.
 */
export const DEMO_DAY = "2026-10-23";
export const DEMO_TIME_ZONE = "Asia/Qyzylorda";
export const DEFAULT_POLICY = Object.freeze({
  threshold: 55,
  amountThresholdKzt: 500000,
  velocityCount: 3,
  windowMinutes: 15,
  fanInCount: 3,
  fanInWindowMinutes: 60,
});

export const LIMITS = Object.freeze({
  maxRows: 2000,
  maxInputCharacters: 2 * 1024 * 1024,
  maxAmountKzt: 1e12,
  maxIdentifierLength: 80,
});
const OUTCOMES = new Set(["fraud", "legitimate", "unknown"]);
const CSV_COLUMNS = [
  "id",
  "sender",
  "receiver",
  "amountKzt",
  "minute",
  "newPayee",
  "newDevice",
  "outcome",
];
const formatKzt = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const money = (minorUnits) => minorUnits / 100;

// Standalone CSV utilities keep this product independent from the oil workspace.
function parseCSV(text) {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) return { headers: [], rows: [], errors: [] };
  const matrix = [],
    errors = [];
  let row = [],
    field = "",
    quoted = false,
    justClosed = false,
    line = 1;
  const pushField = () => {
    row.push(field);
    field = "";
    justClosed = false;
  };
  const pushRow = () => {
    pushField();
    if (row.some((value) => value.trim() !== "")) matrix.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          justClosed = true;
        }
      } else {
        field += char;
        if (char === "\n") line += 1;
      }
    } else if (char === '"') {
      if (field.length === 0 && !justClosed) quoted = true;
      else errors.push(`Unexpected quote near line ${line}.`);
    } else if (char === ",") pushField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      pushRow();
      line += 1;
      if (matrix.length > LIMITS.maxRows + 1)
        return {
          headers: [],
          rows: [],
          errors: [`Import supports at most ${LIMITS.maxRows} transactions.`],
        };
    } else if (justClosed) {
      if (!/[ \t]/.test(char))
        errors.push(
          `Unexpected content after a closing quote near line ${line}.`,
        );
    } else field += char;
    if (errors.length > 50) return { headers: [], rows: [], errors };
  }
  if (quoted) errors.push("Unclosed quoted field at end of CSV.");
  if (field.length || row.length || justClosed) pushRow();
  if (!matrix.length) return { headers: [], rows: [], errors };
  const headers = matrix.shift().map((header) => header.trim());
  if (headers.some((header) => !header))
    errors.push("Every column needs a non-empty header.");
  if (
    new Set(headers.map((header) => header.toLowerCase())).size !==
    headers.length
  )
    errors.push("CSV headers must be unique.");
  const rows = matrix.map((values, index) => {
    if (values.length !== headers.length)
      errors.push(
        `Data row ${index + 1} has ${values.length} cells; expected ${headers.length}.`,
      );
    return Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""]),
    );
  });
  return { headers, rows, errors };
}

function exportCSV(rows, columns) {
  const encode = (value) => {
    let text = value === undefined || value === null ? "" : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text))
      text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.map(encode).join(","),
    ...rows.map((row) =>
      columns.map((column) => encode(row[column])).join(","),
    ),
  ].join("\r\n");
}

function randomGenerator(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let result = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    result =
      (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const account = (number) => `AC-${String(number).padStart(3, "0")}`;
export const DEMO_ACCOUNTS = Object.freeze(
  Array.from({ length: 24 }, (_, index) =>
    Object.freeze({ id: account(index + 1), label: account(index + 1) }),
  ),
);

function createDemoTransactions() {
  const random = randomGenerator(23102026);
  const rows = [];
  const add = (details, scenario) =>
    rows.push({
      id: `TX-${String(rows.length + 1).padStart(4, "0")}`,
      ...details,
      date: DEMO_DAY,
      timeZone: DEMO_TIME_ZONE,
      dataMode: "synthetic",
      labelSource: "Manually assigned synthetic scenario label",
      scenario,
    });
  // Fixed labels below are assigned before scoring and never read score results.
  const baselineFraudPositions = new Set([16, 47]);
  const baselineUnknownPositions = new Set([5, 14, 26, 38, 55]);
  for (let index = 0; index < 60; index += 1) {
    const senderNumber = Math.floor(random() * 24) + 1;
    let receiverNumber = Math.floor(random() * 23) + 1;
    if (receiverNumber >= senderNumber) receiverNumber += 1;
    add(
      {
        sender: account(senderNumber),
        receiver: account(receiverNumber),
        amountKzt: Math.round((15000 + random() * 395000) / 100) * 100,
        minute: 25 + index * 21 + Math.floor(random() * 8),
        newPayee: index % 7 === 0,
        newDevice: index % 13 === 0,
        outcome: baselineFraudPositions.has(index)
          ? "fraud"
          : baselineUnknownPositions.has(index)
            ? "unknown"
            : "legitimate",
      },
      "Everyday payment mixture",
    );
  }
  const burstOutcomes = [
    "fraud",
    "fraud",
    "legitimate",
    "fraud",
    "unknown",
    "fraud",
  ];
  [600, 602, 605, 608, 611, 614].forEach((minute, index) =>
    add(
      {
        sender: account(7),
        receiver: account([3, 8, 11, 15, 21, 23][index]),
        amountKzt: 650000 + index * 43000,
        minute,
        newPayee: true,
        newDevice: index < 4,
        outcome: burstOutcomes[index],
      },
      "Rapid-payment review scenario",
    ),
  );
  [900, 902, 905, 908, 911, 914].forEach((minute, index) =>
    add(
      {
        sender: account(14),
        receiver: account([1, 4, 6, 10, 17, 22][index]),
        amountKzt: 810000 + index * 12000,
        minute,
        newPayee: false,
        newDevice: true,
        outcome: "legitimate",
      },
      "Legitimate batch payments on a new device",
    ),
  );
  [700, 709, 718, 727, 736].forEach((minute, index) =>
    add(
      {
        sender: account([2, 4, 9, 12, 22][index]),
        receiver: account(19),
        amountKzt: 560000 + index * 18000,
        minute,
        newPayee: true,
        newDevice: false,
        outcome: ["fraud", "fraud", "legitimate", "fraud", "unknown"][index],
      },
      "Converging payments with mixed outcomes",
    ),
  );
  [1100, 1150, 1200, 1250].forEach((minute, index) =>
    add(
      {
        sender: account([18, 20, 21, 23][index]),
        receiver: account([5, 6, 10, 12][index]),
        amountKzt: 1200000 + index * 170000,
        minute,
        newPayee: true,
        newDevice: true,
        outcome: "legitimate",
      },
      "Legitimate high-value payments",
    ),
  );
  [1330, 1370, 1420].forEach((minute, index) =>
    add(
      {
        sender: account([5, 10, 24][index]),
        receiver: account([2, 8, 16][index]),
        amountKzt: 45000 + index * 17000,
        minute,
        newPayee: false,
        newDevice: false,
        outcome: "fraud",
      },
      "Low-signal seeded fraud examples",
    ),
  );
  return rows
    .sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id))
    .map((row) => Object.freeze(row));
}

export const DEMO_TRANSACTIONS = Object.freeze(createDemoTransactions());

function validatePolicy(policy = DEFAULT_POLICY) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy))
    throw new TypeError("Policy must be an object.");
  const result = { ...DEFAULT_POLICY, ...policy };
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (!Number.isFinite(result[key]))
      throw new RangeError(`${key} must be a finite number.`);
  }
  if (result.threshold < 0 || result.threshold > 100)
    throw new RangeError("threshold must be between 0 and 100.");
  if (
    result.amountThresholdKzt < 0 ||
    result.amountThresholdKzt > LIMITS.maxAmountKzt
  )
    throw new RangeError(
      "amountThresholdKzt must be between 0 and 1,000,000,000,000 KZT.",
    );
  for (const key of ["velocityCount", "fanInCount"]) {
    if (
      !Number.isInteger(result[key]) ||
      result[key] < 1 ||
      result[key] > LIMITS.maxRows
    )
      throw new RangeError(
        `${key} must be an integer between 1 and ${LIMITS.maxRows}.`,
      );
  }
  for (const key of ["windowMinutes", "fanInWindowMinutes"]) {
    if (result[key] <= 0 || result[key] > 1440)
      throw new RangeError(
        `${key} must be greater than 0 and no more than 1440.`,
      );
  }
  return result;
}

function validateRows(rows, { imported = false } = {}) {
  const errors = [];
  if (!Array.isArray(rows))
    return { transactions: [], errors: ["Transactions must be an array."] };
  if (rows.length > LIMITS.maxRows)
    return {
      transactions: [],
      errors: [`At most ${LIMITS.maxRows} transactions are supported.`],
    };
  const seen = new Set();
  let totalMinorUnits = 0;
  const transactions = rows.map((row, index) => {
    const prefix = `Row ${index + 1}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${prefix}: a transaction object is required.`);
      return null;
    }
    const record = { ...row };
    for (const key of ["id", "sender", "receiver"]) {
      const value = typeof record[key] === "string" ? record[key].trim() : "";
      if (
        !value ||
        value.length > LIMITS.maxIdentifierLength ||
        /[\u0000-\u001f\u007f]/.test(value)
      )
        errors.push(
          `${prefix}: ${key} must be non-empty text of at most ${LIMITS.maxIdentifierLength} characters, without control characters.`,
        );
      record[key] = value;
    }
    if (seen.has(record.id))
      errors.push(`${prefix}: duplicate transaction id "${record.id}".`);
    seen.add(record.id);
    if (record.sender === record.receiver)
      errors.push(
        `${prefix}: self-transfers are not supported in this review model.`,
      );
    const amount = record.amountKzt;
    const minorUnits = Math.round(amount * 100);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > LIMITS.maxAmountKzt ||
      !Number.isSafeInteger(minorUnits) ||
      amount !== minorUnits / 100
    ) {
      errors.push(
        `${prefix}: amountKzt must be positive, no more than 1,000,000,000,000, and have at most two decimal places.`,
      );
    } else totalMinorUnits += minorUnits;
    if (
      !Number.isInteger(record.minute) ||
      record.minute < 0 ||
      record.minute > 1440
    )
      errors.push(`${prefix}: minute must be an integer from 0 to 1440.`);
    for (const key of ["newPayee", "newDevice"]) {
      if (record[key] === undefined) record[key] = false;
      if (typeof record[key] !== "boolean")
        errors.push(`${prefix}: ${key} must be true or false.`);
    }
    if (record.outcome === undefined || record.outcome === "")
      record.outcome = "unknown";
    if (!OUTCOMES.has(record.outcome))
      errors.push(`${prefix}: outcome must be fraud, legitimate, or unknown.`);
    record.dataMode = imported
      ? "imported"
      : record.dataMode === "synthetic"
        ? "synthetic"
        : "imported";
    if (imported) record.labelSource = "Imported outcome label; unverified";
    return record;
  });
  if (!Number.isSafeInteger(totalMinorUnits))
    errors.push(
      "The combined transaction value exceeds the supported exact monetary range.",
    );
  return { transactions: errors.length ? [] : transactions, errors };
}

/**
 * Score in chronological order, then restore input order. Only already-observed
 * transactions enter a window. Equal-minute ties follow stable input order.
 * The current transaction is included. Future events and outcomes are never used.
 */
export function scoreTransactions(rows, policy = DEFAULT_POLICY) {
  const resolvedPolicy = validatePolicy(policy);
  const validated = validateRows(rows);
  if (validated.errors.length) throw new RangeError(validated.errors.join(" "));
  const chronological = validated.transactions
    .map((row, inputIndex) => ({ ...row, inputIndex }))
    .sort((a, b) => a.minute - b.minute || a.inputIndex - b.inputIndex);
  const results = [];
  chronological.forEach((transaction, index) => {
    const velocityTransactions = [];
    const fanInTransactions = [];
    const observedSenders = new Set();
    const senderStart = transaction.minute - resolvedPolicy.windowMinutes;
    const receiverStart =
      transaction.minute - resolvedPolicy.fanInWindowMinutes;
    const earliest = Math.min(senderStart, receiverStart);
    for (let previous = index; previous >= 0; previous -= 1) {
      const observed = chronological[previous];
      if (observed.minute < earliest) break;
      if (
        observed.minute >= senderStart &&
        observed.sender === transaction.sender
      )
        velocityTransactions.push(observed);
      if (
        observed.minute >= receiverStart &&
        observed.receiver === transaction.receiver
      ) {
        fanInTransactions.push(observed);
        observedSenders.add(observed.sender);
      }
    }
    velocityTransactions.reverse();
    fanInTransactions.reverse();
    const reasons = [];
    if (transaction.amountKzt >= resolvedPolicy.amountThresholdKzt)
      reasons.push({
        code: "HIGH_AMOUNT",
        title: "High amount",
        detail: `${formatKzt(transaction.amountKzt)} KZT meets the ${formatKzt(resolvedPolicy.amountThresholdKzt)} KZT review threshold.`,
        points: 20,
      });
    if (transaction.newPayee)
      reasons.push({
        code: "NEW_PAYEE",
        title: "New payee",
        detail:
          "The supplied new-payee indicator is true for this transaction.",
        points: 15,
      });
    if (transaction.newDevice)
      reasons.push({
        code: "NEW_DEVICE",
        title: "New device",
        detail:
          "The supplied new-device indicator is true for this transaction.",
        points: 25,
      });
    if (velocityTransactions.length >= resolvedPolicy.velocityCount)
      reasons.push({
        code: "SENDER_VELOCITY",
        title: "Rapid sender activity",
        detail: `${velocityTransactions.length} payments by this sender in the past ${resolvedPolicy.windowMinutes} minutes, including this payment.`,
        points: 20,
      });
    if (observedSenders.size >= resolvedPolicy.fanInCount)
      reasons.push({
        code: "RECEIVER_FAN_IN",
        title: "Multiple senders converge",
        detail: `${observedSenders.size} distinct senders paid this receiver in the past ${resolvedPolicy.fanInWindowMinutes} minutes, including this payment.`,
        points: 20,
      });
    const score = Math.min(
      100,
      reasons.reduce((sum, reason) => sum + reason.points, 0),
    );
    const flagged = score >= resolvedPolicy.threshold;
    const risk = !flagged ? "routine" : score >= 75 ? "priority" : "review";
    results[transaction.inputIndex] = {
      ...transaction,
      score,
      risk,
      flagged,
      reasons,
      evidence: {
        senderVelocity: {
          count: velocityTransactions.length,
          windowMinutes: resolvedPolicy.windowMinutes,
          windowStartMinute: Math.max(0, senderStart),
          throughMinute: transaction.minute,
          transactionIds: velocityTransactions.map((row) => row.id),
        },
        receiverFanIn: {
          distinctSenders: observedSenders.size,
          windowMinutes: resolvedPolicy.fanInWindowMinutes,
          windowStartMinute: Math.max(0, receiverStart),
          throughMinute: transaction.minute,
          accountIds: [...observedSenders].sort(),
          transactionIds: fanInTransactions.map((row) => row.id),
        },
        ordering:
          "Past observations only; equal-minute ties follow input order; current payment included.",
      },
      methodology:
        "Transparent heuristic score from 0 to 100. It is not a fraud probability.",
    };
  });
  return results.map(({ inputIndex, ...row }) => row);
}

/** Known labels only enter quality metrics. Unknown alerts still need review time. */
export function evaluatePolicy(
  rows,
  policy = DEFAULT_POLICY,
  { minutesPerReview = 8, analysts = 3 } = {},
) {
  if (
    !Number.isFinite(minutesPerReview) ||
    minutesPerReview <= 0 ||
    minutesPerReview > 1440
  )
    throw new RangeError(
      "minutesPerReview must be greater than 0 and no more than 1440.",
    );
  if (!Number.isInteger(analysts) || analysts < 1 || analysts > 10000)
    throw new RangeError("analysts must be an integer between 1 and 10000.");
  const resolvedPolicy = validatePolicy(policy);
  const scored = scoreTransactions(rows, resolvedPolicy);
  const confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  let totalMinorUnits = 0,
    flaggedMinorUnits = 0,
    knownCount = 0,
    unknownCount = 0,
    unknownAlertCount = 0,
    alertCount = 0;
  scored.forEach((row) => {
    totalMinorUnits += Math.round(row.amountKzt * 100);
    if (row.flagged) {
      alertCount += 1;
      flaggedMinorUnits += Math.round(row.amountKzt * 100);
    }
    if (row.outcome === "unknown") {
      unknownCount += 1;
      if (row.flagged) unknownAlertCount += 1;
      return;
    }
    knownCount += 1;
    if (row.outcome === "fraud") confusion[row.flagged ? "tp" : "fn"] += 1;
    else confusion[row.flagged ? "fp" : "tn"] += 1;
  });
  const precisionDenominator = confusion.tp + confusion.fp;
  const recallDenominator = confusion.tp + confusion.fn;
  const reviewHours = (alertCount * minutesPerReview) / 60;
  return {
    scored,
    alertCount,
    totalAmountKzt: money(totalMinorUnits),
    flaggedAmountKzt: money(flaggedMinorUnits),
    knownCount,
    unknownCount,
    unknownAlertCount,
    knownAlertCount: precisionDenominator,
    confusion,
    precision: precisionDenominator
      ? confusion.tp / precisionDenominator
      : null,
    recall: recallDenominator ? confusion.tp / recallDenominator : null,
    reviewHours,
    teamHours: reviewHours / analysts,
    minutesPerReview,
    analysts,
    priorityCount: scored.filter((row) => row.risk === "priority").length,
    reviewCount: scored.filter((row) => row.risk === "review").length,
    routineCount: scored.filter((row) => row.risk === "routine").length,
    policy: resolvedPolicy,
    assumptions: [
      "Outcome labels are supplied scenario or imported labels; their accuracy is not independently verified.",
      "Unknown outcomes are excluded from precision, recall and the confusion matrix.",
      "Flagged amount is the value selected for review, not measured fraud loss or prevented loss.",
      "Review hours use a constant time per alert. Team hours assume work divides evenly across analysts.",
      "Scores are heuristics for a demonstration and have not been validated for production detection.",
    ],
  };
}

/** Whole-dataset network; account volume is incoming plus outgoing value. */
export function buildGraph(scored) {
  const validated = validateRows(scored);
  if (validated.errors.length) throw new RangeError(validated.errors.join(" "));
  const accounts = new Map();
  const ensureAccount = (id) => {
    if (!accounts.has(id))
      accounts.set(id, {
        id,
        label: id,
        incomingMinor: 0,
        outgoingMinor: 0,
        reviewCount: 0,
        transactionCount: 0,
      });
    return accounts.get(id);
  };
  const links = validated.transactions.map((transaction) => {
    const sender = ensureAccount(transaction.sender),
      receiver = ensureAccount(transaction.receiver);
    const minorUnits = Math.round(transaction.amountKzt * 100);
    sender.outgoingMinor += minorUnits;
    receiver.incomingMinor += minorUnits;
    sender.transactionCount += 1;
    receiver.transactionCount += 1;
    if (transaction.flagged === true) {
      sender.reviewCount += 1;
      receiver.reviewCount += 1;
    }
    return {
      id: transaction.id,
      source: transaction.sender,
      target: transaction.receiver,
      amountKzt: transaction.amountKzt,
      minute: transaction.minute,
      score: Number.isFinite(transaction.score) ? transaction.score : 0,
      flagged: transaction.flagged === true,
    };
  });
  const nodes = [...accounts.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ incomingMinor, outgoingMinor, ...node }) => ({
      ...node,
      volumeKzt: money(incomingMinor + outgoingMinor),
      incomingKzt: money(incomingMinor),
      outgoingKzt: money(outgoingMinor),
    }));
  return { nodes, links };
}

const normaliseHeader = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const booleanFromCSV = (value) => {
  if (value === undefined || value.trim() === "") return false;
  if (["true", "1"].includes(value.trim().toLowerCase())) return true;
  if (["false", "0"].includes(value.trim().toLowerCase())) return false;
  return value;
};

/** All-or-nothing import. A single-day snapshot is assumed; self-transfers rejected. */
export function parseTransactionCSV(text) {
  const warnings = [];
  if (typeof text !== "string")
    return { transactions: [], errors: ["CSV input must be text."], warnings };
  if (text.length > LIMITS.maxInputCharacters)
    return {
      transactions: [],
      errors: ["CSV input exceeds the 2 MiB character limit."],
      warnings,
    };
  const parsed = parseCSV(text);
  const errors = [...parsed.errors];
  if (!parsed.headers.length)
    return {
      transactions: [],
      errors: errors.length ? errors : ["The CSV is empty."],
      warnings,
    };
  if (parsed.rows.length > LIMITS.maxRows)
    return {
      transactions: [],
      errors: [`Import supports at most ${LIMITS.maxRows} transactions.`],
      warnings,
    };
  if (!parsed.rows.length) errors.push("The CSV contains no transaction rows.");
  const columnMap = new Map(
    CSV_COLUMNS.map((column) => [normaliseHeader(column), column]),
  );
  const mappedHeaders = parsed.headers.map(
    (header) => columnMap.get(normaliseHeader(header)) ?? header,
  );
  if (new Set(mappedHeaders).size !== mappedHeaders.length)
    errors.push("Two CSV columns refer to the same transaction field.");
  for (const column of ["id", "sender", "receiver", "amountKzt", "minute"])
    if (!mappedHeaders.includes(column))
      errors.push(`Missing required column: ${column}.`);
  for (const flag of ["newPayee", "newDevice"])
    if (!mappedHeaders.includes(flag))
      warnings.push(
        `${flag} was not supplied and defaults to false; this signal cannot be evaluated from the snapshot.`,
      );
  if (!mappedHeaders.includes("outcome"))
    warnings.push(
      "Outcomes were not supplied and remain unknown; precision and recall cannot be evaluated.",
    );
  if (mappedHeaders.some((header) => !CSV_COLUMNS.includes(header)))
    warnings.push(
      "Unrecognized columns are ignored. Scores and review states are always recalculated.",
    );
  if (errors.length) return { transactions: [], errors, warnings };
  const rows = parsed.rows.map((raw) => {
    const record = Object.fromEntries(
      parsed.headers.map((header, index) => [
        mappedHeaders[index],
        raw[header].trim(),
      ]),
    );
    return {
      id: record.id,
      sender: record.sender,
      receiver: record.receiver,
      amountKzt: record.amountKzt === "" ? NaN : Number(record.amountKzt),
      minute: record.minute === "" ? NaN : Number(record.minute),
      newPayee: booleanFromCSV(record.newPayee),
      newDevice: booleanFromCSV(record.newDevice),
      outcome: record.outcome?.toLowerCase() || "unknown",
      dataMode: "imported",
    };
  });
  const validated = validateRows(rows, { imported: true });
  warnings.push(
    "Imported labels and flags are unverified. All rows are assumed to belong to one local day; no date is inferred.",
  );
  return {
    transactions: validated.transactions,
    errors: validated.errors,
    warnings,
  };
}

/** Export input evidence only; score and outcome are not conflated. */
export function exportTransactionsCSV(rows = DEMO_TRANSACTIONS) {
  const validated = validateRows(rows);
  if (validated.errors.length) throw new RangeError(validated.errors.join(" "));
  return exportCSV(validated.transactions, CSV_COLUMNS);
}
