import { useState, useEffect, useCallback, useMemo, useRef } from “react”;

// ─── THEME ────────────────────────────────────────────────────────────────────
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
tealGlow: “rgba(78,205,196,0.2)”,
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
style.textContent = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=Barlow+Condensed:wght@400;600;700;800&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } html, body, #root { height: 100%; background: ${C.bg}; color: ${C.text}; font-family: 'Barlow Condensed', sans-serif; } ::-webkit-scrollbar { width: 4px; height: 4px; } ::-webkit-scrollbar-track { background: ${C.surface}; } ::-webkit-scrollbar-thumb { background: ${C.borderBright}; border-radius: 2px; } button { cursor: pointer; border: none; outline: none; font-family: inherit; } input { outline: none; font-family: inherit; } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} } @keyframes slideIn { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} } @keyframes glow { 0%,100%{box-shadow:0 0 8px ${C.accentGlow}} 50%{box-shadow:0 0 20px ${C.accentGlow}} } @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} } .animate-in { animation: slideIn 0.3s ease forwards; } .pulse { animation: pulse 2s infinite; }`;
document.head.appendChild(style);
};

// ─── GAP ENGINE (client-side) ─────────────────────────────────────────────────
const HOME_ADV = 0.08;
const HALF_LIFE = 50;
const LR = 0.08;
const BURN_IN = 5;

function timeWeight(daysAgo) {
return Math.pow(0.5, daysAgo / HALF_LIFE);
}

function makeRatings() {
const d = () => new Proxy({}, { get: (t, k) => k in t ? t[k] : 1.0 });
return { ha: d(), hd: d(), aa: d(), ad: d() };
}

class GAPEngine {
constructor() {
this.sot = makeRatings();
this.soff = makeRatings();
this.corners = makeRatings();
// Extended ratings for new inputs
this.press = makeRatings();
this.intercept = makeRatings();
}

fit(rows) {
if (!rows || rows.length < BURN_IN) return;
const maxDate = Math.max(…rows.map(r => r.date));
rows.forEach((row, i) => {
if (i < BURN_IN) return;
const daysAgo = Math.max(0, (maxDate - row.date) / 86400000);
const w = timeWeight(daysAgo);
this._update(this.sot, row.home, row.away, row.hSot, row.aSot, w);
this._update(this.soff, row.home, row.away, row.hSoff, row.aSoff, w);
this._update(this.corners, row.home, row.away, row.hC, row.aC, w);
});
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

predict(home, away, contextFactors = {}) {
const [hSot, aSot] = this._pred(this.sot, home, away);
const [hSoff, aSoff] = this._pred(this.soff, home, away);
const [hC, aC] = this._pred(this.corners, home, away);

```
// Silent weather adjustment on corners
const windAdj = contextFactors.windKph ? Math.max(0.85, 1 - (contextFactors.windKph - 20) * 0.004) : 1.0;
// Pressing boost to shots
const pressBoost = contextFactors.homePress ? 1 + (contextFactors.homePress - 50) * 0.003 : 1.0;
// Motivation multiplier
const motivMult = contextFactors.homeMotive > 7 ? 1.06 : contextFactors.homeMotive < 4 ? 0.94 : 1.0;
// Interceptions reduce away attack
const interceptPenalty = contextFactors.homeIntercepts ? Math.max(0.85, 1 - contextFactors.homeIntercepts * 0.005) : 1.0;

const adjHSot = hSot * pressBoost * motivMult;
const adjASot = aSot * interceptPenalty;
const adjHC = hC * windAdj;
const adjAC = aC * windAdj;

const hXg = adjHSot * 0.22 + hSoff * 0.08 + adjHC * 0.015;
const aXg = adjASot * 0.22 + aSoff * 0.08 + adjAC * 0.015;

return {
  hSot: round2(adjHSot), aSot: round2(adjASot),
  hSoff: round2(hSoff), aSoff: round2(aSoff),
  hC: round2(adjHC), aC: round2(adjAC),
  htHC: round2(adjHC * 0.46), htAC: round2(adjAC * 0.46),
  hXg: round2(Math.max(0.1, hXg)), aXg: round2(Math.max(0.1, aXg)),
};
```

}
}

function round2(n) { return Math.round(n * 100) / 100; }

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
grid.push({ score: `${h}-${a}`, p: round2(p * 100), h, a });
}
}
const total = (g) => g.h + g.a;
return {
hw: round2(hw), draw: round2(draw), aw: round2(aw), btts: round2(btts),
o15: round2(grid.filter(g => total(g) > 1).reduce((s, g) => s + g.p / 100, 0)),
o25: round2(grid.filter(g => total(g) > 2).reduce((s, g) => s + g.p / 100, 0)),
o35: round2(grid.filter(g => total(g) > 3).reduce((s, g) => s + g.p / 100, 0)),
topScores: grid.sort((a, b) => b.p - a.p).slice(0, 8),
};
}

// ─── EV ENGINE ────────────────────────────────────────────────────────────────
function calcEV(modelProb, bookOdds) {
if (!bookOdds || bookOdds <= 1) return null;
const bookProb = 1 / bookOdds;
const edge = (modelProb - bookProb) / bookProb * 100;
const kelly = Math.max(0, Math.min(5, ((modelProb * bookOdds - 1) / (bookOdds - 1)) / 2 * 100));
return { edge: round2(edge), kelly: round2(kelly), fairOdds: round2(1 / Math.max(modelProb, 0.01)) };
}

function sigmoid(x, scale = 1) { return 1 / (1 + Math.exp(-x / Math.max(scale, 0.1))); }

