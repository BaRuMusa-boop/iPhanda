import { useState, useEffect, useCallback, useMemo } from "react";

const C = {
  bg: "#060E1A",
  surface: "#0C1829",
  card: "#101F35",
  cardHover: "#152640",
  border: "#1A3055",
  borderBright: "#2A4A7A",
  primary: "#C62839",
  primaryGlow: "rgba(198,40,57,0.25)",
  accent: "#F8C537",
  accentGlow: "rgba(248,197,55,0.2)",
  teal: "#4ECDC4",
  success: "#2ECC71",
  warning: "#FF9F1C",
  danger: "#FF5D73",
  text: "#F0F4FF",
  muted: "#6B85A8",
  dimmed: "#3A5070",
};

const injectStyles = () => {
  if (document.getElementById("iphanda-styles")) return;
  const style = document.createElement("style");
  style.id = "iphanda-styles";
  style.textContent = [
    "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap');",
    "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
    "html, body, #root { height: 100%; background: #060E1A; color: #F0F4FF; font-family: 'Barlow Condensed', sans-serif; }",
    "::-webkit-scrollbar { width: 4px; height: 4px; }",
    "::-webkit-scrollbar-track { background: #0C1829; }",
    "::-webkit-scrollbar-thumb { background: #2A4A7A; border-radius: 2px; }",
    "button { cursor: pointer; border: none; outline: none; font-family: inherit; }",
    "input { outline: none; font-family: inherit; }",
    "@keyframes slideIn { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }",
    ".animate-in { animation: slideIn 0.3s ease forwards; }",
  ].join(" ");
  document.head.appendChild(style);
};

const HOME_ADV = 0.08;
const HALF_LIFE = 50;
const LR = 0.08;
const BURN_IN = 5;

function timeWeight(daysAgo) {
  return Math.pow(0.5, daysAgo / HALF_LIFE);
}

function makeRatings() {
  const d = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : 1.0) });
  return { ha: d(), hd: d(), aa: d(), ad: d() };
}

class GAPEngine {
  constructor() {
    this.sot = makeRatings();
    this.soff = makeRatings();
    this.corners = makeRatings();
  }

  _update(r, home, away, hAct, aAct, w) {
    const lr = LR * w;
    const hExp = r.ha[home] * r.ad[away];
    const aExp = r.aa[away] * r.hd[home];
    const hErr = hAct - hExp;
    const aErr = aAct - aExp;
    r.ha[home] = Math.max(0.1, r.ha[home] + lr * hErr * r.ad[away]);
    r.ad[away] = Math.max(0.1, r.ad[away] - lr * hErr * r.ha[home]);
    r.aa[away] = Math.max(0.1, r.aa[away] + lr * aErr * r.hd[home]);
    r.hd[home] = Math.max(0.1, r.hd[home] - lr * aErr * r.aa[away]);
  }

  _pred(r, home, away) {
    const h = r.ha[home] * r.ad[away] * (1 + HOME_ADV);
    const a = r.aa[away] * r.hd[home];
    return [Math.max(0.1, h), Math.max(0.1, a)];
  }

  predict(home, away, ctx) {
    ctx = ctx || {};
    const [hSot, aSot] = this._pred(this.sot, home, away);
    const [hSoff, aSoff] = this._pred(this.soff, home, away);
    const [hC, aC] = this._pred(this.corners, home, away);

    const windAdj = ctx.windKph ? Math.max(0.85, 1 - (ctx.windKph - 20) * 0.004) : 1.0;
    const pressBoost = ctx.homePress ? 1 + (ctx.homePress - 50) * 0.003 : 1.0;
    const motivMult = ctx.homeMotive > 7 ? 1.06 : ctx.homeMotive < 4 ? 0.94 : 1.0;
    const interceptPenalty = ctx.homeIntercepts ? Math.max(0.85, 1 - ctx.homeIntercepts * 0.005) : 1.0;

    const adjHSot = hSot * pressBoost * motivMult;
    const adjASot = aSot * interceptPenalty;
    const adjHC = hC * windAdj;
    const adjAC = aC * windAdj;

    const hXg = adjHSot * 0.22 + hSoff * 0.08 + adjHC * 0.015;
    const aXg = adjASot * 0.22 + aSoff * 0.08 + adjAC * 0.015;

    return {
      hSot: Math.round(adjHSot * 100) / 100,
      aSot: Math.round(adjASot * 100) / 100,
      hSoff: Math.round(hSoff * 100) / 100,
      aSoff: Math.round(aSoff * 100) / 100,
      hC: Math.round(adjHC * 100) / 100,
      aC: Math.round(adjAC * 100) / 100,
      htHC: Math.round(adjHC * 0.46 * 100) / 100,
      htAC: Math.round(adjAC * 0.46 * 100) / 100,
      hXg: Math.round(Math.max(0.1, hXg) * 100) / 100,
      aXg: Math.round(Math.max(0.1, aXg) * 100) / 100,
    };
  }
}

