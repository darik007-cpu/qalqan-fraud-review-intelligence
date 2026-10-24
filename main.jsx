import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Shield,
  Network,
  ScanLine,
  SlidersHorizontal,
  Files,
  Database,
  Play,
  Pause,
  RotateCcw,
  Download,
  Search,
  Check,
  X,
  Plus,
  ChevronRight,
  AlertCircle,
  Clock3,
  FileCheck2,
  MoveUpRight,
  Globe2,
} from "lucide-react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import {
  DEMO_TRANSACTIONS,
  DEFAULT_POLICY,
  evaluatePolicy,
  buildGraph,
  parseTransactionCSV,
  exportTransactionsCSV,
} from "./domain.js";
import { createNetworkScene } from "./network3d.js";
const Geography = lazy(() => import("./Geography.jsx"));

const fmt = (value, digits = 0) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "—";
const kzt = (value) => `₸${fmt(value, 2)}`;
const pct = (value) => (value == null ? "—" : `${fmt(value * 100, 1)}%`);
const clock = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const NAV = [
  { id: "purpose", label: "Overview" },
  { id: "review", label: "Investigate", icon: ScanLine },
  { id: "network", label: "Transfer network", icon: Network },
  { id: "policy", label: "Policy", icon: SlidersHorizontal },
  { id: "cases", label: "Journal", icon: Files },
  { id: "data", label: "Data", icon: Database },
  { id: "geography", label: "Geography", icon: Globe2 },
];
const CASE_KEY = "qalqan-cases-v1";
function recordKey(row) {
  if (!row) return null;
  return JSON.stringify([
    row.id,
    row.sender,
    row.receiver,
    row.amountKzt,
    row.minute,
    row.newPayee,
    row.newDevice,
    row.outcome,
    row.dataMode,
  ]);
}
function hasOpenCase(items, row) {
  const key = recordKey(row);
  return items.some(
    (item) =>
      item.status !== "closed" &&
      (item.recordKey || recordKey(item.snapshot)) === key,
  );
}