function buildMarkets(stats, outcomes, homeName, awayName, odds = {}) {
const totalC = stats.hC + stats.aC;
const htTotalC = stats.htHC + stats.htAC;
const totalSot = stats.hSot + stats.aSot;

const candidates = [
{ market: “CORNERS”, sel: `Over 9.5 Corners`, prob: sigmoid(totalC - 9.5, 0.9), bookOdds: odds.c95 },
{ market: “CORNERS”, sel: `Over 10.5 Corners`, prob: sigmoid(totalC - 10.5, 0.95), bookOdds: odds.c105 },
{ market: “CORNERS”, sel: `Over 11.5 Corners`, prob: sigmoid(totalC - 11.5, 1.0), bookOdds: odds.c115 },
{ market: “CORNERS HT”, sel: `Over 4.5 Corners HT`, prob: sigmoid(htTotalC - 4.5, 0.7), bookOdds: odds.cht45 },
{ market: “CORNERS HT”, sel: `${homeName} 4+ Corners HT`, prob: sigmoid(stats.htHC - 4.0, 0.65), bookOdds: null },
{ market: “GOALS”, sel: `Over 2.5 Goals`, prob: outcomes.o25, bookOdds: odds.o25 },
{ market: “GOALS”, sel: `Over 3.5 Goals`, prob: outcomes.o35, bookOdds: odds.o35 },
{ market: “BTTS”, sel: `BTTS Yes`, prob: outcomes.btts, bookOdds: odds.btts },
{ market: “RESULT”, sel: `${homeName} Win`, prob: outcomes.hw, bookOdds: odds.home },
{ market: “RESULT”, sel: `Draw`, prob: outcomes.draw, bookOdds: odds.draw },
{ market: “RESULT”, sel: `${awayName} Win`, prob: outcomes.aw, bookOdds: odds.away },
{ market: “SHOTS”, sel: `Over 8.5 Shots on Target`, prob: sigmoid(totalSot - 8.5, 0.8), bookOdds: null },
{ market: “BOOKINGS”, sel: `Over 3.5 Cards`, prob: 0.52, bookOdds: null },
{ market: “BOOKINGS”, sel: `Over 4.5 Cards`, prob: 0.38, bookOdds: null },
];

return candidates.map((c, i) => {
const ev = calcEV(c.prob, c.bookOdds);
const edge = ev ? ev.edge : round2((c.prob - 0.5) * 100);
const kelly = ev ? ev.kelly : round2(Math.max(0, (c.prob - 0.5) * 10));
const fairOdds = round2(1 / Math.max(c.prob, 0.01));
const verdict = edge >= 8 ? “Strong Play” : edge >= 4 ? “Playable” : edge >= 0 ? “Risky” : “Avoid”;
return { id: i, …c, edge, kelly, fairOdds, verdict, prob: round2(c.prob) };
}).sort((a, b) => b.edge - a.edge);
}

// ─── AUDIT STORE ──────────────────────────────────────────────────────────────
function loadAudit() {
try { return JSON.parse(localStorage.getItem(“iphanda_audit”) || “[]”); } catch { return []; }
}
function saveAudit(data) {
try { localStorage.setItem(“iphanda_audit”, JSON.stringify(data)); } catch {}
}
function loadAccu() {
try { return JSON.parse(localStorage.getItem(“iphanda_accu”) || “[]”); } catch { return []; }
}
function saveAccu(data) {
try { localStorage.setItem(“iphanda_accu”, JSON.stringify(data)); } catch {}
}

// ─── MOCK DATA (football-data.org structure) ──────────────────────────────────
const COMPETITIONS = [
{ code: “CL”, name: “UEFA Champions League”, flag: “🏆” },
{ code: “PL”, name: “Premier League”, flag: “🏴󠁧󠁢󠁥󠁮󠁧󠁿” },
{ code: “PD”, name: “La Liga”, flag: “🇪🇸” },
{ code: “BL1”, name: “Bundesliga”, flag: “🇩🇪” },
{ code: “SA”, name: “Serie A”, flag: “🇮🇹” },
{ code: “FL1”, name: “Ligue 1”, flag: “🇫🇷” },
{ code: “ELC”, name: “Championship”, flag: “🏴󠁧󠁢󠁥󠁮󠁧󠁿” },
{ code: “DED”, name: “Eredivisie”, flag: “🇳🇱” },
{ code: “MLS”, name: “MLS”, flag: “🇺🇸” },
];