function poisson(k, lam) {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 1; i <= k; i++) fact *= i;
  return Math.exp(-lam) * Math.pow(lam, k) / fact;
}

function simulateOutcomes(hXg, aXg) {
  const MAX = 8;
  let hw = 0, draw = 0, aw = 0, btts = 0;
  const grid = [];
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poisson(h, hXg) * poisson(a, aXg);
      if (h > a) hw += p;
      else if (h === a) draw += p;
      else aw += p;
      if (h > 0 && a > 0) btts += p;
      grid.push({ score: h + "-" + a, p: Math.round(p * 10000) / 100, h, a });
    }
  }
  return {
    hw: Math.round(hw * 100) / 100,
    draw: Math.round(draw * 100) / 100,
    aw: Math.round(aw * 100) / 100,
    btts: Math.round(btts * 100) / 100,
    o15: Math.round(grid.filter(g => g.h + g.a > 1).reduce((s, g) => s + g.p / 100, 0) * 100) / 100,
    o25: Math.round(grid.filter(g => g.h + g.a > 2).reduce((s, g) => s + g.p / 100, 0) * 100) / 100,
    o35: Math.round(grid.filter(g => g.h + g.a > 3).reduce((s, g) => s + g.p / 100, 0) * 100) / 100,
    topScores: grid.sort((a, b) => b.p - a.p).slice(0, 8),
  };
}

function sigmoid(x, scale) {
  scale = scale || 1;
  return 1 / (1 + Math.exp(-x / Math.max(scale, 0.1)));
}

function buildMarkets(stats, outcomes, homeName, awayName) {
  const totalC = stats.hC + stats.aC;
  const htTotalC = stats.htHC + stats.htAC;
  const totalSot = stats.hSot + stats.aSot;

  const candidates = [
    { market: "CORNERS", sel: "Over 9.5 Corners", prob: sigmoid(totalC - 9.5, 0.9) },
    { market: "CORNERS", sel: "Over 10.5 Corners", prob: sigmoid(totalC - 10.5, 0.95) },
    { market: "CORNERS", sel: "Over 11.5 Corners", prob: sigmoid(totalC - 11.5, 1.0) },
    { market: "CORNERS HT", sel: "Over 4.5 Corners HT", prob: sigmoid(htTotalC - 4.5, 0.7) },
    { market: "GOALS", sel: "Over 2.5 Goals", prob: outcomes.o25 },
    { market: "GOALS", sel: "Over 3.5 Goals", prob: outcomes.o35 },
    { market: "BTTS", sel: "BTTS Yes", prob: outcomes.btts },
    { market: "RESULT", sel: homeName + " Win", prob: outcomes.hw },
    { market: "RESULT", sel: "Draw", prob: outcomes.draw },
    { market: "RESULT", sel: awayName + " Win", prob: outcomes.aw },
    { market: "SHOTS", sel: "Over 8.5 Shots on Target", prob: sigmoid(totalSot - 8.5, 0.8) },
    { market: "BOOKINGS", sel: "Over 3.5 Cards", prob: 0.52 },
    { market: "BOOKINGS", sel: "Over 4.5 Cards", prob: 0.38 },
  ];

  return candidates.map(function(c, i) {
    const prob = Math.round(c.prob * 10000) / 10000;
    const edge = Math.round((prob - 0.5) * 10000) / 100;
    const kelly = Math.round(Math.max(0, (prob - 0.5) * 10) * 100) / 100;
    const fairOdds = Math.round(1 / Math.max(prob, 0.01) * 100) / 100;
    const verdict = edge >= 8 ? "Strong Play" : edge >= 4 ? "Playable" : edge >= 0 ? "Risky" : "Avoid";
    return { id: i, market: c.market, sel: c.sel, prob, edge, kelly, fairOdds, verdict };
  }).sort(function(a, b) { return b.edge - a.edge; });
}