function download(content, name, type = "text/plain;charset=utf-8") {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function readCases() {
  try {
    const raw = JSON.parse(localStorage.getItem(CASE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.transactionId === "string" &&
          ["review", "investigating", "closed"].includes(item.status) &&
          typeof item.title === "string" &&
          typeof item.summary === "string" &&
          ["synthetic", "imported"].includes(item.dataMode) &&
          Number.isFinite(item.score) &&
          item.score >= 0 &&
          item.score <= 100 &&
          Number.isFinite(item.policyThreshold) &&
          item.policyThreshold >= 0 &&
          item.policyThreshold <= 100 &&
          Array.isArray(item.events) &&
          item.events.every(
            (event) =>
              event &&
              typeof event.text === "string" &&
              typeof event.at === "string" &&
              Number.isFinite(Date.parse(event.at)),
          ),
      )
      .slice(0, 500);
  } catch {
    return [];
  }
}
function Badge({ type = "neutral", children }) {
  return <span className={`q-badge ${type}`}>{children}</span>;
}
function Button({ children, primary, small, className = "", ...props }) {
  return (
    <button
      className={`q-button ${primary ? "primary" : ""} ${small ? "small" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
function PageHead({ chapter, title, description, children }) {
  return (
    <header className="q-page-head">
      <div>
        <span className="eyebrow">{chapter}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="q-actions">{children}</div>
    </header>
  );
}
function Kpi({ label, value, note }) {
  return (
    <div className="q-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Slider({ label, value, display, min, max, step = 1, onChange }) {
  return (
    <label className="q-slider">
      <span>
        {label}
        <strong>{display ?? value}</strong>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function NetworkModel({ graph, onSelect, selectedId, compact = false, toast }) {
  const host = useRef(null),
    api = useRef(null),
    callback = useRef(onSelect);
  callback.current = onSelect;
  const [time, setTime] = useState(1440),
    [spread, setSpread] = useState(0.5),
    [speed, setSpeed] = useState(1),
    [running, setRunning] = useState(true),
    [exporting, setExporting] = useState(false);
  const displayGraph = useMemo(() => {
    const nodes = graph.nodes.slice(0, 60),
      ids = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      links: graph.links
        .filter((link) => ids.has(link.source) && ids.has(link.target))
        .slice(0, 200),
    };
  }, [graph]);
  useEffect(() => {
    const scene = createNetworkScene(host.current, {
      ...displayGraph,
      onSelect: (id, node) => callback.current?.(id, node),
    });
    api.current = scene;
    scene.setTime(time / 1440);
    scene.setSpread(spread);
    scene.setSpeed(speed);
    scene.setRunning(running);
    scene.selectNode(selectedId);
    return () => {
      scene.dispose();
      api.current = null;
    };
  }, [displayGraph]);
  useEffect(() => {
    api.current?.selectNode(selectedId);
  }, [selectedId]);
  async function exportModel() {
    try {
      setExporting(true);
      const blob = await api.current.exportScene();
      download(blob, "qalqan-transfer-atlas.glb");
      toast?.("Illustrative network geometry prepared for download.");
    } catch (error) {
      toast?.(`Export unavailable: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }
  const visible = displayGraph.links.filter(
    (link) => link.minute <= time,
  ).length;
  return (
    <div className={`q-network-wrap ${compact ? "compact" : ""}`}>
      <div className="q-network-bar">
        <span>
          <span className="q-live-dot" />
          TRANSFER ATLAS / 3D
        </span>
        <span>
          {displayGraph.nodes.length} ACCOUNTS · {visible} VISIBLE TRANSFERS
        </span>
      </div>
      <div
        className="q-network-canvas"
        ref={host}
        aria-label="Interactive account transfer graph"
      />
      <div className="q-network-caption">
        Illustrative arrangement. A connection records a transfer; it does not
        establish wrongdoing.
      </div>
      {!compact && (
        <>
          <div className="q-network-footer">
            <div className="q-actions">
              <Button small onClick={() => api.current?.setView("perspective")}>
                <RotateCcw size={14} />
                Reset view
              </Button>
              <Button small onClick={() => api.current?.setView("top")}>
                Top view
              </Button>
              <Button
                small
                aria-label={
                  running ? "Pause network animation" : "Play network animation"
                }
                onClick={() => {
                  setRunning(!running);
                  api.current?.setRunning(!running);
                }}
              >
                {running ? <Pause size={15} /> : <Play size={15} />}
              </Button>
            </div>
            <Button small disabled={exporting} onClick={exportModel}>
              <Download size={14} />
              {exporting ? "Exporting…" : "Export 3D"}
            </Button>
          </div>
          <div className="q-network-controls">
            <Slider
              label="Timeline"
              min={0}
              max={1440}
              value={time}
              display={clock(time)}
              onChange={(value) => {
                setTime(value);
                api.current?.setTime(value / 1440);
              }}
            />
            <Slider
              label="Spatial separation"
              min={0}
              max={1}
              step={0.01}
              value={spread}
              display={`${fmt(spread * 100)}%`}
              onChange={(value) => {
                setSpread(value);
                api.current?.setSpread(value);
              }}
            />
            <Slider
              label="Motion speed"
              min={0}
              max={3}
              step={0.1}
              value={speed}
              display={`${speed}×`}
              onChange={(value) => {
                setSpeed(value);
                api.current?.setSpeed(value);
              }}
            />
          </div>
          <p className="q-model-note">
            Timeline controls visible transfers only. Scores and the review
            queue use the full active snapshot. Spatial separation and speed
            affect the illustration only.
            {(graph.nodes.length > 60 || graph.links.length > 200) &&
              " The scene displays at most 60 accounts and 200 transfers; calculations include all records."}
          </p>
        </>
      )}
    </div>
  );
}

function Purpose({ navigate, graph, imported }) {
  const observedValue =
    graph.links.reduce(
      (total, link) => total + Math.round(link.amountKzt * 100),
      0,
    ) / 100;
  const signalCount = graph.links.filter((link) => link.flagged).length;
  return (
    <>
      <section className="q-ledger-hero">
        <div className="q-purpose-copy">
          <div className="q-purpose-kicker">
            <span className="q-seal" aria-hidden="true">
              Q
            </span>
            <span>
              Evidence before conclusions.
              <small>An analyst's review workspace</small>
            </span>
          </div>
          <h1>
            A clearer view
            <br />
            <em>of every transfer.</em>
          </h1>
          <p>
            A signal deserves a closer look. Bring the transfer, its measured
            indicators and your reasoning into one considered review.
          </p>
          <div className="q-purpose-actions">
            <Button primary onClick={() => navigate("review")}>
              Start a review <ArrowRight size={17} />
            </Button>
            <button className="q-quiet-link" onClick={() => navigate("policy")}>
              Understand the method <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="q-purpose-note">
            Independent demonstration <span /> Kazakhstan · KZT <span /> No bank
            connection
          </div>
        </div>
        <aside
          className="q-snapshot-ledger"
          aria-label="Active snapshot summary"
        >
          <div className="q-ledger-heading">
            <span className="eyebrow">Review ledger</span>
            <Badge>{imported ? "Uploaded snapshot" : "Synthetic data"}</Badge>
          </div>
          <div className="q-ledger-balance">
            <span>Observed transfer value</span>
            <strong>{kzt(observedValue)}</strong>
            <small>
              {imported
                ? "One uploaded local day · calendar date not supplied"
                : "23 October 2026 · illustrative local day"}
            </small>
          </div>
          <dl className="q-ledger-facts">
            <div>
              <dt>Transfer records</dt>
              <dd>{fmt(graph.links.length)}</dd>
            </div>
            <div>
              <dt>Connected accounts</dt>
              <dd>{fmt(graph.nodes.length)}</dd>
            </div>
            <div>
              <dt>Selected for review</dt>
              <dd>
                {fmt(signalCount)}
                <span>signals</span>
              </dd>
            </div>
          </dl>
          <div className="q-ledger-entries">
            <span className="eyebrow">Snapshot entries</span>
            {graph.links.slice(0, 3).map((link) => (
              <div className="q-ledger-entry" key={link.id}>
                <span className="q-entry-symbol" aria-hidden="true">
                  <ArrowUpRight size={14} />
                </span>
                <div>
                  <strong>{link.id}</strong>
                  <span>
                    {link.source} → {link.target}
                  </span>
                </div>
                <strong>{kzt(link.amountKzt)}</strong>
              </div>
            ))}
            {!graph.links.length && (
              <p>No transfer records in this snapshot.</p>
            )}
          </div>
          <p className="q-ledger-disclaimer">
            Review signals are priorities for investigation, not findings of
            fraud or estimates of loss.
          </p>
        </aside>
      </section>
      <section className="q-purpose-lower">
        <div className="q-review-method">
          <span className="eyebrow">A considered workflow</span>
          <h2>
            From an indicator
            <br />
            to a reasoned record.
          </h2>
          <p>
            The analyst keeps ownership of the conclusion. Each step leaves the
            evidence in view.
          </p>
          {[
            {
              title: "Examine the evidence",
              text: "Inspect the exact inputs behind the score.",
              page: "review",
              icon: ScanLine,
            },
            {
              title: "Test the tradeoffs",
              text: "Compare review workload and known outcomes.",
              page: "policy",
              icon: SlidersHorizontal,
            },
            {
              title: "Record your decision",
              text: "Keep the context and explain the outcome.",
              page: "cases",
              icon: FileCheck2,
            },
          ].map((item) => (
            <button
              className="q-method-step"
              key={item.page}
              onClick={() => navigate(item.page)}
            >
              <span>
                <item.icon size={19} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <div className="q-relationship-preview">
          <div className="q-section-head">
            <div>
              <span className="eyebrow">Relationship view</span>
              <h2>Follow the recorded links.</h2>
            </div>
            <button
              className="q-quiet-link"
              onClick={() => navigate("network")}
            >
              Open network <ArrowUpRight size={15} />
            </button>
          </div>
          <NetworkModel graph={graph} compact />
        </div>
      </section>
      <section className="q-source">
        <div>
          <span className="eyebrow">The Kazakhstan context</span>
          <h2>
            A local problem.
            <br />A measured hypothesis.
          </h2>
        </div>
        <div>
          <p>
            Kazakhstan already has a national Anti-Fraud Center and established
            banking controls. Our hypothesis is that clearer evidence and case
            handling can improve an analyst’s review workflow. That needs
            measurement in a pilot.
          </p>
          <a
            href="https://nationalbank.kz/ru/news/informacionnye-soobshcheniya/18571"
            target="_blank"
            rel="noreferrer"
          >
            National Bank update · 4 February 2026 <ArrowUpRight size={15} />
          </a>
          <a
            href="https://npck.kz/tarify-antifrod-tsentr/"
            target="_blank"
            rel="noreferrer"
          >
            Existing Anti-Fraud Center analytics services{" "}
            <ArrowUpRight size={15} />
          </a>
          <small>
            This demonstration is not affiliated with a bank or regulator. It
            sends no payment instructions and makes no account restriction
            decisions.
          </small>
        </div>
      </section>
    </>
  );
}

function Atlas({
  evaluation,
  graph,
  selectedAccount,
  setSelectedAccount,
  openTransaction,
  toast,
  imported,
}) {
  const related = evaluation.scored.filter(
    (row) => row.sender === selectedAccount || row.receiver === selectedAccount,
  );
  return (
    <>
      <PageHead
        chapter="Transfer network"
        title="The transfer ledger."
        description="Read the records first. Use the relationship view to follow an account's connections."
      >
        <Badge>
          {imported ? "Uploaded snapshot" : "23 OCT 2026 · SYNTHETIC DAY"}
        </Badge>
      </PageHead>
      <div className="q-kpis">
        <Kpi
          label="Observed transfer value"
          value={kzt(evaluation.totalAmountKzt)}
          note={`${evaluation.scored.length} transfer records`}
        />
        <Kpi
          label="Selected for review"
          value={evaluation.alertCount}
          note="Threshold-based signals, not confirmed fraud"
        />
        <Kpi
          label="Value selected for review"
          value={kzt(evaluation.flaggedAmountKzt)}
          note="Not a loss or a prevented-loss estimate"
        />
        <Kpi
          label="Connected accounts"
          value={graph.nodes.length}
          note="Pseudonymous identifiers"
        />
      </div>
      <div className="q-atlas-layout">
        <section className="q-card q-atlas-ledger">
          <div className="q-section-head">
            <div>
              <span className="eyebrow">Recorded activity</span>
              <h2>{selectedAccount || "All accounts"}</h2>
            </div>
            <label className="q-field">
              <span>Select account</span>
              <select
                value={selectedAccount || ""}
                onChange={(event) => setSelectedAccount(event.target.value)}
              >
                <option value="">All accounts</option>
                {graph.nodes.map((node) => (
                  <option key={node.id}>{node.id}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="q-ledger-context">
            {selectedAccount
              ? `${related.length} transfers involving ${selectedAccount}. Clear the account filter to return to all records.`
              : `${evaluation.scored.length} recorded transfers. Select an account here or in the relationship view to narrow the ledger.`}
          </p>
          <TransactionTable
            rows={selectedAccount ? related : evaluation.scored}
            onSelect={openTransaction}
          />
        </section>
        <aside className="q-atlas-model">
          <div className="q-section-head">
            <div>
              <span className="eyebrow">Supporting view / 3D</span>
              <h2>Account relationships</h2>
            </div>
            <Network size={19} />
          </div>
          <NetworkModel
            graph={graph}
            selectedId={selectedAccount}
            onSelect={setSelectedAccount}
            toast={toast}
          />
        </aside>
      </div>
    </>
  );
}
function TransactionTable({ rows, onSelect, selectedId }) {
  return (
    <div className="q-table-wrap">
      <table className="q-table">
        <thead>
          <tr>
            <th>Transfer / time</th>
            <th>Route</th>
            <th>Amount · KZT</th>
            <th>Review score</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((row) => (
            <tr
              key={row.id}
              className={selectedId === row.id ? "q-row-active" : ""}
            >
              <td>
                <button
                  className="q-text-button"
                  onClick={() => onSelect(row.id)}
                >
                  {row.id}
                </button>
                <small>{clock(row.minute)}</small>
              </td>
              <td>
                {row.sender}
                <span className="q-route-arrow">→</span>
                {row.receiver}
              </td>
              <td>{kzt(row.amountKzt)}</td>
              <td>
                <Badge
                  type={
                    row.risk === "priority"
                      ? "danger"
                      : row.flagged
                        ? "warning"
                        : "neutral"
                  }
                >
                  {row.score} / 100
                </Badge>
              </td>
              <td>
                <button
                  className="q-icon-button"
                  onClick={() => onSelect(row.id)}
                  aria-label={`Inspect ${row.id}`}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && (
        <p className="q-muted">
          Showing the first 200 matching records. Narrow your search to inspect
          others.
        </p>
      )}
    </div>
  );
}
function Review({ evaluation, selectedId, onSelect, createCase, cases }) {
  const [query, setQuery] = useState(""),
    [flaggedOnly, setFlaggedOnly] = useState(!selectedId);
  const rows = evaluation.scored
    .filter(
      (row) =>
        (!flaggedOnly || row.flagged) &&
        `${row.id} ${row.sender} ${row.receiver}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.score - a.score || a.minute - b.minute);
  const row = rows.find((item) => item.id === selectedId) || rows[0];
  const alreadyOpen = row && hasOpenCase(cases, row);
  return (
    <>
      <PageHead
        chapter="Investigate / Signal review"
        title="Show your reasoning."
        description="A transparent review score. Every contribution has an input you can inspect."
      />
      <div className="q-split">
        <section className="q-list">
          <div className="q-controls">
            <label className="q-field q-search">
              <Search size={16} />
              <input
                aria-label="Search transactions"
                placeholder="Transfer or account ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="q-checkbox">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={(event) => setFlaggedOnly(event.target.checked)}
              />
              Review signals only
            </label>
          </div>
          <div className="q-section-head">
            <span>{rows.length} matching transfers</span>
            <span className="q-muted">Highest score first</span>
          </div>
          {rows.length ? (
            <TransactionTable
              rows={rows}
              selectedId={row?.id}
              onSelect={onSelect}
            />
          ) : (
            <div className="q-empty">
              <Search />
              <h3>No matching transfers.</h3>
              <p>Try another identifier or include routine transfers.</p>
            </div>
          )}
        </section>
        {row && (
          <aside className="q-detail">
            <span className="eyebrow">EVIDENCE DOSSIER / {row.id}</span>
            <div className="q-score">
              <strong>{row.score}</strong>
              <span>
                / 100
                <br />
                review priority score
              </span>
            </div>
            <p className="q-muted">
              A demonstration rule score, not a probability of fraud.
            </p>
            <h2>{kzt(row.amountKzt)}</h2>
            <div className="q-transfer-route">
              <span>{row.sender}</span>
              <ArrowRight size={18} />
              <span>{row.receiver}</span>
            </div>
            <p className="q-muted">
              Recorded time {clock(row.minute)} ·{" "}
              {row.dataMode === "synthetic"
                ? "Synthetic day"
                : "Uploaded local-day snapshot"}
            </p>
            <div className="q-evidence">
              {row.reasons.length ? (
                row.reasons.map((reason) => (
                  <div className="q-evidence-item" key={reason.code}>
                    <div>
                      <strong>{reason.title}</strong>
                      <p>{reason.detail}</p>
                    </div>
                    <span>+{reason.points}</span>
                  </div>
                ))
              ) : (
                <p>
                  No scoring rule is triggered. This does not establish that the
                  transfer is safe.
                </p>
              )}
            </div>
            <div className="q-notice">
              Check the customer’s context and the source records before
              assigning a cause. Related transfers may have legitimate
              explanations.
            </div>
            <Button
              primary
              disabled={alreadyOpen}
              onClick={() => createCase(row)}
            >
              {alreadyOpen ? (
                <>
                  <Check size={17} />
                  Case already open
                </>
              ) : (
                <>
                  <Plus size={17} />
                  Open review case
                </>
              )}
            </Button>
            <small className="q-muted">
              Creates a local review record. No payment or account action is
              sent.
            </small>
          </aside>
        )}
      </div>
    </>
  );
}

function Policy({ rows, policy, setPolicy, evaluation, toast }) {
  const [draft, setDraft] = useState(policy),
    [minutes, setMinutes] = useState(8),
    [analysts, setAnalysts] = useState(3);
  const candidate = useMemo(
    () => evaluatePolicy(rows, draft, { minutesPerReview: minutes, analysts }),
    [rows, draft, minutes, analysts],
  );
  const imported = rows.some((row) => row.dataMode !== "synthetic");
  return (
    <>
      <PageHead
        chapter="Policy / Decision thresholds"
        title="Make the tradeoff visible."
        description="Explore how a threshold changes the queue. Evaluate known labels separately from unknown outcomes."
      >
        <Button onClick={() => setDraft({ ...DEFAULT_POLICY })}>
          <RotateCcw size={16} />
          Reset draft
        </Button>
      </PageHead>
      <div className="q-grid-2">
        <section className="q-card">
          <span className="eyebrow">CANDIDATE POLICY</span>
          <h2>Set the review threshold.</h2>
          <div className="q-stack">
            <Slider
              label="Review threshold"
              min={0}
              max={100}
              value={draft.threshold}
              display={`${draft.threshold} / 100`}
              onChange={(value) => setDraft({ ...draft, threshold: value })}
            />
            <Slider
              label="Large transfer threshold"
              min={100000}
              max={2000000}
              step={50000}
              value={draft.amountThresholdKzt}
              display={kzt(draft.amountThresholdKzt)}
              onChange={(value) =>
                setDraft({ ...draft, amountThresholdKzt: value })
              }
            />
            <Slider
              label="Minutes per review"
              min={2}
              max={30}
              value={minutes}
              display={`${minutes} min`}
              onChange={setMinutes}
            />
            <Slider
              label="Available analysts"
              min={1}
              max={12}
              value={analysts}
              onChange={setAnalysts}
            />
          </div>
          <details>
            <summary>See the exact scoring rules</summary>
            <ul>
              <li>Amount at or above the amount threshold: +20.</li>
              <li>New payee: +15. New device: +25.</li>
              <li>
                At least {draft.velocityCount} sender transfers in the preceding{" "}
                {draft.windowMinutes} minutes, including the current transfer:
                +20.
              </li>
              <li>
                At least {draft.fanInCount} distinct senders to the receiver in
                the preceding {draft.fanInWindowMinutes} minutes: +20.
              </li>
              <li>
                Score capped at 100. Review when score ≥ threshold. Equal
                timestamps follow input order; future transfers are excluded.
              </li>
            </ul>
          </details>
          <Button
            primary
            onClick={() => {
              setPolicy(draft);
              toast(
                "Review policy applied locally. Existing case snapshots remain unchanged.",
              );
            }}
          >
            Apply to this workspace <ArrowRight size={17} />
          </Button>
        </section>
        <section className="q-card">
          <span className="eyebrow">REVIEW CAPACITY</span>
          <div className="q-policy-compare">
            <div>
              <span>Current policy</span>
              <strong>{evaluation.alertCount}</strong>
              <small>signals</small>
            </div>
            <ArrowRight />
            <div>
              <span>Candidate</span>
              <strong>{candidate.alertCount}</strong>
              <small>signals</small>
            </div>
          </div>
          <div className="q-kpis">
            <Kpi
              label="Analyst time"
              value={`${fmt(candidate.reviewHours, 1)} h`}
              note="Total effort at the chosen minutes per review"
            />
            <Kpi
              label="Team elapsed time"
              value={`${fmt(candidate.teamHours, 1)} h`}
              note="Assumes evenly shared work; excludes overhead"
            />
          </div>
          <p className="q-muted">
            Value selected for review:{" "}
            <strong>{kzt(candidate.flaggedAmountKzt)}</strong>. This is
            transaction value, not a loss estimate.
          </p>
          <div className="q-notice">
            A more selective queue can miss more labeled events. A larger queue
            can increase unnecessary review. This dataset cannot establish
            real-world effectiveness.
          </div>
        </section>
      </div>
      <section className="q-card">
        <div className="q-section-head">
          <div>
            <span className="eyebrow">
              {imported
                ? "USER-SUPPLIED OUTCOMES"
                : "SEEDED SYNTHETIC OUTCOMES"}
            </span>
            <h2>Keep the misses in view.</h2>
          </div>
          <Badge>
            {candidate.knownCount} known / {candidate.unknownCount} unknown
          </Badge>
        </div>
        <div className="q-confusion">
          {[
            ["tp", "Flagged · labeled fraud"],
            ["fp", "Flagged · labeled legitimate"],
            ["fn", "Not flagged · labeled fraud"],
            ["tn", "Not flagged · labeled legitimate"],
          ].map(([key, label]) => (
            <div className={`q-confusion-cell ${key}`} key={key}>
              <strong>{candidate.confusion[key]}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="q-kpis">
          <Kpi
            label="Precision on known labels"
            value={pct(candidate.precision)}
            note="Labeled fraud among flagged known outcomes"
          />
          <Kpi
            label="Recall on known labels"
            value={pct(candidate.recall)}
            note="Flagged events among all labeled fraud"
          />
          <Kpi
            label="Unknown outcomes flagged"
            value={candidate.unknownAlertCount}
            note="Excluded from precision and recall"
          />
        </div>
        <p className="q-muted">
          {imported
            ? "Uploaded outcome labels are unverified and are not inferred by QALQAN."
            : "These outcomes were assigned to demonstration scenarios. These figures are not a bank performance benchmark."}{" "}
          A dash means the denominator is zero.
        </p>
      </section>
    </>
  );
}

function CaseCard({ item, updateCase }) {
  const [note, setNote] = useState(""),
    [disposition, setDisposition] = useState("inconclusive"),
    [error, setError] = useState("");
  function closeCase() {
    if (note.trim().length < 12) {
      setError(
        "Add at least 12 characters explaining what was reviewed and why.",
      );
      return;
    }
    setError("");
    updateCase(item.id, "closed", note.trim(), disposition);
    setNote("");
  }
  return (
    <article className="q-case">
      <div className="q-section-head">
        <span className="eyebrow">
          {item.id.slice(0, 8)} / {item.transactionId}
        </span>
        <Badge
          type={
            item.status === "closed"
              ? "success"
              : item.status === "investigating"
                ? "warning"
                : "neutral"
          }
        >
          {item.status}
        </Badge>
      </div>
      <h2>{item.title}</h2>
      <p>{item.summary}</p>
      <small className="q-muted">
        Created from {item.dataMode} data · policy threshold{" "}
        {item.policyThreshold} · score {item.score}
      </small>
      <div className="q-timeline">
        {item.events.map((event, index) => (
          <div className="q-step" key={`${event.at}-${index}`}>
            <Clock3 size={13} />
            <div>
              <p>{event.text}</p>
              <time>{new Date(event.at).toLocaleString("en-GB")}</time>
            </div>
          </div>
        ))}
      </div>
      {item.status === "review" && (
        <Button
          onClick={() =>
            updateCase(item.id, "investigating", "Review started.")
          }
        >
          Start investigation <ArrowRight size={16} />
        </Button>
      )}
      {item.status === "investigating" && (
        <div className="q-stack">
          <label className="q-field">
            <span>Review outcome</span>
            <select
              value={disposition}
              onChange={(event) => setDisposition(event.target.value)}
            >
              <option value="inconclusive">
                Inconclusive — more evidence needed
              </option>
              <option value="escalation-recommended">
                Escalation recommended
              </option>
              <option value="no-further-review">
                No further review recommended
              </option>
            </select>
          </label>
          <label className="q-field">
            <span>Evidence and reasoning</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Record the evidence checked and the reason for your outcome."
            />
          </label>
          {error && (
            <p role="alert" className="q-error">
              {error}
            </p>
          )}
          <Button primary onClick={closeCase}>
            Record outcome & close <Check size={16} />
          </Button>
        </div>
      )}
      {item.status === "closed" && (
        <Button
          onClick={() =>
            updateCase(
              item.id,
              "investigating",
              "Case reopened for additional review.",
            )
          }
        >
          Reopen review
        </Button>
      )}
    </article>
  );
}
function Cases({ cases, updateCase }) {
  const [filter, setFilter] = useState("all");
  const shown = cases.filter(
    (item) => filter === "all" || item.status === filter,
  );
  return (
    <>
      <PageHead
        chapter="Journal / Review records"
        title="A decision deserves a record."
        description="Keep the evidence, reasoning and review sequence together. This journal stays in this browser."
      >
        <Button
          disabled={!cases.length}
          onClick={() =>
            download(
              JSON.stringify(
                {
                  product: "QALQAN",
                  kind: "local-review-records",
                  exportedAt: new Date().toISOString(),
                  cases,
                },
                null,
                2,
              ),
              "qalqan-case-journal.json",
              "application/json",
            )
          }
        >
          <Download size={16} />
          Export journal
        </Button>
      </PageHead>
      <div className="q-tabs">
        {["all", "review", "investigating", "closed"].map((status) => (
          <button
            className={`q-tab ${filter === status ? "active" : ""}`}
            key={status}
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "All cases" : status}{" "}
            <span>
              {
                cases.filter(
                  (item) => status === "all" || item.status === status,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="q-grid-2">
          {shown.map((item) => (
            <CaseCard
              key={`${item.id}-${item.status}`}
              item={item}
              updateCase={updateCase}
            />
          ))}
        </div>
      ) : (
        <div className="q-empty">
          <Files size={40} />
          <h2>A clear journal.</h2>
          <p>Open a case from Signal review to begin.</p>
        </div>
      )}
      <p className="q-model-note">
        This local journal is editable browser data, not an immutable audit log
        or an authenticated approval system. A recorded recommendation sends
        nothing to a bank or regulator.
      </p>
    </>
  );
}

function DataRoom({ rows, applyRows, toast }) {
  const [text, setText] = useState(""),
    [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const imported = rows.some((row) => row.dataMode !== "synthetic");
  const template =
    "id,sender,receiver,amountKzt,minute,newPayee,newDevice,outcome\nEX-001,AC-001,AC-002,150000,540,true,false,unknown\nEX-002,AC-002,AC-003,75000,548,false,true,unknown\n";
  async function upload(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setResult({
        transactions: [],
        errors: ["Maximum file size is 2 MB."],
        warnings: [],
      });
      return;
    }
    try {
      const value = await file.text();
      setText(value);
      setResult(parseTransactionCSV(value));
    } catch {
      setResult({
        transactions: [],
        errors: ["The file could not be read."],
        warnings: [],
      });
    }
  }
  return (
    <>
      <PageHead
        chapter="Data / Snapshot workspace"
        title="Know what you are looking at."
        description="Import pseudonymous transfers from one local-day snapshot. Validate before applying."
      >
        <Button
          onClick={() =>
            download(
              exportTransactionsCSV(rows),
              "qalqan-transfers.csv",
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download size={16} />
          Export current data
        </Button>
      </PageHead>
      <div className="q-kpis">
        <Kpi
          label="Active records"
          value={rows.length}
          note={
            imported ? "Uploaded snapshot" : "Seeded demonstration portfolio"
          }
        />
        <Kpi
          label="Data source"
          value={imported ? "Imported" : "Synthetic"}
          note="No bank connection"
        />
        <Kpi
          label="Storage"
          value="Session"
          note="Imported transfers are cleared on reload"
        />
      </div>
      <div className="q-grid-2">
        <section className="q-card">
          <h2>Bring the evidence in.</h2>
          <p className="q-muted">
            Use pseudonymous identifiers. Importing does not verify the source
            or the outcome labels.
          </p>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".csv,text/csv"
            aria-label="Upload transaction CSV"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button onClick={() => fileRef.current?.click()}>
            <Plus size={17} />
            Choose CSV · max 2 MB
          </Button>
          <label className="q-field">
            <span>Or paste CSV content</span>
            <textarea
              rows={7}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setResult(null);
              }}
              placeholder={template}
            />
          </label>
          <div className="q-actions">
            <Button
              primary
              disabled={!text.trim()}
              onClick={() => setResult(parseTransactionCSV(text))}
            >
              Validate snapshot <ArrowRight size={16} />
            </Button>
            <Button
              onClick={() =>
                download(
                  template,
                  "qalqan-template.csv",
                  "text/csv;charset=utf-8",
                )
              }
            >
              Get template
            </Button>
          </div>
          {result && (
            <div
              className={`q-notice ${result.errors.length ? "error" : ""}`}
              role="status"
            >
              <strong>
                {result.errors.length
                  ? "Import needs attention. Nothing applied."
                  : `${result.transactions.length} transfers validated.`}
              </strong>
              {result.errors.length > 0 && (
                <ul>
                  {result.errors.slice(0, 12).map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              )}
              {result.warnings.length > 0 && (
                <ul>
                  {result.warnings.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              )}
              {!result.errors.length && result.transactions.length > 0 && (
                <Button
                  primary
                  onClick={() => {
                    applyRows(result.transactions);
                    toast(
                      `${result.transactions.length} validated transfers applied. Existing cases keep their original evidence snapshot.`,
                    );
                  }}
                >
                  Apply {result.transactions.length} transfers
                </Button>
              )}
            </div>
          )}
        </section>
        <section className="q-card">
          <span className="eyebrow">SNAPSHOT CONTRACT</span>
          <h2>A small, explicit schema.</h2>
          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["id", "Unique transfer identifier"],
                  ["sender / receiver", "Pseudonymous account identifiers"],
                  ["amountKzt", "Positive KZT amount, at most two decimals"],
                  ["minute", "Minute of one local day: 0–1440"],
                  ["newPayee / newDevice", "Optional true/false indicators"],
                  ["outcome", "Optional fraud / legitimate / unknown label"],
                ].map(([column, definition]) => (
                  <tr key={column}>
                    <td>{column}</td>
                    <td>{definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            First five columns are required. At most 2,000 records. No cross-day
            or cross-currency inference. Missing indicators are treated as
            absent evidence; missing outcomes stay unknown.
          </p>
          <p className="q-muted">
            Row order breaks equal-time ties. History outside the uploaded
            snapshot is unknown. Layout coordinates and motion in the 3D atlas
            are illustrative.
          </p>
          <Button
            disabled={!imported}
            onClick={() => {
              applyRows(DEMO_TRANSACTIONS);
              setResult(null);
              setText("");
              toast("Synthetic demonstration transfers restored.");
            }}
          >
            <RotateCcw size={16} />
            Restore demonstration data
          </Button>
        </section>
      </div>
      {result && !result.errors.length && result.transactions.length > 0 && (
        <section className="q-card">
          <h2>Validated preview</h2>
          <p className="q-muted">
            First {Math.min(10, result.transactions.length)} rows before
            scoring.
          </p>
          <div className="q-table-wrap">
            <table className="q-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Sender</th>
                  <th>Receiver</th>
                  <th>KZT</th>
                  <th>Time</th>
                  <th>Outcome label</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.slice(0, 10).map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{row.sender}</td>
                    <td>{row.receiver}</td>
                    <td>{fmt(row.amountKzt, 2)}</td>
                    <td>{clock(row.minute)}</td>
                    <td>{row.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function App() {
  const [page, setPage] = useState(() =>
    NAV.some((item) => item.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "purpose",
  );
  const [rows, setRows] = useState(DEMO_TRANSACTIONS),
    [policy, setPolicy] = useState({ ...DEFAULT_POLICY }),
    [selectedId, setSelectedId] = useState(null),
    [selectedAccount, setSelectedAccount] = useState(null),
    [cases, setCases] = useState(readCases),
    [sessionOnly, setSessionOnly] = useState(false),
    [message, setMessage] = useState("");
  const evaluation = useMemo(
    () => evaluatePolicy(rows, policy),
    [rows, policy],
  );
  const graph = useMemo(() => buildGraph(evaluation.scored), [evaluation]);
  const imported = rows.some((row) => row.dataMode !== "synthetic");
  const openCount = cases.filter((item) => item.status !== "closed").length;
  function navigate(next) {
    location.hash = next;
    setPage(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const change = () => {
      const next = location.hash.slice(1);
      if (NAV.some((item) => item.id === next)) setPage(next);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(timer);
  }, [message]);
  function saveCases(next) {
    setCases(next);
    try {
      localStorage.setItem(CASE_KEY, JSON.stringify(next));
      setSessionOnly(false);
      return true;
    } catch {
      setSessionOnly(true);
      return false;
    }
  }
  function createCase(row) {
    if (hasOpenCase(cases, row)) {
      setMessage("An open review already exists for this transfer.");
      navigate("cases");
      return;
    }
    const at = new Date().toISOString();
    const item = {
      id: crypto.randomUUID(),
      transactionId: row.id,
      recordKey: recordKey(row),
      title: `${row.sender} → ${row.receiver}`,
      summary: `${kzt(row.amountKzt)} at ${clock(row.minute)}. ${row.reasons.map((reason) => reason.title).join("; ") || "Manual review requested."}`,
      score: row.score,
      policyThreshold: policy.threshold,
      dataMode: row.dataMode,
      status: "review",
      snapshot: row,
      events: [{ at, text: "Local case opened. No payment instruction sent." }],
    };
    const stored = saveCases([item, ...cases]);
    setMessage(
      stored
        ? "Review case saved in this browser."
        : "Case created for this session. Browser storage is unavailable.",
    );
    navigate("cases");
  }
  function updateCase(id, status, note, disposition) {
    const stored = saveCases(
      cases.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
              ...(disposition ? { disposition } : {}),
              events: [
                ...item.events,
                {
                  at: new Date().toISOString(),
                  text: disposition ? `${disposition}: ${note}` : note,
                },
              ],
            }
          : item,
      ),
    );
    setMessage(
      stored
        ? "Local review record updated."
        : "Updated for this session. Browser storage is unavailable.",
    );
  }
  function openTransaction(id) {
    setSelectedId(id);
    navigate("review");
  }
  function applyRows(next) {
    setRows(next);
    setSelectedId(null);
    setSelectedAccount(null);
  }
  return (
    <div className="q-app">
      <a className="q-skip" href="#main-content">
        Skip to content
      </a>
      <header className="q-masthead">
        <button
          className="q-brand"
          onClick={() => navigate("purpose")}
          aria-label="QALQAN purpose"
        >
          <span className="q-brand-mark">Q</span>
          Qalqan
        </button>
        <span className="q-brand-descriptor">
          Analyst workspace<span>Fraud review intelligence</span>
        </span>
        <div className="q-masthead-meta">
          <span>KAZAKHSTAN · KZT</span>
          <Badge>{imported ? "Uploaded snapshot" : "Demonstration data"}</Badge>
        </div>
      </header>
      <nav className="q-nav" aria-label="Main navigation">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={page === item.id ? "active" : ""}
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            {item.icon && <item.icon size={15} aria-hidden="true" />}
            {item.label}
            {item.id === "cases" && openCount > 0 && (
              <span className="q-nav-count">{openCount}</span>
            )}
          </button>
        ))}
      </nav>
      <main className="q-main" id="main-content">
        <div className="q-body">
          {sessionOnly && (
            <div className="q-notice error" role="status">
              Browser storage is unavailable. Case changes will be lost when
              this page closes.
            </div>
          )}
          {page === "purpose" && (
            <Purpose navigate={navigate} graph={graph} imported={imported} />
          )}
          {page === "network" && (
            <Atlas
              evaluation={evaluation}
              graph={graph}
              selectedAccount={selectedAccount}
              setSelectedAccount={setSelectedAccount}
              openTransaction={openTransaction}
              toast={setMessage}
              imported={imported}
            />
          )}
          {page === "review" && (
            <Review
              evaluation={evaluation}
              selectedId={selectedId}
              onSelect={setSelectedId}
              createCase={createCase}
              cases={cases}
            />
          )}
          {page === "policy" && (
            <Policy
              rows={rows}
              policy={policy}
              setPolicy={setPolicy}
              evaluation={evaluation}
              toast={setMessage}
            />
          )}
          {page === "cases" && <Cases cases={cases} updateCase={updateCase} />}
          {page === "data" && (
            <DataRoom rows={rows} applyRows={applyRows} toast={setMessage} />
          )}
          {page === "geography" && (
            <Suspense fallback={<p>Loading geographic map…</p>}>
              <Geography kind="banking" />
            </Suspense>
          )}
        </div>
      </main>
      <footer className="q-footer">
        <strong>Qalqan</strong>
        <span>Evidence before conclusions.</span>
        <small>
          Independent demonstration · No bank connection · No payment control
        </small>
      </footer>
      {message && (
        <div className="q-toast" role="status">
          <span>{message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