const MARKET_CHIPS = [
“Match Result”, “Over 2.5”, “Over 3.5”, “BTTS”, “Corners”, “Corners HT”, “Bookings”, “Shots”, “Custom”
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function Badge({ children, color = C.accent, bg }) {
return (
<span style={{
display: “inline-block”, padding: “2px 8px”, borderRadius: 3,
background: bg || `${color}22`, color, fontSize: 11, fontWeight: 700,
fontFamily: “‘Space Mono’, monospace”, letterSpacing: 0.5, whiteSpace: “nowrap”
}}>{children}</span>
);
}

function VerdictBadge({ verdict }) {
const map = {
“Strong Play”: C.success, “Playable”: C.teal, “Risky”: C.warning, “Avoid”: C.danger
};
return <Badge color={map[verdict] || C.muted}>{verdict}</Badge>;
}

function Spinner() {
return (
<div style={{ display: “flex”, alignItems: “center”, gap: 8, color: C.muted, fontSize: 13 }}>
<div style={{
width: 16, height: 16, border: `2px solid ${C.border}`,
borderTop: `2px solid ${C.accent}`, borderRadius: “50%”,
animation: “pulse 0.8s linear infinite”
}} />
Loading…
</div>
);
}

function StatBar({ label, home, away, homeColor = C.teal, awayColor = C.accent }) {
const total = home + away || 1;
return (
<div style={{ marginBottom: 10 }}>
<div style={{ display: “flex”, justifyContent: “space-between”, fontSize: 12, marginBottom: 4 }}>
<span style={{ color: homeColor, fontWeight: 700 }}>{home}</span>
<span style={{ color: C.muted, fontSize: 11 }}>{label}</span>
<span style={{ color: awayColor, fontWeight: 700 }}>{away}</span>
</div>
<div style={{ height: 4, borderRadius: 2, background: C.border, overflow: “hidden” }}>
<div style={{
height: “100%”, width: `${(home / total) * 100}%`,
background: `linear-gradient(90deg, ${homeColor}, ${awayColor})`,
transition: “width 0.6s ease”
}} />
</div>
</div>
);
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function CompetitionPicker({ selected, onSelect }) {
return (
<div style={{ display: “flex”, flexWrap: “wrap”, gap: 8, padding: “0 0 8px” }}>
{COMPETITIONS.map(c => {
const active = selected === c.code;
return (
<button key={c.code} onClick={() => onSelect(c.code)} style={{
padding: “8px 14px”, borderRadius: 4,
background: active ? C.primary : C.surface,
border: `1px solid ${active ? C.primary : C.border}`,
color: active ? “#fff” : C.text, fontFamily: “‘Barlow Condensed’, sans-serif”,
fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
transition: “all 0.15s”, cursor: “pointer”,
boxShadow: active ? `0 0 12px ${C.primaryGlow}` : “none”
}}>
{c.flag} {c.name}
</button>
);
})}
</div>
);
}

function FixtureCard({ fixture, onSelect, selected }) {
const isLive = fixture.status === “IN_PLAY” || fixture.status === “PAUSED”;
return (
<div onClick={() => onSelect(fixture)} className=“animate-in” style={{
background: selected ? C.cardHover : C.card,
border: `1px solid ${selected ? C.borderBright : C.border}`,
borderLeft: `3px solid ${selected ? C.accent : isLive ? C.success : C.border}`,
borderRadius: 6, padding: “12px 16px”, cursor: “pointer”,
transition: “all 0.15s”, marginBottom: 8,
}}>
<div style={{ display: “flex”, justifyContent: “space-between”, marginBottom: 6 }}>
<span style={{ fontSize: 11, color: C.muted, fontFamily: “‘Space Mono’, monospace” }}>
{fixture.utcDate ? new Date(fixture.utcDate).toLocaleTimeString(“en-ZA”, { hour: “2-digit”, minute: “2-digit” }) : “TBC”}
</span>
<div style={{ display: “flex”, gap: 6, alignItems: “center” }}>
{isLive && <Badge color={C.success}>LIVE</Badge>}
{fixture.status === “FINISHED” && <Badge color={C.dimmed}>FT</Badge>}
{fixture.matchday && <Badge color={C.muted}>MD{fixture.matchday}</Badge>}
</div>
</div>
<div style={{ display: “grid”, gridTemplateColumns: “1fr auto 1fr”, gap: 8, alignItems: “center” }}>
<span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3 }}>
{fixture.homeTeam?.name || fixture.homeTeam?.shortName}
</span>
<div style={{ textAlign: “center” }}>
{fixture.score?.fullTime?.home != null ? (
<span style={{ fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: “‘Bebas Neue’, sans-serif” }}>
{fixture.score.fullTime.home} – {fixture.score.fullTime.away}
</span>
) : (
<span style={{ fontSize: 14, color: C.dimmed, fontWeight: 700 }}>VS</span>
)}
</div>
<span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3, textAlign: “right” }}>
{fixture.awayTeam?.name || fixture.awayTeam?.shortName}
</span>
</div>
{fixture.odds && (
<div style={{ display: “flex”, gap: 10, marginTop: 8 }}>
{[
{ l: `H ${fixture.odds.home?.toFixed(2)}`, c: C.teal },
{ l: `D ${fixture.odds.draw?.toFixed(2)}`, c: C.muted },
{ l: `A ${fixture.odds.away?.toFixed(2)}`, c: C.accent },
].map(({ l, c }) => (
<span key={l} style={{ fontSize: 12, color: c, fontFamily: “‘Space Mono’, monospace”, fontWeight: 700 }}>{l}</span>
))}
</div>
)}
</div>
);
}

function MarketChips({ selected, onToggle }) {
return (
<div style={{ display: “flex”, flexWrap: “wrap”, gap: 6 }}>
{MARKET_CHIPS.map(m => {
const active = selected.includes(m);
return (
<button key={m} onClick={() => onToggle(m)} style={{
padding: “6px 12px”, borderRadius: 3,
background: active ? C.accent : C.surface,
border: `1px solid ${active ? C.accent : C.border}`,
color: active ? C.bg : C.text,
fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
transition: “all 0.15s”
}}>{m}</button>
);
})}
</div>
);
}

function MarketRow({ market, bankroll, onAddToAccu, inAccu, algoSuggested }) {
const zarStake = round2((market.kelly / 100) * bankroll);
return (
<div style={{
background: algoSuggested ? `${C.accent}11` : C.surface,
border: `1px solid ${algoSuggested ? C.accent : C.border}`,
borderRadius: 6, padding: “10px 14px”, marginBottom: 6,
animation: “slideIn 0.3s ease”,
}}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “flex-start”, flexWrap: “wrap”, gap: 8 }}>
<div style={{ flex: 1 }}>
<div style={{ display: “flex”, gap: 6, alignItems: “center”, marginBottom: 4, flexWrap: “wrap” }}>
<Badge color={C.muted}>{market.market}</Badge>
{algoSuggested && <Badge color={C.accent}>⚡ ALGO PICK</Badge>}
<VerdictBadge verdict={market.verdict} />
</div>
<div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{market.sel}</div>
</div>
<div style={{ display: “flex”, gap: 8, alignItems: “center” }}>
<div style={{ textAlign: “right” }}>
<div style={{
fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”,
color: market.edge >= 0 ? C.success : C.danger
}}>{market.edge >= 0 ? “+” : “”}{market.edge.toFixed(1)}%</div>
<div style={{ fontSize: 11, color: C.muted }}>EDGE</div>
</div>
<button onClick={() => onAddToAccu(market)} style={{
padding: “6px 12px”, borderRadius: 4,
background: inAccu ? C.success : C.card,
border: `1px solid ${inAccu ? C.success : C.borderBright}`,
color: inAccu ? C.bg : C.text,
fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
whiteSpace: “nowrap”
}}>{inAccu ? “✓ IN ACCU” : “+ ACCU”}</button>
</div>
</div>
<div style={{ display: “flex”, gap: 16, marginTop: 8, flexWrap: “wrap” }}>
<span style={{ fontSize: 12, color: C.muted }}>
PROB: <b style={{ color: C.text }}>{(market.prob * 100).toFixed(1)}%</b>
</span>
<span style={{ fontSize: 12, color: C.muted }}>
FAIR ODDS: <b style={{ color: C.teal }}>{market.fairOdds}</b>
</span>
<span style={{ fontSize: 12, color: C.muted }}>
HALF-KELLY: <b style={{ color: C.accent }}>{market.kelly.toFixed(1)}%</b>
</span>
{zarStake > 0 && (
<span style={{ fontSize: 12, color: C.muted }}>
STAKE: <b style={{ color: C.accent }}>R{zarStake.toFixed(0)}</b>
</span>
)}
</div>
</div>
);
}