function loadAudit() {
  try { return JSON.parse(localStorage.getItem("iphanda_audit") || "[]"); } catch (e) { return []; }
}
function saveAudit(data) {
  try { localStorage.setItem("iphanda_audit", JSON.stringify(data)); } catch (e) {}
}
function loadAccu() {
  try { return JSON.parse(localStorage.getItem("iphanda_accu") || "[]"); } catch (e) { return []; }
}
function saveAccu(data) {
  try { localStorage.setItem("iphanda_accu", JSON.stringify(data)); } catch (e) {}
}

const COMPETITIONS = [
  { code: "CL", name: "UEFA Champions League", flag: "CL" },
  { code: "PL", name: "Premier League", flag: "PL" },
  { code: "PD", name: "La Liga", flag: "ES" },
  { code: "BL1", name: "Bundesliga", flag: "DE" },
  { code: "SA", name: "Serie A", flag: "IT" },
  { code: "FL1", name: "Ligue 1", flag: "FR" },
  { code: "ELC", name: "Championship", flag: "ELC" },
  { code: "DED", name: "Eredivisie", flag: "NL" },
];

const MARKET_CHIPS = ["Match Result", "Over 2.5", "Over 3.5", "BTTS", "Corners", "Corners HT", "Bookings", "Shots"];

function getDemoFixtures(comp, date) {
  const fixtures = {
    CL: [
      { id: 1, homeTeam: { name: "Real Madrid" }, awayTeam: { name: "Bayern Munich" }, status: "SCHEDULED", utcDate: date + "T19:00:00Z", odds: { home: 2.10, draw: 3.40, away: 3.20 } },
      { id: 2, homeTeam: { name: "Arsenal" }, awayTeam: { name: "PSG" }, status: "SCHEDULED", utcDate: date + "T21:00:00Z", odds: { home: 2.40, draw: 3.20, away: 2.90 } },
      { id: 3, homeTeam: { name: "Inter Milan" }, awayTeam: { name: "Atletico Madrid" }, status: "SCHEDULED", utcDate: date + "T21:00:00Z", odds: { home: 1.95, draw: 3.50, away: 3.80 } },
    ],
    PL: [
      { id: 4, homeTeam: { name: "Manchester City" }, awayTeam: { name: "Liverpool" }, status: "SCHEDULED", utcDate: date + "T16:30:00Z", odds: { home: 1.85, draw: 3.60, away: 4.00 } },
      { id: 5, homeTeam: { name: "Chelsea" }, awayTeam: { name: "Arsenal" }, status: "SCHEDULED", utcDate: date + "T14:00:00Z", odds: { home: 2.80, draw: 3.30, away: 2.50 } },
      { id: 6, homeTeam: { name: "Tottenham" }, awayTeam: { name: "Aston Villa" }, status: "SCHEDULED", utcDate: date + "T14:00:00Z", odds: { home: 2.10, draw: 3.40, away: 3.30 } },
    ],
    PD: [
      { id: 7, homeTeam: { name: "Barcelona" }, awayTeam: { name: "Atletico Madrid" }, status: "SCHEDULED", utcDate: date + "T20:00:00Z", odds: { home: 1.70, draw: 3.80, away: 4.50 } },
      { id: 8, homeTeam: { name: "Real Madrid" }, awayTeam: { name: "Sevilla" }, status: "SCHEDULED", utcDate: date + "T20:00:00Z", odds: { home: 1.55, draw: 4.00, away: 5.50 } },
    ],
    BL1: [
      { id: 9, homeTeam: { name: "Bayer Leverkusen" }, awayTeam: { name: "Borussia Dortmund" }, status: "SCHEDULED", utcDate: date + "T17:30:00Z", odds: { home: 1.90, draw: 3.50, away: 3.80 } },
      { id: 10, homeTeam: { name: "RB Leipzig" }, awayTeam: { name: "Eintracht Frankfurt" }, status: "SCHEDULED", utcDate: date + "T15:30:00Z", odds: { home: 1.75, draw: 3.70, away: 4.20 } },
    ],
    SA: [
      { id: 11, homeTeam: { name: "Napoli" }, awayTeam: { name: "AC Milan" }, status: "SCHEDULED", utcDate: date + "T19:45:00Z", odds: { home: 2.10, draw: 3.20, away: 3.40 } },
    ],
    FL1: [
      { id: 12, homeTeam: { name: "PSG" }, awayTeam: { name: "Marseille" }, status: "SCHEDULED", utcDate: date + "T20:45:00Z", odds: { home: 1.60, draw: 3.80, away: 5.00 } },
    ],
    ELC: [
      { id: 13, homeTeam: { name: "Leeds United" }, awayTeam: { name: "Sheffield United" }, status: "SCHEDULED", utcDate: date + "T15:00:00Z", odds: { home: 2.00, draw: 3.30, away: 3.60 } },
    ],
    DED: [
      { id: 14, homeTeam: { name: "Ajax" }, awayTeam: { name: "PSV Eindhoven" }, status: "SCHEDULED", utcDate: date + "T18:45:00Z", odds: { home: 2.20, draw: 3.10, away: 3.10 } },
    ],
  };
  return fixtures[comp] || [];
}

