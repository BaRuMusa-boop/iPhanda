import { useState, useEffect, useCallback, useMemo } from “react”;

const C = {
bg: “#060E1A”,
surface: “#0C1829”,
card: “#101F35”,
cardHover: “#152640”,
border: “#1A3055”,
borderBright: “#2A4A7A”,
primary: “#C62839”,
primaryGlow: “rgba(198,40,57,0.25)”,
accent: “#F8C537”,
accentGlow: “rgba(248,197,55,0.2)”,
teal: “#4ECDC4”,
success: “#2ECC71”,
warning: “#FF9F1C”,
danger: “#FF5D73”,
text: “#F0F4FF”,
muted: “#6B85A8”,
dimmed: “#3A5070”,
};

const injectStyles = () => {
if (document.getElementById(“iphanda-styles”)) return;
const style = document.createElement(“style”);
style.id = “iphanda-styles”;
style.textContent = [
“@import url(‘https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap’);”,
“*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }”,
“html, body, #root { height: 100%; background: #060E1A; color: #F0F4FF; font-family: ‘Barlow Condensed’, sans-serif; }”,
“::-webkit-scrollbar { width: 4px; height: 4px; }”,
“::-webkit-scrollbar-track { background: #0C1829; }”,
“::-webkit-scrollbar-thumb { background: #2A4A7A; border-radius: 2px; }”,
“button { cursor: pointer; border: none; outline: none; font-family: inherit; }”,
“input { outline: none; font-family: inherit; }”,
“@keyframes slideIn { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }”,
“.animate-in { animation: slideIn 0.3s ease forwards; }”,
].join(” “);
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

```
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
```

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
grid.push({ score: h + “-” + a, p: Math.round(p * 10000) / 100, h, a });
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
{ market: “CORNERS”, sel: “Over 9.5 Corners”, prob: sigmoid(totalC - 9.5, 0.9) },
{ market: “CORNERS”, sel: “Over 10.5 Corners”, prob: sigmoid(totalC - 10.5, 0.95) },
{ market: “CORNERS”, sel: “Over 11.5 Corners”, prob: sigmoid(totalC - 11.5, 1.0) },
{ market: “CORNERS HT”, sel: “Over 4.5 Corners HT”, prob: sigmoid(htTotalC - 4.5, 0.7) },
{ market: “GOALS”, sel: “Over 2.5 Goals”, prob: outcomes.o25 },
{ market: “GOALS”, sel: “Over 3.5 Goals”, prob: outcomes.o35 },
{ market: “BTTS”, sel: “BTTS Yes”, prob: outcomes.btts },
{ market: “RESULT”, sel: homeName + “ Win”, prob: outcomes.hw },
{ market: “RESULT”, sel: “Draw”, prob: outcomes.draw },
{ market: “RESULT”, sel: awayName + “ Win”, prob: outcomes.aw },
{ market: “SHOTS”, sel: “Over 8.5 Shots on Target”, prob: sigmoid(totalSot - 8.5, 0.8) },
{ market: “BOOKINGS”, sel: “Over 3.5 Cards”, prob: 0.52 },
{ market: “BOOKINGS”, sel: “Over 4.5 Cards”, prob: 0.38 },
];

return candidates.map(function(c, i) {
const prob = Math.round(c.prob * 10000) / 10000;
const edge = Math.round((prob - 0.5) * 10000) / 100;
const kelly = Math.round(Math.max(0, (prob - 0.5) * 10) * 100) / 100;
const fairOdds = Math.round(1 / Math.max(prob, 0.01) * 100) / 100;
const verdict = edge >= 8 ? “Strong Play” : edge >= 4 ? “Playable” : edge >= 0 ? “Risky” : “Avoid”;
return { id: i, market: c.market, sel: c.sel, prob, edge, kelly, fairOdds, verdict };
}).sort(function(a, b) { return b.edge - a.edge; });
}

function loadAudit() {
try { return JSON.parse(localStorage.getItem(“iphanda_audit”) || “[]”); } catch (e) { return []; }
}
function saveAudit(data) {
try { localStorage.setItem(“iphanda_audit”, JSON.stringify(data)); } catch (e) {}
}
function loadAccu() {
try { return JSON.parse(localStorage.getItem(“iphanda_accu”) || “[]”); } catch (e) { return []; }
}
function saveAccu(data) {
try { localStorage.setItem(“iphanda_accu”, JSON.stringify(data)); } catch (e) {}
}

const COMPETITIONS = [
{ code: “CL”, name: “UEFA Champions League”, flag: “CL” },
{ code: “PL”, name: “Premier League”, flag: “PL” },
{ code: “PD”, name: “La Liga”, flag: “ES” },
{ code: “BL1”, name: “Bundesliga”, flag: “DE” },
{ code: “SA”, name: “Serie A”, flag: “IT” },
{ code: “FL1”, name: “Ligue 1”, flag: “FR” },
{ code: “ELC”, name: “Championship”, flag: “ELC” },
{ code: “DED”, name: “Eredivisie”, flag: “NL” },
];