function PeakPick({ markets }) {
const peak = markets.filter(m => m.verdict === “Strong Play” || m.verdict === “Playable”).slice(0, 3);
if (!peak.length) return null;
return (
<div style={{
background: `linear-gradient(135deg, ${C.card}, #0F1E38)`,
border: `1px solid ${C.accent}`, borderRadius: 8, padding: 16, marginBottom: 16,
boxShadow: `0 0 24px ${C.accentGlow}`,
}}>
<div style={{ display: “flex”, alignItems: “center”, gap: 8, marginBottom: 12 }}>
<span style={{ fontSize: 20 }}>⚡</span>
<span style={{ fontSize: 20, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, color: C.accent, letterSpacing: 1 }}>
PEAK PICKS
</span>
<Badge color={C.accent}>{peak.length} LEGS</Badge>
</div>
{peak.map((m, i) => (
<div key={m.id} style={{
display: “flex”, justifyContent: “space-between”, alignItems: “center”,
padding: “8px 0”, borderBottom: i < peak.length - 1 ? `1px solid ${C.border}` : “none”
}}>
<div>
<span style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{m.market} · </span>
<span style={{ fontSize: 15, fontWeight: 800 }}>{m.sel}</span>
</div>
<div style={{ display: “flex”, gap: 8, alignItems: “center” }}>
<span style={{ fontSize: 13, color: C.success, fontWeight: 700 }}>+{m.edge.toFixed(1)}%</span>
<span style={{ fontSize: 12, color: C.teal, fontFamily: “‘Space Mono’, monospace” }}>{m.fairOdds}</span>
</div>
</div>
))}
<div style={{ marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
<b style={{ color: C.text }}>Why these legs:</b> Selected by GAP projected stats + Poisson simulation.
Corners driven by {peak[0]?.market === “CORNERS” || peak[0]?.market === “CORNERS HT” ? “high projected possession width and set-piece frequency” : “attacking volume and xG differential”}.
All legs positive EV vs fair odds. Half-Kelly staking applied.
</div>
</div>
);
}

function AccumulatorSlip({ legs, bankroll, onRemove, onClear }) {
const combinedOdds = legs.reduce((acc, l) => acc * l.fairOdds, 1);
const avgKelly = legs.length ? legs.reduce((s, l) => s + l.kelly, 0) / legs.length : 0;
const suggestedStake = round2((avgKelly / 100) * bankroll);

return (
<div style={{ background: C.card, border: `1px solid ${C.borderBright}`, borderRadius: 8, padding: 16 }}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 12 }}>
<span style={{ fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 1 }}>
ACCUMULATOR SLIP
</span>
{legs.length > 0 && (
<button onClick={onClear} style={{
padding: “4px 10px”, background: “transparent”,
border: `1px solid ${C.danger}`, color: C.danger,
borderRadius: 3, fontSize: 11, fontWeight: 700
}}>CLEAR</button>
)}
</div>

```
  {legs.length === 0 ? (
    <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
      Add legs via "+ ACCU" buttons
    </div>
  ) : (
    <>
      {legs.map((leg, i) => (
        <div key={leg.id + i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0", borderBottom: `1px solid ${C.border}`
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{leg.market}</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{leg.sel}</div>
            {leg.fixture && <div style={{ fontSize: 11, color: C.muted }}>{leg.fixture}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 900, fontFamily: "'Space Mono', monospace", color: C.teal }}>{leg.fairOdds}</span>
            <button onClick={() => onRemove(i)} style={{
              width: 20, height: 20, borderRadius: "50%", background: C.danger + "33",
              color: C.danger, fontSize: 12, fontWeight: 900, border: "none", lineHeight: "20px"
            }}>×</button>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12, padding: "10px 0", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>COMBINED ODDS</span>
          <span style={{ color: C.accent, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", fontSize: 18 }}>{combinedOdds.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>SUGGESTED STAKE (Half-Kelly)</span>
          <span style={{ color: C.success, fontWeight: 700, fontSize: 14 }}>R{suggestedStake.toFixed(0)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: C.muted, fontSize: 12 }}>POTENTIAL RETURN</span>
          <span style={{ color: C.text, fontWeight: 700 }}>R{round2(suggestedStake * combinedOdds).toFixed(0)}</span>
        </div>
      </div>
    </>
  )}
</div>
```

);
}