function Badge(props) {
  return React.createElement("span", {
    style: {
      display: "inline-block", padding: "2px 8px", borderRadius: 3,
      background: (props.bg || (props.color || C.accent) + "22"),
      color: props.color || C.accent,
      fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace",
      letterSpacing: 0.5, whiteSpace: "nowrap"
    }
  }, props.children);
}

function VerdictBadge(props) {
  const map = { "Strong Play": C.success, "Playable": C.teal, "Risky": C.warning, "Avoid": C.danger };
  return React.createElement(Badge, { color: map[props.verdict] || C.muted }, props.verdict);
}

function StatBar(props) {
  const total = (props.home + props.away) || 1;
  return React.createElement("div", { style: { marginBottom: 10 } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 } },
      React.createElement("span", { style: { color: props.homeColor || C.teal, fontWeight: 700 } }, props.home),
      React.createElement("span", { style: { color: C.muted, fontSize: 11 } }, props.label),
      React.createElement("span", { style: { color: props.awayColor || C.accent, fontWeight: 700 } }, props.away)
    ),
    React.createElement("div", { style: { height: 4, borderRadius: 2, background: C.border, overflow: "hidden" } },
      React.createElement("div", { style: { height: "100%", width: ((props.home / total) * 100) + "%", background: "linear-gradient(90deg, " + (props.homeColor || C.teal) + ", " + (props.awayColor || C.accent) + ")", transition: "width 0.6s ease" } })
    )
  );
}