const MARKET_CHIPS = [“Match Result”, “Over 2.5”, “Over 3.5”, “BTTS”, “Corners”, “Corners HT”, “Bookings”, “Shots”];

function getDemoFixtures(comp, date) {
const fixtures = {
CL: [
{ id: 1, homeTeam: { name: “Real Madrid” }, awayTeam: { name: “Bayern Munich” }, status: “SCHEDULED”, utcDate: date + “T19:00:00Z”, odds: { home: 2.10, draw: 3.40, away: 3.20 } },
{ id: 2, homeTeam: { name: “Arsenal” }, awayTeam: { name: “PSG” }, status: “SCHEDULED”, utcDate: date + “T21:00:00Z”, odds: { home: 2.40, draw: 3.20, away: 2.90 } },
{ id: 3, homeTeam: { name: “Inter Milan” }, awayTeam: { name: “Atletico Madrid” }, status: “SCHEDULED”, utcDate: date + “T21:00:00Z”, odds: { home: 1.95, draw: 3.50, away: 3.80 } },
],
PL: [
{ id: 4, homeTeam: { name: “Manchester City” }, awayTeam: { name: “Liverpool” }, status: “SCHEDULED”, utcDate: date + “T16:30:00Z”, odds: { home: 1.85, draw: 3.60, away: 4.00 } },
{ id: 5, homeTeam: { name: “Chelsea” }, awayTeam: { name: “Arsenal” }, status: “SCHEDULED”, utcDate: date + “T14:00:00Z”, odds: { home: 2.80, draw: 3.30, away: 2.50 } },
{ id: 6, homeTeam: { name: “Tottenham” }, awayTeam: { name: “Aston Villa” }, status: “SCHEDULED”, utcDate: date + “T14:00:00Z”, odds: { home: 2.10, draw: 3.40, away: 3.30 } },
],
PD: [
{ id: 7, homeTeam: { name: “Barcelona” }, awayTeam: { name: “Atletico Madrid” }, status: “SCHEDULED”, utcDate: date + “T20:00:00Z”, odds: { home: 1.70, draw: 3.80, away: 4.50 } },
{ id: 8, homeTeam: { name: “Real Madrid” }, awayTeam: { name: “Sevilla” }, status: “SCHEDULED”, utcDate: date + “T20:00:00Z”, odds: { home: 1.55, draw: 4.00, away: 5.50 } },
],
BL1: [
{ id: 9, homeTeam: { name: “Bayer Leverkusen” }, awayTeam: { name: “Borussia Dortmund” }, status: “SCHEDULED”, utcDate: date + “T17:30:00Z”, odds: { home: 1.90, draw: 3.50, away: 3.80 } },
{ id: 10, homeTeam: { name: “RB Leipzig” }, awayTeam: { name: “Eintracht Frankfurt” }, status: “SCHEDULED”, utcDate: date + “T15:30:00Z”, odds: { home: 1.75, draw: 3.70, away: 4.20 } },
],
SA: [
{ id: 11, homeTeam: { name: “Napoli” }, awayTeam: { name: “AC Milan” }, status: “SCHEDULED”, utcDate: date + “T19:45:00Z”, odds: { home: 2.10, draw: 3.20, away: 3.40 } },
],
FL1: [
{ id: 12, homeTeam: { name: “PSG” }, awayTeam: { name: “Marseille” }, status: “SCHEDULED”, utcDate: date + “T20:45:00Z”, odds: { home: 1.60, draw: 3.80, away: 5.00 } },
],
ELC: [
{ id: 13, homeTeam: { name: “Leeds United” }, awayTeam: { name: “Sheffield United” }, status: “SCHEDULED”, utcDate: date + “T15:00:00Z”, odds: { home: 2.00, draw: 3.30, away: 3.60 } },
],
DED: [
{ id: 14, homeTeam: { name: “Ajax” }, awayTeam: { name: “PSV Eindhoven” }, status: “SCHEDULED”, utcDate: date + “T18:45:00Z”, odds: { home: 2.20, draw: 3.10, away: 3.10 } },
],
};
return fixtures[comp] || [];
}

function Badge(props) {
return React.createElement(“span”, {
style: {
display: “inline-block”, padding: “2px 8px”, borderRadius: 3,
background: (props.bg || (props.color || C.accent) + “22”),
color: props.color || C.accent,
fontSize: 11, fontWeight: 700, fontFamily: “‘Space Mono’, monospace”,
letterSpacing: 0.5, whiteSpace: “nowrap”
}
}, props.children);
}

function VerdictBadge(props) {
const map = { “Strong Play”: C.success, “Playable”: C.teal, “Risky”: C.warning, “Avoid”: C.danger };
return React.createElement(Badge, { color: map[props.verdict] || C.muted }, props.verdict);
}