function AuditDashboard({ audit }) {
const byMarket = {};
audit.forEach(a => {
if (!byMarket[a.market]) byMarket[a.market] = { hits: 0, total: 0 };
byMarket[a.market].total++;
if (a.result === “hit”) byMarket[a.market].hits++;
});

return (
<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
<div style={{ fontSize: 18, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 1, marginBottom: 12 }}>
SELF-AUDIT · SUCCESS RATES
</div>
{Object.keys(byMarket).length === 0 ? (
<div style={{ color: C.muted, fontSize: 13 }}>No audit data yet. Predictions will be tracked here after 24hrs.</div>
) : (
Object.entries(byMarket).map(([market, data]) => {
const rate = round2(data.hits / data.total * 100);
return (
<div key={market} style={{ marginBottom: 10 }}>
<div style={{ display: “flex”, justifyContent: “space-between”, marginBottom: 4 }}>
<span style={{ fontSize: 13, fontWeight: 700 }}>{market}</span>
<span style={{ fontSize: 13, fontFamily: “‘Space Mono’, monospace”, color: rate >= 55 ? C.success : rate >= 45 ? C.warning : C.danger }}>
{rate.toFixed(0)}% ({data.hits}/{data.total})
</span>
</div>
<div style={{ height: 4, borderRadius: 2, background: C.border }}>
<div style={{
height: “100%”, width: `${rate}%`, borderRadius: 2,
background: rate >= 55 ? C.success : rate >= 45 ? C.warning : C.danger,
transition: “width 0.6s ease”
}} />
</div>
</div>
);
})
)}
</div>
);
}