export default function App() {
  useEffect(function() { injectStyles(); }, []);

  const [apiKey, setApiKey] = useState(function() { return localStorage.getItem("fd_api_key") || ""; });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiSetup, setShowApiSetup] = useState(!localStorage.getItem("fd_api_key"));
  const [selectedComp, setSelectedComp] = useState(null);
  const [fixtures, setFixtures] = useState([]);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [fixturesError, setFixturesError] = useState(null);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const [selectedMarkets, setSelectedMarkets] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [accu, setAccu] = useState(loadAccu);
  const [bankroll, setBankroll] = useState(1000);
  const [activeTab, setActiveTab] = useState("fixtures");
  const [audit, setAudit] = useState(loadAudit);
  const [dateOffset, setDateOffset] = useState(0);

  const gap = useMemo(function() { return new GAPEngine(); }, []);

  const targetDate = useMemo(function() {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d.toISOString().slice(0, 10);
  }, [dateOffset]);

  const loadFixtures = useCallback(async function(compCode) {
    if (!compCode) return;
    setLoadingFixtures(true);
    setFixturesError(null);
    setFixtures([]);
    setSelectedFixture(null);
    setAnalysisResult(null);
    try {
      const headers = { "X-Auth-Token": apiKey };
      const url = "https://api.football-data.org/v4/competitions/" + compCode + "/matches?dateFrom=" + targetDate + "&dateTo=" + targetDate;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("API " + res.status);
      const data = await res.json();
      setFixtures(data.matches || []);
    } catch (e) {
      setFixturesError("Live API unavailable. Showing demo data.");
      setFixtures(getDemoFixtures(compCode, targetDate));
    } finally {
      setLoadingFixtures(false);
    }
  }, [apiKey, targetDate]);

  useEffect(function() {
    if (selectedComp && apiKey) loadFixtures(selectedComp);
  }, [selectedComp, targetDate, apiKey]);

  const toggleMarket = function(m) {
    setSelectedMarkets(function(prev) {
      return prev.includes(m) ? prev.filter(function(x) { return x !== m; }) : prev.concat([m]);
    });
  };

  const runAnalysis = useCallback(function() {
    if (!selectedFixture) return;
    setAnalysing(true);
    setActiveTab("analysis");
    setTimeout(function() {
      const home = (selectedFixture.homeTeam && selectedFixture.homeTeam.name) || "Home";
      const away = (selectedFixture.awayTeam && selectedFixture.awayTeam.name) || "Away";
      const ctx = { windKph: 18, homePress: 58, homeMotive: 7, homeIntercepts: 12 };
      const stats = gap.predict(home, away, ctx);
      const outcomes = simulateOutcomes(stats.hXg, stats.aXg);
      const allMarkets = buildMarkets(stats, outcomes, home, away);
      let filtered = allMarkets;
      if (selectedMarkets.length > 0) {
        const familyMap = {
          "Match Result": "RESULT", "Over 2.5": "GOALS", "Over 3.5": "GOALS",
          "BTTS": "BTTS", "Corners": "CORNERS", "Corners HT": "CORNERS HT",
          "Bookings": "BOOKINGS", "Shots": "SHOTS"
        };
        const families = selectedMarkets.map(function(c) { return familyMap[c]; }).filter(Boolean);
        filtered = allMarkets.filter(function(m) { return families.includes(m.market); });
      }
      setAnalysisResult({ home, away, stats, outcomes, markets: filtered, allMarkets, algoTopId: allMarkets[0] && allMarkets[0].id, fixture: selectedFixture });
      setAnalysing(false);
      const entry = { id: Date.now(), fixture: home + " vs " + away, market: filtered[0] && filtered[0].market, sel: filtered[0] && filtered[0].sel, edge: filtered[0] && filtered[0].edge, ts: new Date().toISOString(), result: "pending" };
      const updated = audit.concat([entry]);
      setAudit(updated);
      saveAudit(updated);
    }, 900);
  }, [selectedFixture, selectedMarkets, gap, audit]);

  const addToAccu = function(market) {
    const leg = Object.assign({}, market, { fixture: analysisResult ? analysisResult.home + " vs " + analysisResult.away : "", ts: new Date().toISOString(), result: "pending" });
    const updated = accu.concat([leg]);
    setAccu(updated);
    saveAccu(updated);
  };

  const removeFromAccu = function(i) {
    const updated = accu.filter(function(_, idx) { return idx !== i; });
    setAccu(updated);
    saveAccu(updated);
  };

  const saveApiKey = function() {
    localStorage.setItem("fd_api_key", apiKeyInput);
    setApiKey(apiKeyInput);
    setShowApiSetup(false);
  };

  const s = {
    safe: { minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg },
    header: { background: C.surface, borderBottom: "1px solid " + C.border, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, flexShrink: 0 },
    appTitle: { fontSize: 28, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, color: C.text, lineHeight: 1 },
    tagline: { fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 1 },
    tabBar: { background: C.surface, borderBottom: "1px solid " + C.border, display: "flex", flexShrink: 0 },
    body: { flex: 1, overflow: "auto" },
    inner: { maxWidth: 900, margin: "0 auto", padding: "16px 16px 60px" },
    card: { background: C.card, border: "1px solid " + C.border, borderRadius: 8, padding: 16, marginBottom: 12 },
    cardTitle: { color: C.text, fontSize: 18, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 12 },
    fixtureCard: function(selected) { return { background: selected ? C.cardHover : C.card, border: "1px solid " + (selected ? C.borderBright : C.border), borderLeft: "3px solid " + (selected ? C.accent : C.border), borderRadius: 6, padding: "12px 16px", cursor: "pointer", marginBottom: 8 }; },
    btn: function(active, color) { return { padding: "8px 14px", borderRadius: 4, background: active ? (color || C.primary) : C.surface, border: "1px solid " + (active ? (color || C.primary) : C.border), color: active ? "#fff" : C.text, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 0.5, cursor: "pointer" }; },
  };

  if (showApiSetup) {
    return React.createElement("div", { style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: C.bg } },
      React.createElement("div", { style: { background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: 32, maxWidth: 480, width: "100%" } },
        React.createElement("div", { style: { fontSize: 32, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", color: C.accent, letterSpacing: 2, marginBottom: 4 } }, "iPHANDA"),
        React.createElement("div", { style: { fontSize: 13, color: C.muted, marginBottom: 20 } }, "Sports Statistics and Performance Analysis"),
        React.createElement("div", { style: { fontSize: 14, color: C.text, marginBottom: 12 } }, "Enter your football-data.org API key, or use Demo Mode with sample fixtures."),
        React.createElement("input", { value: apiKeyInput, onChange: function(e) { setApiKeyInput(e.target.value); }, placeholder:
