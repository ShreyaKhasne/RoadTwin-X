import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlertTriangle, ArrowDownToLine, BarChart3, Bot, Building2, Check, ChevronDown,
  CircleHelp, CloudDownload, Database, Download, Gauge, Layers3, Map, Pause, Play,
  RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles,
  StepForward, TrafficCone, TriangleAlert, Upload, Waypoints, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./services/api";
import { TrafficScene } from "./scene/TrafficScene";
import { selectedPlan, useRoadTwin } from "./store/useRoadTwin";
import type { Experiment, Road, RoadNetwork } from "./types";

const DEFAULT_OBJECTIVE = "Reduce average vehicle delay by at least 30%, without increasing the pedestrian-conflict risk proxy, and remain within the configured budget.";
const money = (value: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
const number = (value: number, digits = 1) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);

type Visibility = { vehicles: boolean; pedestrians: boolean; signals: boolean; buildings: boolean };

export default function App() {
  const {
    network, setNetwork, selectedRoad, playing, setPlaying, simulationTime,
    speed, setSpeed, view, setView, tab, setTab, experiment, setExperiment, reports,
    setReports, setScenarios, selectedCandidate, setSelectedCandidate,
    busy, setBusy, error, setError,
  } = useRoadTwin();
  const [objectiveText, setObjectiveText] = useState(DEFAULT_OBJECTIVE);
  const [budget, setBudget] = useState(30000);
  const [targetReduction, setTargetReduction] = useState(30);
  const [riskIncrease, setRiskIncrease] = useState(0);
  const [visibility, setVisibility] = useState<Visibility>({ vehicles: true, pedestrians: true, signals: true, buildings: true });
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    let active = true;
    api.getNetwork()
      .then((value) => { if (active) setNetwork(value); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    api.getReports()
      .then((value) => { if (active) setReports(value); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    api.getScenarios()
      .then((value) => { if (active) setScenarios(value); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [setNetwork, setReports, setScenarios, setError]);

  const chosenRoad = network?.roads.find((road) => road.id === selectedRoad) ?? network?.roads[0];
  const baseline = experiment?.baseline.metrics;
  const recommended = useMemo(
    () => experiment ? selectedPlan(experiment.candidates, selectedCandidate) : null,
    [experiment, selectedCandidate],
  );
  const sceneNetwork = useMemo(() => {
    if (!network || !experiment || !selectedCandidate) return network;
    const plan = selectedPlan(experiment.candidates, selectedCandidate);
    if (!plan) return network;
    const next = structuredClone(network);
    const target = String(plan.parameters.target_approach ?? "east");
    const bonus = Number(plan.parameters.green_bonus_s ?? 0);
    if ((plan.kind === "signal" || plan.kind === "combined") && next.signal.green_s[target] !== undefined) {
      const green = next.signal.green_s;
      const donors = Object.keys(green).filter((key) => key !== target);
      const transferable = Math.min(bonus, donors.reduce((sum, key) => sum + Math.max(0, green[key] - 8), 0));
      const available = Math.max(1, donors.reduce((sum, key) => sum + Math.max(0, green[key] - 8), 0));
      green[target] += transferable;
      donors.forEach((key) => { green[key] -= Math.min(Math.max(0, green[key] - 8), transferable * Math.max(0, green[key] - 8) / available); });
    }
    if (plan.kind === "obstruction" || plan.kind === "combined") {
      const approach = String(plan.parameters.clear_approach ?? target);
      next.obstructions[approach] = 0;
    }
    if (plan.kind === "capacity") {
      const road = next.roads.find((item) => item.id === target);
      if (road) road.lanes = Math.min(5, road.lanes + 1);
    }
    if (plan.kind === "pedestrian" && next.signal.green_s[target] !== undefined) {
      next.signal.green_s[target] = Math.max(8, next.signal.green_s[target] - Number(plan.parameters.vehicle_green_reduction_s ?? 3));
    }
    return next;
  }, [network, experiment, selectedCandidate]);
  const clock = `${String(Math.floor(simulationTime / 60)).padStart(2, "0")}:${String(Math.floor(simulationTime % 60)).padStart(2, "0")}`;

  const updateRoad = (field: "lanes" | "speed_kmh", value: number) => {
    if (!network) return;
    const updated = {
      ...network,
      roads: network.roads.map((road) => road.id === selectedRoad ? { ...road, [field]: value } : road),
    };
    setNetwork(updated);
    api.updateNetwork(updated).catch((reason: Error) => setError(reason.message));
  };

  const importNetwork = async (file: File): Promise<boolean> => {
    if (!network) return false;
    try {
      const text = await file.text();
      const imported = parseNetworkFile(file.name, text, network);
      const saved = await api.updateNetwork(imported);
      setNetwork(saved);
      setError(null);
      setSavedMessage(`Imported ${saved.roads.length} road approaches`);
      window.setTimeout(() => setSavedMessage(""), 3500);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Network import failed");
      return false;
    }
  };

  const exportNetwork = (format: "json" | "csv" | "geojson") => {
    if (!network) return;
    let content: string;
    let type: string;
    if (format === "csv") {
      const headers = ["id", "label", "length_m", "lanes", "speed_kmh", "demand_vph", "pedestrian_flow", "risk_factor", "condition"];
      content = [headers.join(","), ...network.roads.map((road) => headers.map((key) => csvEscape(String(road[key as keyof Road]))).join(","))].join("\n");
      type = "text/csv";
    } else if (format === "geojson") {
      const featureOffsets: Record<string, [number, number]> = { north: [0, 0.0012], south: [0, -0.0012], east: [0.0012, 0], west: [-0.0012, 0] };
      const features = network.roads.map((road) => {
        const [dx, dy] = featureOffsets[road.id] ?? [0, 0];
        return {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[77.2, 28.6], [77.2 + dx, 28.6 + dy]] },
          properties: { ...road, synthetic: true, coordinate_note: "Fictional demonstration coordinates; not surveyed." },
        };
      });
      content = JSON.stringify({ type: "FeatureCollection", name: network.name, features }, null, 2);
      type = "application/geo+json";
    } else {
      content = JSON.stringify(network, null, 2);
      type = "application/json";
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = `${network.id}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const runExperiments = async () => {
    if (!network) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.runExperiment(network, {
        text: objectiveText,
        budget,
        target_delay_reduction_pct: targetReduction,
        max_risk_increase_pct: riskIncrease,
        weights: {
          delay: 0.35,
          queue: 0.15,
          travel_time: 0.15,
          throughput: 0.15,
          pedestrian_risk: 0.15,
          cost: 0.05,
        },
      }, network.seed);
      setExperiment(result);
      setSelectedCandidate(result.recommendation.candidate_id);
      setTab("experiments");
      const [savedScenarios, savedReports] = await Promise.all([api.getScenarios(), api.getReports()]);
      setScenarios(savedScenarios);
      setReports(savedReports);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Experiment request failed");
    } finally {
      setBusy(false);
    }
  };

  const saveReport = async () => {
    if (!experiment) return;
    try {
      const report = await api.saveReport(experiment);
      const nextReports = await api.getReports();
      setReports(nextReports);
      setSavedMessage(`Report saved · ${report.id.slice(0, 8)}`);
      window.setTimeout(() => setSavedMessage(""), 3500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save report");
    }
  };

  const exportReport = async (id?: string) => {
    const targetId = id ?? (reports[0]?.id);
    if (!targetId) {
      setError("Save an experiment report before exporting.");
      return;
    }
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api"}/reports/${targetId}`);
      if (!response.ok) throw new Error(`Report export failed (${response.status})`);
      const data = await response.json();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data.payload, null, 2)], { type: "application/json" }));
      link.download = `roadtwin-report-${targetId.slice(0, 8)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export report");
    }
  };

  const toggleVisibility = (key: keyof Visibility) =>
    setVisibility((current) => ({ ...current, [key]: !current[key] }));

  if (!network || !sceneNetwork) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">R<span>X</span></div>
        <p>CONNECTING TO ROADTWIN CORE</p>
        <div className="loading-line" />
        {error && <div className="connection-error"><TriangleAlert size={16} />{error}</div>}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">R<span>X</span></div>
          <div><strong>ROADTWIN <em>X</em></strong><small>AI ROAD INTERVENTION ENGINEER</small></div>
        </div>
        <div className="project-breadcrumb"><span>DEMO NETWORK</span><ChevronDown size={13} /><b>{network.name}</b><i>SYNTHETIC DATA</i></div>
        <nav className="main-nav" aria-label="Main navigation">
          {(["workbench", "experiments", "analytics", "reports", "data"] as const).map((item) => (
            <button key={item} className={tab === item ? "nav-active" : ""} onClick={() => setTab(item)}>
              {item === "workbench" ? "Workbench" : item === "experiments" ? "Experiments" : item === "analytics" ? "Analytics" : item === "reports" ? "Reports" : "Data"}
              {item === "experiments" && experiment && <span className="nav-count">{experiment.candidates.length}</span>}
            </button>
          ))}
        </nav>
        <div className="top-status"><span className="status-dot" /> SYSTEM ONLINE <b>v1.0.0</b></div>
        <button className="icon-button help-button" aria-label="About this model" title="This is a synthetic, uncalibrated demonstration"><CircleHelp size={16} /></button>
      </header>

      {error && <div className="error-banner"><AlertTriangle size={15} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={15} /></button></div>}

      <div className="workspace">
        <aside className="tool-rail" aria-label="Scene tools">
          <div className="rail-group">
            <button className="rail-button active" title="Select road"><Map size={18} /><span>SELECT</span></button>
            <button className="rail-button" title="Road network and data" onClick={() => setTab("data")}><Waypoints size={18} /><span>NETWORK</span></button>
            <button className="rail-button" title="Interventions" onClick={() => setTab("experiments")}><SlidersHorizontal size={18} /><span>PLAN</span></button>
          </div>
          <div className="rail-divider" />
          <div className="rail-group">
            <button className={`rail-button ${visibility.vehicles ? "active-soft" : ""}`} title="Toggle vehicles" onClick={() => toggleVisibility("vehicles")}><TrafficCone size={17} /><span>TRAFFIC</span></button>
            <button className={`rail-button ${visibility.pedestrians ? "active-soft" : ""}`} title="Toggle pedestrians" onClick={() => toggleVisibility("pedestrians")}><Activity size={17} /><span>WALKERS</span></button>
            <button className={`rail-button ${visibility.signals ? "active-soft" : ""}`} title="Toggle signals" onClick={() => toggleVisibility("signals")}><Gauge size={17} /><span>SIGNALS</span></button>
            <button className={`rail-button ${visibility.buildings ? "active-soft" : ""}`} title="Toggle buildings" onClick={() => toggleVisibility("buildings")}><Building2 size={17} /><span>CONTEXT</span></button>
          </div>
          <div className="rail-bottom"><Layers3 size={17} /><span>LAYERS</span></div>
        </aside>

        <main className="main-content">
          {tab === "reports" ? (
            <ReportsView reports={reports} onExport={exportReport} />
          ) : tab === "data" ? (
            <DataManager network={network} onImport={importNetwork} onExport={exportNetwork} />
          ) : tab === "analytics" ? (
            <AnalyticsView experiment={experiment} />
          ) : (
            <>
              <div className="scene-heading">
                <div><span className="eyebrow">LIVE DIGITAL TWIN / INTERSECTION 01</span><h1>{network.name}</h1><p>4 APPROACHES <b>·</b> SIGNALIZED <b>·</b> PEAK DEMAND SCENARIO</p></div>
                <div className="scene-heading-right">
                  <div className="live-pill"><span className="status-dot" />{playing ? "LIVE SIMULATION" : "SIMULATION PAUSED"}</div>
                  <button className="scene-action" onClick={() => void runExperiments()} disabled={busy}><Sparkles size={14} /> AI EXPERIMENT</button>
                </div>
              </div>

              <div className="workbench-grid">
                <section className="viewport-panel" aria-label="Interactive 3D road simulation">
                  <div className="viewport-topline"><span><i className="crosshair">⌖</i> LIVE SCENE <b>/</b> SCHOOL GATE</span><span className="scene-coords">28°36' N&nbsp; 77°12' E <b>DEMO COORDINATES</b></span></div>
                  <div className="viewport-canvas">
                    <TrafficScene network={sceneNetwork} visibility={visibility} />
                    <div className="scene-overlay top-left">
                      <span className="overlay-tag"><span className="status-dot" />{playing ? "RECORDING" : "STANDBY"}</span>
                      <span>SIM TIME <b>{clock}</b></span>
                    </div>
                    <div className="scene-overlay top-right"><span>CAMERA</span>{(["iso", "top", "street"] as const).map((name) => <button key={name} className={view === name ? "camera-active" : ""} onClick={() => setView(name)}>{name === "iso" ? "ISO" : name === "top" ? "TOP" : "EYE"}</button>)}</div>
                    <div className="scene-legend"><span><i className="legend-dot green" /> FLOWING</span><span><i className="legend-dot amber" /> QUEUING</span><span><i className="legend-dot red" /> HIGH RISK</span></div>
                    <div className="scene-crosshair">N <span>▲</span></div>
                  </div>
                  <div className="scene-footer"><span><span className="status-dot" /> 3D ENGINE READY</span><span>ORBIT · PAN · ZOOM <b>DRAG TO EXPLORE</b></span><button onClick={() => setView("iso")}><RotateCcw size={13} /> RESET CAMERA</button></div>
                  <Timeline playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} clock={clock} simulationTime={simulationTime} />
                </section>

                <aside className="inspector-panel">
                  <div className="panel-tabs"><button className={tab === "workbench" ? "selected" : ""} onClick={() => setTab("workbench")}>INSPECTOR</button><button className={tab === "experiments" ? "selected" : ""} onClick={() => setTab("experiments")}>AI ANALYSIS{experiment && <span className="tiny-badge">{experiment.recommendation.feasible_count}</span>}</button></div>
                  <div className="inspector-scroll">
                    <section className="inspector-section">
                      <div className="section-label"><span>SELECTED ROAD</span><span className="selection-chip"><span className="selection-dot" /> LIVE OBJECT</span></div>
                      {chosenRoad ? <RoadInspector road={chosenRoad} metrics={experiment?.baseline.road_metrics[chosenRoad.id]} onChange={updateRoad} /> : <p className="muted">Select an approach in the viewport.</p>}
                    </section>

                    <section className="inspector-section">
                      <div className="section-label"><span>SIMULATION KPIs</span><span className="small-live"><span className="status-dot" />{experiment ? "LATEST RUN" : "AWAITING RUN"}</span></div>
                      <div className="kpi-grid">
                        <Kpi label="AVG. DELAY" value={baseline ? `${number(baseline.average_delay_s)}s` : "—"} unit={baseline ? "PER VEHICLE" : "RUN AN EXPERIMENT"} />
                        <Kpi label="MAX QUEUE" value={baseline ? `${number(baseline.max_queue_vehicles, 0)}` : "—"} unit="VEHICLES" accent="amber" />
                        <Kpi label="THROUGHPUT" value={baseline ? number(baseline.throughput_vph, 0) : "—"} unit="VEH / HOUR" />
                        <Kpi label="SAFETY PROXY" value={baseline ? number(baseline.pedestrian_conflict_proxy) : "—"} unit="RELATIVE EXPOSURE" accent="cyan" />
                      </div>
                    </section>

                    <section className="ai-section">
                      <div className="section-label"><span><Bot size={14} /> EXPERIMENT DESIGNER</span><span className="local-tag">LOCAL ENGINE</span></div>
                      <label className="field-label" htmlFor="objective">OBJECTIVE</label>
                      <textarea id="objective" value={objectiveText} onChange={(event) => setObjectiveText(event.target.value)} rows={3} />
                      <div className="constraint-row">
                        <label><span>BUDGET CAP</span><div className="money-field"><span>₹</span><input type="number" min={0} step={1000} value={budget} onChange={(event) => setBudget(Number(event.target.value))} /></div></label>
                        <label><span>DELAY TARGET</span><div className="percent-field"><input type="number" min={0} max={100} value={targetReduction} onChange={(event) => setTargetReduction(Number(event.target.value))} /><i>%</i></div></label>
                      </div>
                      <label className="range-label"><span>MAX RISK INCREASE <b>{riskIncrease}%</b></span><input type="range" min="0" max="30" value={riskIncrease} onChange={(event) => setRiskIncrease(Number(event.target.value))} /></label>
                      <button className="primary-button" onClick={() => void runExperiments()} disabled={busy}>
                        {busy ? <><span className="spinner" /> SIMULATING 5 COUNTERFACTUALS</> : <><Sparkles size={15} /> GENERATE & SIMULATE <span>↗</span></>}
                      </button>
                      <div className="ai-footnote"><ShieldCheck size={13} /> Hard constraints filter candidates before ranking.</div>
                    </section>

                    <AnimatePresence>
                      {recommended && experiment && (
                        <motion.section className="recommendation-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                          <div className="recommendation-top"><span><Sparkles size={13} /> RECOMMENDATION</span><span className={recommended.feasible ? "feasible" : "not-feasible"}>{recommended.feasible ? "FEASIBLE" : "NO FEASIBLE PLAN"}</span></div>
                          <h3>{recommended.feasible ? recommended.name : "Closest alternative"}</h3>
                          <p>{experiment.recommendation.explanation}</p>
                          <div className="recommendation-metrics"><div><span>DELAY CHANGE</span><b className={recommended.delay_reduction_pct >= 0 ? "positive" : "negative"}>{recommended.delay_reduction_pct > 0 ? "−" : "+"}{Math.abs(recommended.delay_reduction_pct)}%</b></div><div><span>EST. COST</span><b>{money(recommended.cost)}</b></div><div><span>RISK CHANGE</span><b>{recommended.risk_change_pct > 0 ? "+" : ""}{number(recommended.risk_change_pct)}%</b></div></div>
                          <button className="save-report-button" onClick={() => void saveReport()}><Save size={14} /> SAVE EVIDENCE REPORT</button>
                          <button className="baseline-replay-button" onClick={() => setSelectedCandidate(null)}>REPLAY BASELINE SCENE</button>
                          {savedMessage && <div className="saved-message"><Check size={13} />{savedMessage}</div>}
                        </motion.section>
                      )}
                    </AnimatePresence>
                    {experiment && !experiment.recommendation.candidate_id && (
                      <section className="recommendation-card no-recommendation">
                        <div className="recommendation-top"><span><TriangleAlert size={13} /> CONSTRAINT CHECK</span><span className="not-feasible">NO FEASIBLE PLAN</span></div>
                        <h3>Objective not met</h3>
                        <p>{experiment.recommendation.explanation}</p>
                        <button className="save-report-button" onClick={() => void saveReport()}><Save size={14} /> SAVE INFEASIBILITY EVIDENCE</button>
                      </section>
                    )}
                  </div>
                </aside>
              </div>
              {tab === "experiments" && experiment && <ExperimentResults experiment={experiment} selected={selectedCandidate} onSelect={setSelectedCandidate} />}
            </>
          )}
        </main>
      </div>
      <footer className="statusbar"><span><span className="status-dot" /> MODEL STATUS: <b>DETERMINISTIC / SEEDED</b></span><span>SCENARIO <b>{network.id.toUpperCase()}</b></span><span>SEED <b>{experiment?.seed ?? network.seed}</b></span><span>DATABASE <b>SQLITE / LOCAL</b></span><span className="statusbar-right">ROADTWIN X <b>·</b> SIMULATED OUTPUTS ARE NOT FIELD-VALIDATED</span></footer>
    </div>
  );
}

function Timeline({ playing, setPlaying, speed, setSpeed, clock, simulationTime }: { playing: boolean; setPlaying: (value: boolean) => void; speed: number; setSpeed: (value: number) => void; clock: string; simulationTime: number }) {
  return (
    <div className="timeline">
      <div className="playback-controls">
        <button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause simulation" : "Play simulation"}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
        <button className="step-button" onClick={() => { setPlaying(false); useRoadTwin.getState().advance(1); }} aria-label="Step one second"><StepForward size={15} /></button>
        <button className="step-button" onClick={() => { useRoadTwin.setState({ simulationTime: 0 }); setPlaying(true); }} aria-label="Reset simulation"><RotateCcw size={14} /></button>
      </div>
      <div className="timeline-track-wrap"><div className="timeline-caption"><span>SIMULATION TIMELINE</span><span>{clock} <b>/ 15:00</b></span></div><div className="timeline-track"><div className="timeline-fill" style={{ width: `${Math.min(100, simulationTime / 900 * 100)}%` }} /><i style={{ left: `${Math.min(99, simulationTime / 900 * 100)}%` }} /><span className="event-mark event-a" /><span className="event-mark event-b" /><span className="event-mark event-c" /></div><div className="timeline-ticks"><span>00:00</span><span>05:00</span><span>10:00</span><span>15:00</span></div></div>
      <label className="speed-control"><span>PLAYBACK</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>
      <button className="reset-control" onClick={() => { useRoadTwin.setState({ simulationTime: 0 }); setPlaying(true); }}><RotateCcw size={13} /> RESET</button>
    </div>
  );
}

function RoadInspector({ road, metrics, onChange }: { road: Road; metrics?: Experiment["baseline"]["road_metrics"][string]; onChange: (field: "lanes" | "speed_kmh", value: number) => void }) {
  return (
    <>
      <h2 className="road-name">{road.label}<span className="road-id">{road.id.toUpperCase()}</span></h2>
      <div className="inspector-data"><div><span>SEGMENT LENGTH</span><b>{road.length_m} <small>m</small></b></div><div><span>CONDITION</span><b className="condition"><i /> {road.condition.toUpperCase()}</b></div></div>
      <div className="edit-row"><label htmlFor="lane-count">LANES</label><div className="stepper"><button onClick={() => onChange("lanes", Math.max(1, road.lanes - 1))}>−</button><input id="lane-count" type="number" min="1" max="5" value={road.lanes} onChange={(event) => onChange("lanes", Math.max(1, Math.min(5, Number(event.target.value))))} /><button onClick={() => onChange("lanes", Math.min(5, road.lanes + 1))}>+</button></div></div>
      <div className="edit-row"><label htmlFor="speed-limit">SPEED LIMIT</label><div className="stepper speed-stepper"><input id="speed-limit" type="number" min="10" max="100" step="5" value={road.speed_kmh} onChange={(event) => onChange("speed_kmh", Number(event.target.value))} /><span>km/h</span></div></div>
      <div className="demand-line"><span>TRAFFIC DEMAND</span><b>{number(road.demand_vph, 0)} <small>veh/h</small></b></div>
      <div className="demand-meter"><span style={{ width: `${Math.min(100, road.demand_vph / 12)}%` }} /></div>
      <div className="inspector-data inspector-data-bottom"><div><span>CURRENT QUEUE</span><b>{metrics ? number(metrics.queue, 0) : "—"} <small>veh</small></b></div><div><span>OCCUPANCY</span><b>{metrics ? `${number(metrics.occupancy_pct)}%` : "—"}</b></div></div>
      <div className="signal-strip"><span className="field-label">SIGNAL PHASE</span><div><i className="light red-light" /><i className="light amber-light" /><i className="light green-light" /><b>{road.id === "east" ? "PHASE 03 · 24s" : `PHASE · ${road.id.toUpperCase()}`}</b></div></div>
    </>
  );
}

function Kpi({ label, value, unit, accent = "neutral" }: { label: string; value: string; unit: string; accent?: string }) {
  return <div className={`kpi-card kpi-${accent}`}><span>{label}</span><b>{value}</b><small>{unit}</small></div>;
}

function ExperimentResults({ experiment, selected, onSelect }: { experiment: Experiment; selected: string | null; onSelect: (id: string) => void }) {
  const baseline = experiment.baseline.metrics;
  return (
    <section className="results-panel">
      <div className="results-heading"><div><span className="eyebrow">COUNTERFACTUAL ANALYSIS / SEED {experiment.seed}</span><h2>Scenario comparison</h2><p>Same synthetic demand and seed · {experiment.duration_s / 60} minute runs · actual local model outputs</p></div><div className="results-badge"><span className="status-dot" />{experiment.recommendation.feasible_count} FEASIBLE / {experiment.candidates.length} CANDIDATES</div></div>
      <div className="results-table-wrap"><table className="results-table"><thead><tr><th>INTERVENTION</th><th>DELAY ↓</th><th>QUEUE ↓</th><th>THROUGHPUT ↑</th><th>SAFETY PROXY</th><th>COST</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>
        <tr className="baseline-row"><td><span className="scenario-icon baseline-icon">B</span> BASELINE</td><td>{number(baseline.average_delay_s)}s</td><td>{number(baseline.average_queue_vehicles)}</td><td>{number(baseline.throughput_vph, 0)}</td><td>{number(baseline.pedestrian_conflict_proxy)}</td><td>—</td><td>—</td><td><span className="baseline-tag">REFERENCE</span></td></tr>
        {experiment.candidates.map((candidate) => (
          <tr key={candidate.id} className={`${selected === candidate.id ? "row-selected" : ""} ${!candidate.feasible ? "row-infeasible" : ""}`} onClick={() => onSelect(candidate.id)}>
            <td><span className="scenario-icon">{candidate.name.slice(0, 1)}</span><div className="candidate-name">{candidate.name}<small>{candidate.description}</small></div></td>
            <td className={candidate.delay_reduction_pct >= 0 ? "positive" : "negative"}>{number(candidate.delay_reduction_pct)}%</td>
            <td>{number(candidate.metrics.average_queue_vehicles)}</td><td>{number(candidate.metrics.throughput_vph, 0)}</td><td className={candidate.risk_change_pct > 0 ? "negative" : ""}>{number(candidate.metrics.pedestrian_conflict_proxy)} <small>({candidate.risk_change_pct > 0 ? "+" : ""}{number(candidate.risk_change_pct)}%)</small></td>
            <td>{money(candidate.cost)}</td><td>{number(candidate.score, 2)}</td><td><span className={candidate.feasible ? "feasible" : "not-feasible"}>{candidate.feasible ? "FEASIBLE" : "INFEASIBLE"}</span></td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="assumption-note"><AlertTriangle size={14} /><span>Safety value is a relative queue-exposure proxy, not an accident probability. Candidate costs and traffic data are synthetic assumptions.</span></div>
    </section>
  );
}

function ReportsView({ reports, onExport }: { reports: Array<{ id: string; created_at: string; payload: Record<string, unknown> }>; onExport: (id: string) => void }) {
  return (
    <section className="reports-view">
      <div className="results-heading"><div><span className="eyebrow">EVIDENCE ARCHIVE / SQLITE</span><h2>Report center</h2><p>Saved experiment runs and generated evidence · persists across API restarts</p></div><span className="results-badge">{reports.length} SAVED REPORTS</span></div>
      {reports.length ? <div className="report-list">{reports.map((report) => {
        const payload = report.payload as { title?: string; experiment_id?: string; result?: Experiment };
        return <article className="report-card" key={report.id}><div className="report-icon"><Save size={18} /></div><div className="report-info"><h3>{payload.title ?? "RoadTwin experiment report"}</h3><p>{new Date(report.created_at).toLocaleString()} · EXPERIMENT {payload.experiment_id?.slice(0, 8) ?? report.id.slice(0, 8)}</p>{payload.result?.recommendation && <small>{payload.result.recommendation.explanation}</small>}</div><button className="outline-button" onClick={() => onExport(report.id)}><ArrowDownToLine size={14} /> EXPORT JSON</button></article>;
      })}</div> : <div className="empty-state"><CloudDownload size={30} /><h3>No saved evidence yet</h3><p>Run the counterfactual experiment, then save the recommendation report from the workbench.</p></div>}
    </section>
  );
}

function AnalyticsView({ experiment }: { experiment: Experiment | null }) {
  if (!experiment) {
    return <section className="reports-view"><div className="empty-state"><BarChart3 size={30} /><h3>Analytics need a simulation run</h3><p>Run an experiment first. Charts use returned model outputs, not placeholder data.</p></div></section>;
  }
  const baseline = experiment.baseline.metrics;
  const rows = [
    { id: "baseline", name: "Baseline", metrics: baseline, feasible: true },
    ...experiment.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, metrics: candidate.metrics, feasible: candidate.feasible })),
  ];
  const maxDelay = Math.max(1, ...rows.map((row) => row.metrics.average_delay_s));
  return (
    <section className="reports-view analytics-view">
      <div className="results-heading"><div><span className="eyebrow">MEASURED OUTPUTS / SEED {experiment.seed}</span><h2>Traffic analytics</h2><p>Derived from the saved {experiment.duration_s / 60}-minute deterministic approach-queue run.</p></div><span className="results-badge"><Activity size={12} /> {rows.length} SCENARIOS</span></div>
      <div className="analytics-kpis">
        <Kpi label="BASELINE AVG DELAY" value={`${number(baseline.average_delay_s)}s`} unit="PER ARRIVAL" />
        <Kpi label="PEAK QUEUE" value={number(baseline.max_queue_vehicles, 0)} unit="VEHICLES" accent="amber" />
        <Kpi label="VEHICLES SERVED" value={number(baseline.vehicles_served, 0)} unit="IN RUN" />
        <Kpi label="EMISSIONS PROXY" value={`${number(baseline.emissions_kg_proxy)}kg`} unit="SYNTHETIC CLASS MIX" accent="cyan" />
      </div>
      <div className="analytics-chart-card">
        <div className="analytics-card-title"><div><span className="eyebrow">COUNTERFACTUAL COMPARISON</span><h3>Average vehicle delay</h3></div><span>LOWER IS BETTER · SECONDS</span></div>
        {rows.map((row) => <div className="bar-row" key={row.id}><span className="bar-name">{row.name}</span><div className="bar-track"><i className={row.id === "baseline" ? "bar-base" : row.feasible ? "bar-feasible" : "bar-infeasible"} style={{ width: `${Math.max(2, row.metrics.average_delay_s / maxDelay * 100)}%` }} /></div><b>{number(row.metrics.average_delay_s)}s</b><span className={row.feasible ? "feasible" : "not-feasible"}>{row.id === "baseline" ? "REFERENCE" : row.feasible ? "FEASIBLE" : "FILTERED"}</span></div>)}
      </div>
      <div className="analytics-chart-card">
        <div className="analytics-card-title"><div><span className="eyebrow">ROAD APPROACH DETAIL</span><h3>Baseline queue and arrivals</h3></div><span>SYNTHETIC NETWORK</span></div>
        <div className="approach-table"><div className="approach-header"><span>APPROACH</span><span>ARRIVALS</span><span>MAX QUEUE</span><span>AVG. DELAY</span></div>
          {Object.entries(experiment.baseline.road_metrics).map(([id, metrics]) => <div className="approach-row" key={id}><span>{id.toUpperCase()}</span><b>{number(metrics.arrivals, 0)}</b><b>{number(metrics.max_queue, 0)} veh</b><b>{number(metrics.average_delay_s)}s</b></div>)}
        </div>
      </div>
      <div className="assumption-note"><AlertTriangle size={14} /><span>Analytics are model outputs from synthetic, uncalibrated traffic. The safety proxy is not an accident probability.</span></div>
    </section>
  );
}

function DataManager({ network, onImport, onExport }: { network: RoadNetwork; onImport: (file: File) => Promise<boolean>; onExport: (format: "json" | "csv" | "geojson") => void }) {
  const [message, setMessage] = useState("");
  const handleFile = async (file: File) => {
    setMessage(`Importing ${file.name}…`);
    const saved = await onImport(file);
    setMessage(saved ? `Imported and saved ${file.name}.` : `Import failed. Review the error message above.`);
  };
  return (
    <section className="reports-view data-view">
      <div className="results-heading"><div><span className="eyebrow">NETWORK CONFIGURATION / DATA EXCHANGE</span><h2>Data manager</h2><p>Import and export road-network configuration and supported approach attributes.</p></div><span className="results-badge"><Database size={12} /> {network.roads.length} ROAD EDGES</span></div>
      <div className="data-manager-grid">
        <article className="data-card"><div className="data-card-icon"><Upload size={18} /></div><h3>Import network data</h3><p>Load a RoadTwin network JSON, GeoJSON FeatureCollection, or road-approach CSV. The API validates before saving.</p><label className="outline-button upload-button"><Upload size={14} /> CHOOSE FILE<input type="file" accept=".json,.geojson,.csv,application/json,text/csv,application/geo+json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ""; }} /></label><small className="data-hint">CSV headers: id, label, length_m, lanes, speed_kmh, demand_vph, pedestrian_flow, risk_factor, condition.</small>{message && <small className="data-hint">{message}</small>}</article>
        <article className="data-card"><div className="data-card-icon"><Download size={18} /></div><h3>Export data</h3><p>Download the current network and synthetic geometry. GeoJSON coordinates are fictional demonstration values, not survey locations.</p><div className="export-actions"><button className="outline-button" onClick={() => onExport("json")}>JSON</button><button className="outline-button" onClick={() => onExport("csv")}>CSV</button><button className="outline-button" onClick={() => onExport("geojson")}>GEOJSON</button></div></article>
      </div>
      <div className="analytics-chart-card network-table-card">
        <div className="analytics-card-title"><div><span className="eyebrow">ACTIVE NETWORK</span><h3>{network.name}</h3></div><span>{network.city.toUpperCase()} · {network.synthetic ? "SYNTHETIC" : "IMPORTED"}</span></div>
        <div className="approach-table"><div className="approach-header"><span>ROAD EDGE</span><span>LANES</span><span>DEMAND</span><span>LIMIT</span></div>
          {network.roads.map((road) => <div className="approach-row" key={road.id}><span>{road.label}</span><b>{road.lanes}</b><b>{number(road.demand_vph, 0)} veh/h</b><b>{road.speed_kmh} km/h</b></div>)}
        </div>
      </div>
      <div className="assumption-note"><AlertTriangle size={14} /><span>Imported network changes persist through the local API. Verify geometry, counts, signal plans, and safety before real-world use.</span></div>
    </section>
  );
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  cells.push(cell.trim());
  return cells;
}

function parseNetworkFile(filename: string, contents: string, current: RoadNetwork): RoadNetwork {
  let parsed: Record<string, unknown>;
  if (filename.toLowerCase().endsWith(".csv")) {
    const [headerLine, ...lines] = contents.split(/\r?\n/).filter((line) => line.trim());
    if (!headerLine) throw new Error("CSV file has no header row.");
    const headers = parseCsvLine(headerLine);
    const required = ["id", "label", "length_m", "lanes", "speed_kmh", "demand_vph"];
    const missing = required.filter((field) => !headers.includes(field));
    if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
    parsed = {
      roads: lines.map((line, rowIndex) => {
        const cells = parseCsvLine(line);
        if (cells.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has an unexpected number of columns.`);
        const record = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
        const base = current.roads.find((road) => road.id === record.id);
        const numeric = (field: string, fallback: number) => record[field] === undefined || record[field] === "" ? fallback : Number(record[field]);
        const condition = record.condition === "fair" || record.condition === "poor" ? record.condition : "good";
        const road = {
          id: record.id ?? "",
          label: record.label ?? record.id ?? "",
          length_m: numeric("length_m", 0),
          lanes: numeric("lanes", 1),
          speed_kmh: numeric("speed_kmh", 25),
          demand_vph: numeric("demand_vph", 0),
          pedestrian_flow: numeric("pedestrian_flow", base?.pedestrian_flow ?? 0),
          risk_factor: numeric("risk_factor", base?.risk_factor ?? 1),
          condition,
        };
        if (!Number.isFinite(road.length_m) || !Number.isFinite(road.lanes) || !Number.isFinite(road.speed_kmh) || !Number.isFinite(road.demand_vph)) {
          throw new Error(`CSV row ${rowIndex + 2} has a non-numeric road value.`);
        }
        return road;
      }),
    };
  } else {
    try {
      parsed = JSON.parse(contents) as Record<string, unknown>;
    } catch {
      throw new Error("Could not parse the selected file as JSON or GeoJSON.");
    }
    if (parsed.type === "FeatureCollection" && Array.isArray(parsed.features)) {
      parsed = { roads: parsed.features.map((feature) => (feature as { properties?: unknown }).properties) };
    }
  }
  if (!Array.isArray(parsed.roads) || parsed.roads.length < 4) throw new Error("Import must contain at least four road approaches.");
  const roads = parsed.roads.map((road) => {
    if (!road || typeof road !== "object") throw new Error("Each road record must be an object.");
    const item = road as Record<string, unknown>;
    const result: Road = {
      id: String(item.id ?? ""),
      label: String(item.label ?? item.id ?? ""),
      length_m: Number(item.length_m),
      lanes: Number(item.lanes),
      speed_kmh: Number(item.speed_kmh),
      demand_vph: Number(item.demand_vph),
      pedestrian_flow: Number(item.pedestrian_flow ?? 0),
      risk_factor: Number(item.risk_factor ?? 1),
      condition: item.condition === "poor" || item.condition === "fair" ? item.condition : "good",
    };
    if (!result.id || !result.label || Object.values(result).some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("A road record is missing a valid id, label, or numeric value.");
    }
    return result;
  });
  const signalInput = parsed.signal && typeof parsed.signal === "object" ? parsed.signal as RoadNetwork["signal"] : current.signal;
  return {
    ...current,
    ...(typeof parsed.id === "string" ? parsed as Partial<RoadNetwork> : {}),
    roads,
    signal: {
      ...signalInput,
      green_s: Object.fromEntries(roads.map((road) => [road.id, signalInput.green_s?.[road.id] ?? current.signal.green_s[road.id] ?? 20])),
    },
    obstructions: Object.fromEntries(Object.entries(current.obstructions).filter(([id]) => roads.some((road) => road.id === id))),
    crossings: roads.map((road) => road.id),
  };
}