function StatBar(props) {
const total = (props.home + props.away) || 1;
return React.createElement(“div”, { style: { marginBottom: 10 } },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, fontSize: 12, marginBottom: 4 } },
React.createElement(“span”, { style: { color: props.homeColor || C.teal, fontWeight: 700 } }, props.home),
React.createElement(“span”, { style: { color: C.muted, fontSize: 11 } }, props.label),
React.createElement(“span”, { style: { color: props.awayColor || C.accent, fontWeight: 700 } }, props.away)
),
React.createElement(“div”, { style: { height: 4, borderRadius: 2, background: C.border, overflow: “hidden” } },
React.createElement(“div”, { style: { height: “100%”, width: ((props.home / total) * 100) + “%”, background: “linear-gradient(90deg, “ + (props.homeColor || C.teal) + “, “ + (props.awayColor || C.accent) + “)”, transition: “width 0.6s ease” } })
)
);
}

export default function App() {
useEffect(function() { injectStyles(); }, []);

const [apiKey, setApiKey] = useState(function() { return localStorage.getItem(“fd_api_key”) || “”; });
const [apiKeyInput, setApiKeyInput] = useState(””);
const [showApiSetup, setShowApiSetup] = useState(!localStorage.getItem(“fd_api_key”));
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
const [activeTab, setActiveTab] = useState(“fixtures”);
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
const headers = { “X-Auth-Token”: apiKey };
const url = “https://api.football-data.org/v4/competitions/” + compCode + “/matches?dateFrom=” + targetDate + “&dateTo=” + targetDate;
const res = await fetch(url, { headers });
if (!res.ok) throw new Error(“API “ + res.status);
const data = await res.json();
setFixtures(data.matches || []);
} catch (e) {
setFixturesError(“Live API unavailable. Showing demo data.”);
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
setActiveTab(“analysis”);
setTimeout(function() {
const home = (selectedFixture.homeTeam && selectedFixture.homeTeam.name) || “Home”;
const away = (selectedFixture.awayTeam && selectedFixture.awayTeam.name) || “Away”;
const ctx = { windKph: 18, homePress: 58, homeMotive: 7, homeIntercepts: 12 };
const stats = gap.predict(home, away, ctx);
const outcomes = simulateOutcomes(stats.hXg, stats.aXg);
const allMarkets = buildMarkets(stats, outcomes, home, away);
let filtered = allMarkets;
if (selectedMarkets.length > 0) {
const familyMap = {
“Match Result”: “RESULT”, “Over 2.5”: “GOALS”, “Over 3.5”: “GOALS”,
“BTTS”: “BTTS”, “Corners”: “CORNERS”, “Corners HT”: “CORNERS HT”,
“Bookings”: “BOOKINGS”, “Shots”: “SHOTS”
};
const families = selectedMarkets.map(function(c) { return familyMap[c]; }).filter(Boolean);
filtered = allMarkets.filter(function(m) { return families.includes(m.market); });
}
setAnalysisResult({ home, away, stats, outcomes, markets: filtered, allMarkets, algoTopId: allMarkets[0] && allMarkets[0].id, fixture: selectedFixture });
setAnalysing(false);
const entry = { id: Date.now(), fixture: home + “ vs “ + away, market: filtered[0] && filtered[0].market, sel: filtered[0] && filtered[0].sel, edge: filtered[0] && filtered[0].edge, ts: new Date().toISOString(), result: “pending” };
const updated = audit.concat([entry]);
setAudit(updated);
saveAudit(updated);
}, 900);
}, [selectedFixture, selectedMarkets, gap, audit]);

const addToAccu = function(market) {
const leg = Object.assign({}, market, { fixture: analysisResult ? analysisResult.home + “ vs “ + analysisResult.away : “”, ts: new Date().toISOString(), result: “pending” });
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
localStorage.setItem(“fd_api_key”, apiKeyInput);
setApiKey(apiKeyInput);
setShowApiSetup(false);
};