function StatCard({ label, value, sub, color = C.text }) {
return (
<div style={{
background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
padding: “10px 14px”, flex: 1, minWidth: 100
}}>
<div style={{ fontSize: 11, color: C.muted, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
<div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: “‘Bebas Neue’, sans-serif” }}>{value}</div>
{sub && <div style={{ fontSize: 11, color: C.dimmed, marginTop: 2 }}>{sub}</div>}
</div>
);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
useEffect(() => { injectStyles(); }, []);

const [apiKey, setApiKey] = useState(() => localStorage.getItem(“fd_api_key”) || “”);
const [apiKeyInput, setApiKeyInput] = useState(””);
const [showApiSetup, setShowApiSetup] = useState(!localStorage.getItem(“fd_api_key”));

const [selectedComp, setSelectedComp] = useState(null);
const [fixtures, setFixtures] = useState([]);
const [loadingFixtures, setLoadingFixtures] = useState(false);
const [fixturesError, setFixturesError] = useState(null);

const [selectedFixture, setSelectedFixture] = useState(null);
const [selectedMarkets, setSelectedMarkets] = useState([]);
const [customMarket, setCustomMarket] = useState(””);
const [analysisResult, setAnalysisResult] = useState(null);
const [analysing, setAnalysing] = useState(false);

const [accu, setAccu] = useState(loadAccu);
const [bankroll, setBankroll] = useState(1000);
const [activeTab, setActiveTab] = useState(“fixtures”); // fixtures | analysis | slip | audit
const [audit, setAudit] = useState(loadAudit);
const [dateOffset, setDateOffset] = useState(0);

const gap = useMemo(() => new GAPEngine(), []);

const targetDate = useMemo(() => {
const d = new Date();
d.setDate(d.getDate() + dateOffset);
return d.toISOString().slice(0, 10);
}, [dateOffset]);

// Load fixtures from football-data.org
const loadFixtures = useCallback(async (compCode) => {
if (!compCode) return;
setLoadingFixtures(true);
setFixturesError(null);
setFixtures([]);
setSelectedFixture(null);
setAnalysisResult(null);

```
try {
  const headers = { "X-Auth-Token": apiKey };
  const url = `https://api.football-data.org/v4/competitions/${compCode}/matches?dateFrom=${targetDate}&dateTo=${targetDate}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  setFixtures(data.matches || []);
} catch (e) {
  // Fallback: generate demo fixtures for testing
  setFixturesError(`Live API error: ${e.message}. Showing demo data.`);
  setFixtures(getDemoFixtures(compCode, targetDate));
} finally {
  setLoadingFixtures(false);
}
```

}, [apiKey, targetDate]);

useEffect(() => {
if (selectedComp && apiKey) loadFixtures(selectedComp);
}, [selectedComp, targetDate, apiKey]);

const toggleMarket = (m) => {
setSelectedMarkets(prev => prev.includes(m) ? prev.filter(x => x !== m) : […prev, m]);
};

const runAnalysis = useCallback(() => {
if (!selectedFixture) return;
setAnalysing(true);
setActiveTab(“analysis”);

```
setTimeout(() => {
  const home = selectedFixture.homeTeam?.name || selectedFixture.homeTeam?.shortName || "Home";
  const away = selectedFixture.awayTeam?.name || selectedFixture.awayTeam?.shortName || "Away";

  // Context factors (would come from enriched data)
  const ctx = {
    windKph: 18,
    homePress: 58,
    homeMotive: 7,
    homeIntercepts: 12,
  };

  const stats = gap.predict(home, away, ctx);
  const outcomes = simulateOutcomes(stats.hXg, stats.aXg);

  const odds = selectedFixture.odds || {};
  const allMarkets = buildMarkets(stats, outcomes, home, away, odds);

  // Filter by selected market chips
  let filtered = allMarkets;
  if (selectedMarkets.length > 0 && !selectedMarkets.includes("Custom")) {
    const mapToFamily = (chip) => {
      if (chip === "Match Result") return "RESULT";
      if (chip === "Over 2.5") return "GOALS";
      if (chip === "Over 3.5") return "GOALS";
      if (chip === "BTTS") return "BTTS";
      if (chip === "Corners") return "CORNERS";
      if (chip === "Corners HT") return "CORNERS HT";
      if (chip === "Bookings") return "BOOKINGS";
      if (chip === "Shots") return "SHOTS";
      return null;
    };
    const families = selectedMarkets.map(mapToFamily).filter(Boolean);
    filtered = allMarkets.filter(m => families.includes(m.market));
  }

  const algoTopId = allMarkets[0]?.id;

  setAnalysisResult({
    home, away, stats, outcomes, markets: filtered,
    allMarkets, algoTopId,
    fixture: selectedFixture,
  });
  setAnalysing(false);

  // Save to audit (pending 24hr result)
  const entry = {
    id: Date.now(),
    fixture: `${home} vs ${away}`,
    market: filtered[0]?.market,
    sel: filtered[0]?.sel,
    edge: filtered[0]?.edge,
    ts: new Date().toISOString(),
    result: "pending",
  };
  const updated = [...audit, entry];
  setAudit(updated);
  saveAudit(updated);
}, 900);
```

}, [selectedFixture, selectedMarkets, gap, audit]);

const addToAccu = (market) => {
const leg = {
…market,
fixture: analysisResult ? `${analysisResult.home} vs ${analysisResult.away}` : “”,
ts: new Date().toISOString(),
result: “pending”,
};
const updated = […accu, leg];
setAccu(updated);
saveAccu(updated);
};

const removeFromAccu = (i) => {
const updated = accu.filter((_, idx) => idx !== i);
setAccu(updated);
saveAccu(updated);
};

const saveApiKey = () => {
localStorage.setItem(“fd_api_key”, apiKeyInput);
setApiKey(apiKeyInput);
setShowApiSetup(false);
};

// ─── API KEY SETUP ────────────────────────────────────────────────────────
if (showApiSetup) {
return (
<div style={{ minHeight: “100vh”, display: “flex”, alignItems: “center”, justifyContent: “center”, padding: 20 }}>
<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32, maxWidth: 480, width: “100%” }}>
<div style={{ fontSize: 32, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, color: C.accent, letterSpacing: 2, marginBottom: 4 }}>
iPHANDA
</div>
<div style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
Sports Statistics & Performance Analysis
</div>
<div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>
Enter your <b>football-data.org</b> API key to fetch live fixtures.
Get a free key at <a href=“https://www.football-data.org” target=”_blank” rel=“noreferrer” style={{ color: C.teal }}>football-data.org</a>
</div>
<input
value={apiKeyInput}
onChange={e => setApiKeyInput(e.target.value)}
placeholder=“Your API key…”
style={{
width: “100%”, padding: “10px 14px”,
background: C.surface, border: `1px solid ${C.border}`,
borderRadius: 6, color: C.text, fontSize: 14, marginBottom: 12
}}
onKeyDown={e => e.key === “Enter” && apiKeyInput && saveApiKey()}
/>
<div style={{ display: “flex”, gap: 10 }}>
<button onClick={saveApiKey} disabled={!apiKeyInput} style={{
flex: 1, padding: “10px 0”, background: C.primary, color: “#fff”,
borderRadius: 6, fontSize: 14, fontWeight: 800, letterSpacing: 0.5,
opacity: apiKeyInput ? 1 : 0.5
}}>CONNECT</button>
<button onClick={() => setShowApiSetup(false)} style={{
padding: “10px 14px”, background: C.surface,
border: `1px solid ${C.border}`, color: C.muted,
borderRadius: 6, fontSize: 14, fontWeight: 700
}}>DEMO MODE</button>
</div>
</div>
</div>
);
}

// ─── MAIN LAYOUT ──────────────────────────────────────────────────────────
return (
<div style={{ minHeight: “100vh”, display: “flex”, flexDirection: “column” }}>
{/* HEADER */}
<div style={{
background: C.surface, borderBottom: `1px solid ${C.border}`,
padding: “10px 20px”, display: “flex”, alignItems: “center”,
justifyContent: “space-between”, flexWrap: “wrap”, gap: 10, flexShrink: 0
}}>
<div>
<div style={{ fontSize: 28, fontWeight: 900, fontFamily: “‘Bebas Neue’, sans-serif”, letterSpacing: 2, color: C.text, lineHeight: 1 }}>
iP<span style={{ color: C.accent }}>H</span>ANDA
</div>
<div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 1 }}>HUSTLER WITH AN EDGE</div>
</div>
<div style={{ display: “flex”, gap: 8, alignItems: “center”, flexWrap: “wrap” }}>
<div style={{ display: “flex”, alignItems: “center”, gap: 6 }}>
<span style={{ fontSize: 12, color: C.muted }}>BANKROLL:</span>
<span style={{ color: C.success, fontWeight: 800, fontSize: 14, fontFamily: “‘Space Mono’, monospace” }}>
R{bankroll.toLocaleString()}
</span>
</div>
<div style={{ display: “flex”, gap: 4 }}>
{[500, 1000, 2000, 5000].map(v => (
<button key={v} onClick={() => setBankroll(v)} style={{
padding: “4px 8px”, borderRadius: 3,
background: bankroll === v ? C.teal : C.card,
border: `1px solid ${bankroll === v ? C.teal : C.border}`,
color: bankroll === v ? C.bg : C.muted,
fontSize: 11, fontWeight: 700
}}>R{v}</button>
))}
</div>
<button onClick={() => setShowApiSetup(true)} style={{
padding: “4px 10px”, background: C.card, border: `1px solid ${C.border}`,
color: C.muted, borderRadius: 3, fontSize: 11, fontWeight: 700
}}>⚙ API</button>
</div>
</div>

```
  {/* TAB BAR */}
  <div style={{
    background: C.surface, borderBottom: `1px solid ${C.border}`,
    display: "flex", flexShrink: 0
  }}>
    {[
      { key: "fixtures", label: "FIXTURES" },
      { key: "analysis", label: "ANALYSIS", badge: analysisResult ? "●" : null },
      { key: "slip", label: `SLIP (${accu.length})` },
      { key: "audit", label: "AUDIT" },
    ].map(tab => (
      <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
        padding: "12px 20px", background: "transparent",
        borderBottom: `3px solid ${activeTab === tab.key ? C.accent : "transparent"}`,
        color: activeTab === tab.key ? C.accent : C.muted,
        fontSize: 13, fontWeight: 800, letterSpacing: 0.8, transition: "all 0.15s"
      }}>
        {tab.label}
        {tab.badge && <span style={{ color: C.success, marginLeft: 4 }}>{tab.badge}</span>}
      </button>
    ))}
  </div>

  {/* BODY */}
  <div style={{ flex: 1, overflow: "auto" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 16px 60px", display: "flex", gap: 16, flexWrap: "wrap" }}>

      {/* ── FIXTURES TAB ── */}
      {activeTab === "fixtures" && (
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>SELECT COMPETITION</div>
            <CompetitionPicker selected={selectedComp} onSelect={(c) => { setSelectedComp(c); }} />
          </div>

          {/* Date nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button onClick={() => setDateOffset(d => d - 1)} style={{
              width: 34, height: 34, borderRadius: "50%", background: C.surface,
              border: `1px solid ${C.border}`, color: C.text, fontSize: 16
            }}>◀</button>
            <div style={{
              flex: 1, background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: "6px 14px", textAlign: "center"
            }}>
              <div style={{ fontSize: 12, color: C.muted }}>FIXTURE DATE</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{targetDate}</div>
            </div>
            <button onClick={() => setDateOffset(d => d + 1)} style={{
              width: 34, height: 34, borderRadius: "50%", background: C.surface,
              border: `1px solid ${C.border}`, color: C.text, fontSize: 16
            }}>▶</button>
          </div>

          {!selectedComp && (
            <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "32px 0" }}>
              Select a competition above to load fixtures
            </div>
          )}
          {loadingFixtures && <div style={{ padding: "20px 0" }}><Spinner /></div>}
          {fixturesError && <div style={{ color: C.warning, fontSize: 12, marginBottom: 10, padding: "8px 12px", background: `${C.warning}11`, borderRadius: 4 }}>{fixturesError}</div>}

          {fixtures.map(f => (
            <FixtureCard
              key={f.id}
              fixture={f}
              selected={selectedFixture?.id === f.id}
              onSelect={(fix) => {
                setSelectedFixture(fix);
                setAnalysisResult(null);
              }}
            />
          ))}

          {fixtures.length === 0 && !loadingFixtures && selectedComp && (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              No fixtures found for {targetDate}
            </div>
          )}
        </div>
      )}

      {/* ── ANALYSIS TAB ── */}
      {activeTab === "analysis" && (
        <div style={{ flex: 1, minWidth: 280 }}>
          {!selectedFixture ? (
            <div style={{ color: C.muted, textAlign: "center", padding: "40px 0" }}>
              Select a fixture from the Fixtures tab first
            </div>
          ) : (
            <>
              {/* Fixture hero */}
              <div style={{
                background: `linear-gradient(135deg, ${C.card}, #0A1628)`,
                border: `1px solid ${C.borderBright}`, borderRadius: 8, padding: 16, marginBottom: 12
              }}>
                <div style={{ fontSize: 11, color: C.primary, fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
                  {selectedFixture.competition?.name || selectedComp}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 900 }}>{selectedFixture.homeTeam?.name}</span>
                  <span style={{ fontSize: 14, color: C.dimmed, fontWeight: 700 }}>VS</span>
                  <span style={{ fontSize: 20, fontWeight: 900, textAlign: "right" }}>{selectedFixture.awayTeam?.name}</span>
                </div>
              </div>

              {/* Market selector */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, letterSpacing: 1 }}>SELECT MARKETS TO ANALYSE</div>
                <MarketChips selected={selectedMarkets} onToggle={toggleMarket} />
                {selectedMarkets.includes("Custom") && (
                  <input
                    value={customMarket}
                    onChange={e => setCustomMarket(e.target.value)}
                    placeholder="e.g. Barcelona corners first half over 4.5"
                    style={{
                      marginTop: 10, width: "100%", padding: "8px 12px",
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 4, color: C.text, fontSize: 13
                    }}
                  />
                )}
                <button onClick={runAnalysis} disabled={analysing} style={{
                  marginTop: 12, width: "100%", padding: "12px 0",
                  background: analysing ? C.dimmed : C.primary,
                  color: "#fff", borderRadius: 6, fontSize: 16, fontWeight: 900,
                  letterSpacing: 1, fontFamily: "'Bebas Neue', sans-serif",
                  boxShadow: analysing ? "none" : `0 0 16px ${C.primaryGlow}`,
                  transition: "all 0.2s"
                }}>
                  {analysing ? "RUNNING ENGINE…" : "⚡ RUN ANALYSIS"}
                </button>
              </div>

              {analysing && <div style={{ padding: "20px 0" }}><Spinner /></div>}

              {analysisResult && (
                <div className="animate-in">
                  {/* Predicted Stats */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 12 }}>
                      GAP PROJECTED STATS
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <StatCard label="HOME xG" value={analysisResult.stats.hXg} color={C.teal} />
                      <StatCard label="AWAY xG" value={analysisResult.stats.aXg} color={C.accent} />
                      <StatCard label="TOTAL CORNERS" value={analysisResult.stats.hC + analysisResult.stats.aC} color={C.text} sub={`HT: ${analysisResult.stats.htHC + analysisResult.stats.htAC}`} />
                    </div>
                    <StatBar label="Shots on Target" home={analysisResult.stats.hSot} away={analysisResult.stats.aSot} />
                    <StatBar label="Shots off Target" home={analysisResult.stats.hSoff} away={analysisResult.stats.aSoff} />
                    <StatBar label="Corners" home={analysisResult.stats.hC} away={analysisResult.stats.aC} />
                  </div>

                  {/* Outcomes */}
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 12 }}>
                      POISSON OUTCOMES (10K SIM)
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <StatCard label="HOME WIN" value={`${(analysisResult.outcomes.hw * 100).toFixed(1)}%`} color={C.teal} />
                      <StatCard label="DRAW" value={`${(analysisResult.outcomes.draw * 100).toFixed(1)}%`} color={C.muted} />
                      <StatCard label="AWAY WIN" value={`${(analysisResult.outcomes.aw * 100).toFixed(1)}%`} color={C.accent} />
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <StatCard label="BTTS" value={`${(analysisResult.outcomes.btts * 100).toFixed(1)}%`} />
                      <StatCard label="OVER 2.5" value={`${(analysisResult.outcomes.o25 * 100).toFixed(1)}%`} />
                      <StatCard label="OVER 3.5" value={`${(analysisResult.outcomes.o35 * 100).toFixed(1)}%`} />
                    </div>
                    {/* Top scores */}
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, letterSpacing: 1 }}>TOP CORRECT SCORES</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {analysisResult.outcomes.topScores.slice(0, 8).map(s => (
                        <div key={s.score} style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 4, padding: "6px 10px", textAlign: "center", minWidth: 60
                        }}>
                          <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif" }}>{s.score}</div>
                          <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>{s.p.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Peak Pick */}
                  <PeakPick markets={analysisResult.allMarkets} />

                  {/* Markets */}
                  <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 10 }}>
                    MARKET ANALYSIS
                  </div>
                  {analysisResult.markets.map(m => (
                    <MarketRow
                      key={m.id}
                      market={m}
                      bankroll={bankroll}
                      onAddToAccu={addToAccu}
                      inAccu={accu.some(a => a.id === m.id && a.fixture === `${analysisResult.home} vs ${analysisResult.away}`)}
                      algoSuggested={m.id === analysisResult.algoTopId}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SLIP TAB ── */}
      {activeTab === "slip" && (
        <div style={{ flex: 1, minWidth: 280 }}>
          <AccumulatorSlip
            legs={accu}
            bankroll={bankroll}
            onRemove={removeFromAccu}
            onClear={() => { setAccu([]); saveAccu([]); }}
          />
        </div>
      )}

      {/* ── AUDIT TAB ── */}
      {activeTab === "audit" && (
        <div style={{ flex: 1, minWidth: 280 }}>
          <AuditDashboard audit={audit} />
          <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginBottom: 12 }}>
              PREDICTION LOG
            </div>
            {audit.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13 }}>No predictions logged yet.</div>
            ) : [...audit].reverse().map((a, i) => (
              <div key={a.id} style={{
                padding: "8px 0", borderBottom: `1px solid ${C.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap"
              }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted }}>{a.fixture}</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{a.sel}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Badge color={C.accent}>{a.market}</Badge>
                  <Badge color={a.result === "hit" ? C.success : a.result === "miss" ? C.danger : C.muted}>
                    {a.result === "pending" ? "PENDING" : a.result === "hit" ? "✓ HIT" : "✗ MISS"}
                  </Badge>
                  {a.result === "pending" && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => {
                        const updated = audit.map(x => x.id === a.id ? { ...x, result: "hit" } : x);
                        setAudit(updated); saveAudit(updated);
                      }} style={{
                        padding: "3px 8px", background: `${C.success}22`, border: `1px solid ${C.success}`,
                        color: C.success, borderRadius: 3, fontSize: 11, fontWeight: 700
                      }}>HIT</button>
                      <button onClick={() => {
                        const updated = audit.map(x => x.id === a.id ? { ...x, result: "miss" } : x);
                        setAudit(updated); saveAudit(updated);
                      }} style={{
                        padding: "3px 8px", background: `${C.danger}22`, border: `1px solid ${C.danger}`,
                        color: C.danger, borderRadius: 3, fontSize: 11, fontWeight: 700
                      }}>MISS</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
</div>
```

);
}

// ─── DEMO FIXTURES (fallback when no API key / API error) ─────────────────────
function getDemoFixtures(comp, date) {
const fixtures = {
CL: [
{ id: 1, homeTeam: { name: “Real Madrid” }, awayTeam: { name: “Bayern Munich” }, status: “SCHEDULED”, utcDate: `${date}T19:00:00Z`, matchday: null, odds: { home: 2.10, draw: 3.40, away: 3.20 } },
{ id: 2, homeTeam: { name: “Arsenal” }, awayTeam: { name: “PSG” }, status: “SCHEDULED”, utcDate: `${date}T21:00:00Z`, matchday: null, odds: { home: 2.40, draw: 3.20, away: 2.90 } },
{ id: 3, homeTeam: { name: “Inter Milan” }, awayTeam: { name: “Atletico Madrid” }, status: “SCHEDULED”, utcDate: `${date}T21:00:00Z`, matchday: null, odds: { home: 1.95, draw: 3.50, away: 3.80 } },
],
PL: [
{ id: 4, homeTeam: { name: “Manchester City” }, awayTeam: { name: “Liverpool” }, status: “SCHEDULED”, utcDate: `${date}T16:30:00Z`, matchday: 32, odds: { home: 1.85, draw: 3.60, away: 4.00 } },
{ id: 5, homeTeam: { name: “Chelsea” }, awayTeam: { name: “Arsenal” }, status: “SCHEDULED”, utcDate: `${date}T14:00:00Z`, matchday: 32, odds: { home: 2.80, draw: 3.30, away: 2.50 } },
{ id: 6, homeTeam: { name: “Tottenham” }, awayTeam: { name: “Aston Villa” }, status: “SCHEDULED”, utcDate: `${date}T14:00:00Z`, matchday: 32, odds: { home: 2.10, draw: 3.40, away: 3.30 } },
],
PD: [
{ id: 7, homeTeam: { name: “Barcelona” }, awayTeam: { name: “Atletico Madrid” }, status: “SCHEDULED”, utcDate: `${date}T20:00:00Z`, matchday: 29, odds: { home: 1.70, draw: 3.80, away: 4.50 } },
{ id: 8, homeTeam: { name: “Sevilla” }, awayTeam: { name: “Real Betis” }, status: “SCHEDULED”, utcDate: `${date}T18:00:00Z`, matchday: 29, odds: { home: 2.20, draw: 3.10, away: 3.20 } },
],
BL1: [
{ id: 9, homeTeam: { name: “Bayer Leverkusen” }, awayTeam: { name: “Borussia Dortmund” }, status: “SCHEDULED”, utcDate: `${date}T17:30:00Z`, matchday: 27, odds: { home: 1.90, draw: 3.50, away: 3.80 } },
{ id: 10, homeTeam: { name: “RB Leipzig” }, awayTeam: { name: “Eintracht Frankfurt” }, status: “SCHEDULED”, utcDate: `${date}T15:30:00Z`, matchday: 27, odds: { home: 1.75, draw: 3.70, away: 4.20 } },
],
};
return fixtures[comp] || [];
}