const s = {
safe: { minHeight: “100vh”, display: “flex”, flexDirection: “column”, background: C.bg },
header: { background: C.surface, borderBottom: “1px solid “ + C.border, padding: “10px 20px”, display: “flex”, alignItems: “center”, justifyContent: “space-between”, flexWrap: “wrap”, gap: 10, flexShrink: 0 },
appTitle: { fontSize: 28, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 2, color: C.text, lineHeight: 1 },
tagline: { fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 1 },
tabBar: { background: C.surface, borderBottom: “1px solid “ + C.border, display: “flex”, flexShrink: 0 },
body: { flex: 1, overflow: “auto” },
inner: { maxWidth: 900, margin: “0 auto”, padding: “16px 16px 60px” },
card: { background: C.card, border: “1px solid “ + C.border, borderRadius: 8, padding: 16, marginBottom: 12 },
cardTitle: { color: C.text, fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 1, marginBottom: 12 },
fixtureCard: function(selected) { return { background: selected ? C.cardHover : C.card, border: “1px solid “ + (selected ? C.borderBright : C.border), borderLeft: “3px solid “ + (selected ? C.accent : C.border), borderRadius: 6, padding: “12px 16px”, cursor: “pointer”, marginBottom: 8 }; },
btn: function(active, color) { return { padding: “8px 14px”, borderRadius: 4, background: active ? (color || C.primary) : C.surface, border: “1px solid “ + (active ? (color || C.primary) : C.border), color: active ? “#fff” : C.text, fontFamily: “‘Barlow Condensed’, sans-serif”, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, cursor: “pointer” }; },
};

if (showApiSetup) {
return React.createElement(“div”, { style: { minHeight: “100vh”, display: “flex”, alignItems: “center”, justifyContent: “center”, padding: 20, background: C.bg } },
React.createElement(“div”, { style: { background: C.card, border: “1px solid “ + C.border, borderRadius: 12, padding: 32, maxWidth: 480, width: “100%” } },
React.createElement(“div”, { style: { fontSize: 32, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, color: C.accent, letterSpacing: 2, marginBottom: 4 } }, “iPHANDA”),
React.createElement(“div”, { style: { fontSize: 13, color: C.muted, marginBottom: 20 } }, “Sports Statistics and Performance Analysis”),
React.createElement(“div”, { style: { fontSize: 14, color: C.text, marginBottom: 12 } }, “Enter your football-data.org API key, or use Demo Mode with sample fixtures.”),
React.createElement(“input”, { value: apiKeyInput, onChange: function(e) { setApiKeyInput(e.target.value); }, placeholder: “Your API key…”, style: { width: “100%”, padding: “10px 14px”, background: C.surface, border: “1px solid “ + C.border, borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 12 }, onKeyDown: function(e) { if (e.key === “Enter” && apiKeyInput) saveApiKey(); } }),
React.createElement(“div”, { style: { display: “flex”, gap: 10 } },
React.createElement(“button”, { onClick: saveApiKey, disabled: !apiKeyInput, style: { flex: 1, padding: “10px 0”, background: C.primary, color: “#fff”, borderRadius: 6, fontSize: 14, fontWeight: 800, opacity: apiKeyInput ? 1 : 0.5 } }, “CONNECT”),
React.createElement(“button”, { onClick: function() { setShowApiSetup(false); }, style: { padding: “10px 14px”, background: C.surface, border: “1px solid “ + C.border, color: C.muted, borderRadius: 6, fontSize: 14, fontWeight: 700 } }, “DEMO MODE”)
)
)
);
}

const renderFixtures = function() {
return React.createElement(“div”, null,
React.createElement(“div”, { style: { fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 } }, “SELECT COMPETITION”),
React.createElement(“div”, { style: { display: “flex”, flexWrap: “wrap”, gap: 8, marginBottom: 12 } },
COMPETITIONS.map(function(c) {
return React.createElement(“button”, { key: c.code, onClick: function() { setSelectedComp(c.code); }, style: s.btn(selectedComp === c.code) }, c.name);
})
),
React.createElement(“div”, { style: { display: “flex”, alignItems: “center”, gap: 10, marginBottom: 12 } },
React.createElement(“button”, { onClick: function() { setDateOffset(function(d) { return d - 1; }); }, style: { width: 34, height: 34, borderRadius: “50%”, background: C.surface, border: “1px solid “ + C.border, color: C.text, fontSize: 16 } }, “<”),
React.createElement(“div”, { style: { flex: 1, background: C.card, border: “1px solid “ + C.border, borderRadius: 6, padding: “6px 14px”, textAlign: “center” } },
React.createElement(“div”, { style: { fontSize: 12, color: C.muted } }, “FIXTURE DATE”),
React.createElement(“div”, { style: { fontSize: 16, fontWeight: 800 } }, targetDate)
),
React.createElement(“button”, { onClick: function() { setDateOffset(function(d) { return d + 1; }); }, style: { width: 34, height: 34, borderRadius: “50%”, background: C.surface, border: “1px solid “ + C.border, color: C.text, fontSize: 16 } }, “>”)
),
!selectedComp && React.createElement(“div”, { style: { color: C.muted, textAlign: “center”, padding: “32px 0” } }, “Select a competition above”),
loadingFixtures && React.createElement(“div”, { style: { color: C.muted, padding: “20px 0” } }, “Loading fixtures…”),
fixturesError && React.createElement(“div”, { style: { color: C.warning, fontSize: 12, marginBottom: 10, padding: “8px 12px”, background: C.warning + “11”, borderRadius: 4 } }, fixturesError),
fixtures.map(function(f) {
const selected = selectedFixture && selectedFixture.id === f.id;
const time = f.utcDate ? new Date(f.utcDate).toLocaleTimeString(“en-ZA”, { hour: “2-digit”, minute: “2-digit” }) : “TBC”;
return React.createElement(“div”, { key: f.id, onClick: function() { setSelectedFixture(f); setAnalysisResult(null); }, style: s.fixtureCard(selected) },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, marginBottom: 6 } },
React.createElement(“span”, { style: { fontSize: 11, color: C.muted, fontFamily: “‘Space Mono’, monospace” } }, time),
f.status === “FINISHED” && React.createElement(Badge, { color: C.dimmed }, “FT”)
),
React.createElement(“div”, { style: { display: “grid”, gridTemplateColumns: “1fr auto 1fr”, gap: 8, alignItems: “center”, marginBottom: f.odds ? 8 : 0 } },
React.createElement(“span”, { style: { fontSize: 16, fontWeight: 800 } }, f.homeTeam && f.homeTeam.name),
React.createElement(“span”, { style: { fontSize: 14, color: C.dimmed, fontWeight: 700, textAlign: “center” } }, “VS”),
React.createElement(“span”, { style: { fontSize: 16, fontWeight: 800, textAlign: “right” } }, f.awayTeam && f.awayTeam.name)
),
f.odds && React.createElement(“div”, { style: { display: “flex”, gap: 10 } },
React.createElement(“span”, { style: { fontSize: 12, color: C.teal, fontFamily: “‘Space Mono’, monospace”, fontWeight: 700 } }, “H “ + (f.odds.home && f.odds.home.toFixed(2))),
React.createElement(“span”, { style: { fontSize: 12, color: C.muted, fontFamily: “‘Space Mono’, monospace”, fontWeight: 700 } }, “D “ + (f.odds.draw && f.odds.draw.toFixed(2))),
React.createElement(“span”, { style: { fontSize: 12, color: C.accent, fontFamily: “‘Space Mono’, monospace”, fontWeight: 700 } }, “A “ + (f.odds.away && f.odds.away.toFixed(2)))
)
);
}),
fixtures.length === 0 && !loadingFixtures && selectedComp && React.createElement(“div”, { style: { color: C.muted, textAlign: “center”, padding: “24px 0” } }, “No fixtures found for “ + targetDate)
);
};

const renderAnalysis = function() {
if (!selectedFixture) {
return React.createElement(“div”, { style: { color: C.muted, textAlign: “center”, padding: “40px 0” } }, “Select a fixture from the Fixtures tab first”);
}
const home = selectedFixture.homeTeam && selectedFixture.homeTeam.name;
const away = selectedFixture.awayTeam && selectedFixture.awayTeam.name;
return React.createElement(“div”, null,
React.createElement(“div”, { style: Object.assign({}, s.card, { marginBottom: 12 }) },
React.createElement(“div”, { style: { display: “grid”, gridTemplateColumns: “1fr auto 1fr”, gap: 8, alignItems: “center”, marginBottom: 12 } },
React.createElement(“span”, { style: { fontSize: 20, fontWeight: 900 } }, home),
React.createElement(“span”, { style: { fontSize: 14, color: C.dimmed, fontWeight: 700 } }, “VS”),
React.createElement(“span”, { style: { fontSize: 20, fontWeight: 900, textAlign: “right” } }, away)
),
React.createElement(“div”, { style: { fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 } }, “SELECT MARKETS”),
React.createElement(“div”, { style: { display: “flex”, flexWrap: “wrap”, gap: 6, marginBottom: 12 } },
MARKET_CHIPS.map(function(m) {
const active = selectedMarkets.includes(m);
return React.createElement(“button”, { key: m, onClick: function() { toggleMarket(m); }, style: { padding: “6px 12px”, borderRadius: 3, background: active ? C.accent : C.surface, border: “1px solid “ + (active ? C.accent : C.border), color: active ? C.bg : C.text, fontSize: 13, fontWeight: 700 } }, m);
})
),
React.createElement(“button”, { onClick: runAnalysis, disabled: analysing, style: { width: “100%”, padding: “12px 0”, background: analysing ? C.dimmed : C.primary, color: “#fff”, borderRadius: 6, fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 1 } }, analysing ? “RUNNING ENGINE…” : “RUN ANALYSIS”)
),
analysing && React.createElement(“div”, { style: { color: C.muted, padding: “20px 0”, textAlign: “center” } }, “Calculating…”),
analysisResult && React.createElement(“div”, { className: “animate-in” },
analysisResult.allMarkets.filter(function(m) { return m.verdict === “Strong Play” || m.verdict === “Playable”; }).slice(0, 3).length > 0 && React.createElement(“div”, { style: { background: C.card, border: “1px solid “ + C.accent, borderRadius: 8, padding: 16, marginBottom: 12 } },
React.createElement(“div”, { style: { fontSize: 20, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, color: C.accent, letterSpacing: 1, marginBottom: 12 } }, “PEAK PICKS”),
analysisResult.allMarkets.filter(function(m) { return m.verdict === “Strong Play” || m.verdict === “Playable”; }).slice(0, 3).map(function(m, i) {
return React.createElement(“div”, { key: m.id, style: { display: “flex”, justifyContent: “space-between”, padding: “8px 0”, borderBottom: i < 2 ? “1px solid “ + C.border : “none” } },
React.createElement(“span”, { style: { fontSize: 15, fontWeight: 800 } }, m.market + “: “ + m.sel),
React.createElement(“span”, { style: { color: C.success, fontWeight: 700 } }, “+” + m.edge.toFixed(1) + “%”)
);
})
),
React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: s.cardTitle }, “GAP PROJECTED STATS”),
React.createElement(“div”, { style: { display: “flex”, gap: 8, marginBottom: 12, flexWrap: “wrap” } },
[[“HOME xG”, analysisResult.stats.hXg, C.teal], [“AWAY xG”, analysisResult.stats.aXg, C.accent], [“TOTAL CORNERS”, analysisResult.stats.hC + analysisResult.stats.aC, C.text]].map(function(item) {
return React.createElement(“div”, { key: item[0], style: { background: C.surface, border: “1px solid “ + C.border, borderRadius: 6, padding: “10px 14px”, flex: 1, minWidth: 80 } },
React.createElement(“div”, { style: { fontSize: 11, color: C.muted, marginBottom: 4 } }, item[0]),
React.createElement(“div”, { style: { fontSize: 22, fontWeight: 900, color: item[2], fontFamily: “‘Bebas Neue’, sans-serif” } }, item[1])
);
})
),
React.createElement(StatBar, { label: “Shots on Target”, home: analysisResult.stats.hSot, away: analysisResult.stats.aSot }),
React.createElement(StatBar, { label: “Shots off Target”, home: analysisResult.stats.hSoff, away: analysisResult.stats.aSoff }),
React.createElement(StatBar, { label: “Corners”, home: analysisResult.stats.hC, away: analysisResult.stats.aC })
),
React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: s.cardTitle }, “POISSON OUTCOMES”),
React.createElement(“div”, { style: { display: “flex”, gap: 8, flexWrap: “wrap”, marginBottom: 12 } },
[[“HOME WIN”, (analysisResult.outcomes.hw * 100).toFixed(1) + “%”, C.teal], [“DRAW”, (analysisResult.outcomes.draw * 100).toFixed(1) + “%”, C.muted], [“AWAY WIN”, (analysisResult.outcomes.aw * 100).toFixed(1) + “%”, C.accent], [“BTTS”, (analysisResult.outcomes.btts * 100).toFixed(1) + “%”, C.text], [“OVER 2.5”, (analysisResult.outcomes.o25 * 100).toFixed(1) + “%”, C.text], [“OVER 3.5”, (analysisResult.outcomes.o35 * 100).toFixed(1) + “%”, C.text]].map(function(item) {
return React.createElement(“div”, { key: item[0], style: { background: C.surface, border: “1px solid “ + C.border, borderRadius: 6, padding: “10px 14px”, flex: 1, minWidth: 80 } },
React.createElement(“div”, { style: { fontSize: 11, color: C.muted, marginBottom: 4 } }, item[0]),
React.createElement(“div”, { style: { fontSize: 18, fontWeight: 900, color: item[2], fontFamily: “‘Bebas Neue’, sans-serif” } }, item[1])
);
})
),
React.createElement(“div”, { style: { display: “flex”, flexWrap: “wrap”, gap: 6 } },
analysisResult.outcomes.topScores.slice(0, 8).map(function(sc) {
return React.createElement(“div”, { key: sc.score, style: { background: C.surface, border: “1px solid “ + C.border, borderRadius: 4, padding: “6px 10px”, textAlign: “center”, minWidth: 60 } },
React.createElement(“div”, { style: { fontSize: 16, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif” } }, sc.score),
React.createElement(“div”, { style: { fontSize: 11, color: C.accent, fontWeight: 700 } }, sc.p.toFixed(1) + “%”)
);
})
)
),
React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: s.cardTitle }, “MARKET ANALYSIS”),
analysisResult.markets.map(function(m) {
const zarStake = Math.round((m.kelly / 100) * bankroll);
const inAccu = accu.some(function(a) { return a.id === m.id; });
return React.createElement(“div”, { key: m.id, style: { background: m.id === analysisResult.algoTopId ? C.accent + “11” : C.surface, border: “1px solid “ + (m.id === analysisResult.algoTopId ? C.accent : C.border), borderRadius: 6, padding: “10px 14px”, marginBottom: 6 } },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, alignItems: “flex-start”, flexWrap: “wrap”, gap: 8 } },
React.createElement(“div”, { style: { flex: 1 } },
React.createElement(“div”, { style: { display: “flex”, gap: 6, alignItems: “center”, marginBottom: 4, flexWrap: “wrap” } },
React.createElement(Badge, { color: C.muted }, m.market),
m.id === analysisResult.algoTopId && React.createElement(Badge, { color: C.accent }, “ALGO PICK”),
React.createElement(VerdictBadge, { verdict: m.verdict })
),
React.createElement(“div”, { style: { fontSize: 16, fontWeight: 800 } }, m.sel)
),
React.createElement(“div”, { style: { display: “flex”, gap: 8, alignItems: “center” } },
React.createElement(“div”, { style: { textAlign: “right” } },
React.createElement(“div”, { style: { fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, color: m.edge >= 0 ? C.success : C.danger } }, (m.edge >= 0 ? “+” : “”) + m.edge.toFixed(1) + “%”),
React.createElement(“div”, { style: { fontSize: 11, color: C.muted } }, “EDGE”)
),
React.createElement(“button”, { onClick: function() { addToAccu(m); }, style: { padding: “6px 12px”, borderRadius: 4, background: inAccu ? C.success : C.card, border: “1px solid “ + (inAccu ? C.success : C.borderBright), color: inAccu ? C.bg : C.text, fontSize: 12, fontWeight: 800 } }, inAccu ? “IN ACCU” : “+ ACCU”)
)
),
React.createElement(“div”, { style: { display: “flex”, gap: 16, marginTop: 8, flexWrap: “wrap” } },
React.createElement(“span”, { style: { fontSize: 12, color: C.muted } }, “PROB: “, React.createElement(“b”, { style: { color: C.text } }, (m.prob * 100).toFixed(1) + “%”)),
React.createElement(“span”, { style: { fontSize: 12, color: C.muted } }, “FAIR: “, React.createElement(“b”, { style: { color: C.teal } }, m.fairOdds)),
zarStake > 0 && React.createElement(“span”, { style: { fontSize: 12, color: C.muted } }, “STAKE: “, React.createElement(“b”, { style: { color: C.accent } }, “R” + zarStake))
)
);
})
)
)
);
};

const renderSlip = function() {
const combinedOdds = accu.reduce(function(acc, l) { return acc * l.fairOdds; }, 1);
const avgKelly = accu.length ? accu.reduce(function(s, l) { return s + l.kelly; }, 0) / accu.length : 0;
const suggestedStake = Math.round((avgKelly / 100) * bankroll);
return React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 12 } },
React.createElement(“div”, { style: s.cardTitle }, “ACCUMULATOR SLIP”),
accu.length > 0 && React.createElement(“button”, { onClick: function() { setAccu([]); saveAccu([]); }, style: { padding: “4px 10px”, background: “transparent”, border: “1px solid “ + C.danger, color: C.danger, borderRadius: 3, fontSize: 11, fontWeight: 700 } }, “CLEAR”)
),
accu.length === 0 ? React.createElement(“div”, { style: { color: C.muted, textAlign: “center”, padding: “16px 0” } }, “Add legs via + ACCU buttons”) :
React.createElement(“div”, null,
accu.map(function(leg, i) {
return React.createElement(“div”, { key: i, style: { display: “flex”, justifyContent: “space-between”, alignItems: “center”, padding: “6px 0”, borderBottom: “1px solid “ + C.border } },
React.createElement(“div”, { style: { flex: 1 } },
React.createElement(“div”, { style: { fontSize: 11, color: C.accent, fontWeight: 700 } }, leg.market),
React.createElement(“div”, { style: { fontSize: 13, fontWeight: 800 } }, leg.sel),
leg.fixture && React.createElement(“div”, { style: { fontSize: 11, color: C.muted } }, leg.fixture)
),
React.createElement(“div”, { style: { display: “flex”, gap: 8, alignItems: “center” } },
React.createElement(“span”, { style: { fontSize: 14, fontWeight: 900, fontFamily: “‘Space Mono’, monospace”, color: C.teal } }, leg.fairOdds),
React.createElement(“button”, { onClick: function() { removeFromAccu(i); }, style: { width: 20, height: 20, borderRadius: “50%”, background: C.danger + “33”, color: C.danger, fontSize: 12, fontWeight: 900, border: “none”, lineHeight: “20px” } }, “x”)
)
);
}),
React.createElement(“div”, { style: { marginTop: 12, paddingTop: 10, borderTop: “1px solid “ + C.border } },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, marginBottom: 6 } },
React.createElement(“span”, { style: { color: C.muted, fontSize: 12 } }, “COMBINED ODDS”),
React.createElement(“span”, { style: { color: C.accent, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, fontSize: 18 } }, combinedOdds.toFixed(2))
),
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, marginBottom: 6 } },
React.createElement(“span”, { style: { color: C.muted, fontSize: 12 } }, “SUGGESTED STAKE”),
React.createElement(“span”, { style: { color: C.success, fontWeight: 700 } }, “R” + suggestedStake)
),
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between” } },
React.createElement(“span”, { style: { color: C.muted, fontSize: 12 } }, “POTENTIAL RETURN”),
React.createElement(“span”, { style: { color: C.text, fontWeight: 700 } }, “R” + Math.round(suggestedStake * combinedOdds))
)
)
)
);
};

const renderAudit = function() {
const byMarket = {};
audit.forEach(function(a) {
if (!byMarket[a.market]) byMarket[a.market] = { hits: 0, total: 0 };
byMarket[a.market].total++;
if (a.result === “hit”) byMarket[a.market].hits++;
});
return React.createElement(“div”, null,
React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: s.cardTitle }, “SUCCESS RATES BY MARKET”),
Object.keys(byMarket).length === 0 ? React.createElement(“div”, { style: { color: C.muted, fontSize: 13 } }, “No audit data yet.”) :
Object.entries(byMarket).map(function(entry) {
const market = entry[0];
const data = entry[1];
const rate = Math.round(data.hits / data.total * 100);
return React.createElement(“div”, { key: market, style: { marginBottom: 10 } },
React.createElement(“div”, { style: { display: “flex”, justifyContent: “space-between”, marginBottom: 4 } },
React.createElement(“span”, { style: { fontSize: 13, fontWeight: 700 } }, market),
React.createElement(“span”, { style: { fontSize: 13, fontFamily: “‘Space Mono’, monospace”, color: rate >= 55 ? C.success : rate >= 45 ? C.warning : C.danger } }, rate + “% (” + data.hits + “/” + data.total + “)”)
),
React.createElement(“div”, { style: { height: 4, borderRadius: 2, background: C.border } },
React.createElement(“div”, { style: { height: “100%”, width: rate + “%”, borderRadius: 2, background: rate >= 55 ? C.success : rate >= 45 ? C.warning : C.danger } })
)
);
})
),
React.createElement(“div”, { style: s.card },
React.createElement(“div”, { style: s.cardTitle }, “PREDICTION LOG”),
audit.length === 0 ? React.createElement(“div”, { style: { color: C.muted, fontSize: 13 } }, “No predictions yet.”) :
audit.slice().reverse().map(function(a) {
return React.createElement(“div”, { key: a.id, style: { padding: “8px 0”, borderBottom: “1px solid “ + C.border, display: “flex”, justifyContent: “space-between”, alignItems: “center”, gap: 10, flexWrap: “wrap” } },
React.createElement(“div”, null,
React.createElement(“div”, { style: { fontSize: 11, color: C.muted } }, a.fixture),
React.createElement(“div”, { style: { fontSize: 14, fontWeight: 700 } }, a.sel)
),
React.createElement(“div”, { style: { display: “flex”, gap: 8, alignItems: “center” } },
React.createElement(Badge, { color: C.accent }, a.market),
React.createElement(Badge, { color: a.result === “hit” ? C.success : a.result === “miss” ? C.danger : C.muted }, a.result === “pending” ? “PENDING” : a.result === “hit” ? “HIT” : “MISS”),
a.result === “pending” && React.createElement(“div”, { style: { display: “flex”, gap: 4 } },
React.createElement(“button”, { onClick: function() { const u = audit.map(function(x) { return x.id === a.id ? Object.assign({}, x, { result: “hit” }) : x; }); setAudit(u); saveAudit(u); }, style: { padding: “3px 8px”, background: C.success + “22”, border: “1px solid “ + C.success, color: C.success, borderRadius: 3, fontSize: 11, fontWeight: 700 } }, “HIT”),
React.createElement(“button”, { onClick: function() { const u = audit.map(function(x) { return x.id === a.id ? Object.assign({}, x, { result: “miss” }) : x; }); setAudit(u); saveAudit(u); }, style: { padding: “3px 8px”, background: C.danger + “22”, border: “1px solid “ + C.danger, color: C.danger, borderRadius: 3, fontSize: 11, fontWeight: 700 } }, “MISS”)
)
)
);
})
)
);
};

const tabs = [
{ key: “fixtures”, label: “FIXTURES” },
{ key: “analysis”, label: “ANALYSIS” + (analysisResult ? “ *” : “”) },
{ key: “slip”, label: “SLIP (” + accu.length + “)” },
{ key: “audit”, label: “AUDIT” },
];

return React.createElement(“div”, { style: s.safe },
React.createElement(“div”, { style: s.header },
React.createElement(“div”, null,
React.createElement(“div”, { style: s.appTitle }, “iP”, React.createElement(“span”, { style: { color: C.accent } }, “H”), “ANDA”),
React.createElement(“div”, { style: s.tagline }, “HUSTLER WITH AN EDGE”)
),
React.createElement(“div”, { style: { display: “flex”, gap: 8, alignItems: “center”, flexWrap: “wrap” } },
React.createElement(“span”, { style: { fontSize: 12, color: C.muted } }, “BANKROLL:”),
React.createElement(“span”, { style: { color: C.success, fontWeight: 800, fontSize: 14, fontFamily: “‘Space Mono’, monospace” } }, “R” + bankroll.toLocaleString()),
[500, 1000, 2000, 5000].map(function(v) {
return React.createElement(“button”, { key: v, onClick: function() { setBankroll(v); }, style: { padding: “4px 8px”, borderRadius: 3, background: bankroll === v ? C.teal : C.card, border: “1px solid “ + (bankroll === v ? C.teal : C.border), color: bankroll === v ? C.bg : C.muted, fontSize: 11, fontWeight: 700 } }, “R” + v);
}),
React.createElement(“button”, { onClick: function() { setShowApiSetup(true); }, style: { padding: “4px 10px”, background: C.card, border: “1px solid “ + C.border, color: C.muted, borderRadius: 3, fontSize: 11, fontWeight: 700 } }, “API”)
)
),
React.createElement(“div”, { style: s.tabBar },
tabs.map(function(tab) {
return React.createElement(“button”, { key: tab.key, onClick: function() { setActiveTab(tab.key); }, style: { padding: “12px 20px”, background: “transparent”, borderBottom: “3px solid “ + (activeTab === tab.key ? C.accent : “transparent”), color: activeTab === tab.key ? C.accent : C.muted, fontSize: 13, fontWeight: 800, letterSpacing: 0.8 } }, tab.label);
})
),
React.createElement(“div”, { style: s.body },
React.createElement(“div”, { style: s.inner },
activeTab === “fixtures” && renderFixtures(),
activeTab === “analysis” && renderAnalysis(),
activeTab === “slip” && renderSlip(),
activeTab === “audit” && renderAudit()
)
)
);
}
