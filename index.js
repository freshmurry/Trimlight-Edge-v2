// Trimlight Edge v2 — single-file Cloudflare Worker monolith.
// Serves the full PWA (HTML + inline client script) at GET /,
// JSON API routes under /api/, and the Trimlight Edge Cloud proxy.
// Deploy: wrangler deploy (see wrangler.jsonc). No build step.
// Until TRIMLIGHT_API_ID / TRIMLIGHT_API_SECRET / TRIMLIGHT_DEVICE_ID
// are set as secrets, /api/apply runs in Simulation Mode (HTTP 200,
// { simulated: true, appliedState }).

const VERSION = '2.0.0';

// Zone foot lengths from the owner's measured roofline runs (151 ft total).
const ZONE_FT = [
  { id: 1, name: 'Left Gables', runs: [18, 18, 3, 3], ft: 42 },
  { id: 2, name: 'Entry Gable', runs: [12, 10, 10], ft: 32 },
  { id: 3, name: 'Right Main Gable', runs: [20, 8], ft: 28 },
  { id: 4, name: 'Right Inner Gable', runs: [13, 13, 14, 6, 3], ft: 49 },
];
const TOTAL_FT = 151;

// App effect -> Trimlight CUSTOM effect mode number.
const EFFECT_MODES = {
  STATIC: 0,
  CHASE: 1,
  FADE: 16,
  TWINKLE: 5,
  WAVE: 11,
  COMET: 7,
  STROBE: 15,
  PULSE: 6,
  RAINBOW: 1,
};

const RAINBOW_HEX = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#2563eb', '#9333ea', '#ec4899'];

function clamp(v, lo, hi) {
  v = Number(v);
  if (Number.isNaN(v)) v = lo;
  return Math.max(lo, Math.min(hi, v));
}

function hexToInt(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h, 16);
  return Number.isNaN(n) ? 0 : n;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ---------------------------------------------------------------------------
// HTML template. The client script inside uses only single/double quotes
// (no backtick template literals) and no ${ sequences, so the outer
// template literal is never broken. The only interpolation is ${nonce} in
// the <script> tag, which is deliberate (per-request CSP nonce).
// ---------------------------------------------------------------------------
function renderHTML(nonce) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="House With the Cool Door Trimlights — offline-first PWA for Trimlight Edge roofline lighting.">
<title>Cool Door Trimlights</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg-primary:#000000;--bg-secondary:#141414;--bg-tertiary:#222222;
  --text-primary:#FFFFFF;--text-secondary:#8E8E93;--border-subtle:#2C2C2E;
  --accent-primary:#3E6AE1;--accent-focus:#0073CF;
  --status-success:#188038;--status-warning:#E67C00;--status-error:#D93025;
  --ambient-glow:rgba(62,106,225,0.15);--sheet-bg:#1C1C1E;
}
[data-theme="light"]{
  --bg-primary:#FFFFFF;--bg-secondary:#F4F4F4;--bg-tertiary:#E8E8E8;
  --text-primary:#171A20;--text-secondary:#5C5E62;--border-subtle:#D0D1D2;
  --accent-primary:#3E6AE1;--ambient-glow:rgba(62,106,225,0.12);--sheet-bg:#FFFFFF;
}
html,body{height:100%}
body{font-family:'Universal Sans',-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif;background:var(--bg-primary);color:var(--text-primary);-webkit-tap-highlight-color:transparent}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;min-height:44px;min-width:44px}
input,select{font:inherit;color:inherit}
.num{font-variant-numeric:tabular-nums}
#wakebar{position:fixed;top:0;left:0;right:0;height:2px;z-index:60;overflow:hidden;pointer-events:none}
#wakebar.on::after{content:'';display:block;height:100%;width:40%;background:var(--accent-primary);animation:wake 1.1s ease-in-out infinite}
@keyframes wake{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
header.topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top,0px) + 8px) 16px 8px;min-height:calc(56px + env(safe-area-inset-top,0px));background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.1)}
[data-theme="light"] header.topbar{background:rgba(255,255,255,0.8);border-bottom-color:rgba(0,0,0,0.1)}
.topbar h1{font-size:18px;font-weight:600}
.topbar .telemetry{font-size:12px;color:var(--text-secondary);margin-top:2px}
.power-btn{width:44px;height:44px;border-radius:9999px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;border:1px solid var(--border-subtle)}
.power-btn.on{background:var(--accent-primary);border-color:var(--accent-primary)}
.power-btn svg{width:22px;height:22px}
main{padding:16px 16px calc(83px + env(safe-area-inset-bottom,0px) + 24px);max-width:480px;margin:0 auto}
.view{display:none}
.view.active{display:block}
.hero{position:relative;border-radius:24px;overflow:hidden;background:var(--bg-secondary);border:1px solid var(--border-subtle);padding:20px 16px 16px}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,var(--glow-color,rgba(62,106,225,0.15)),transparent 70%);pointer-events:none}
#ledCanvas{width:100%;height:150px;display:block;position:relative}
.hero-readout{display:flex;align-items:baseline;justify-content:space-between;margin-top:12px;position:relative}
.hero-readout .big{font-size:48px;font-weight:500;line-height:1}
.hero-readout .state{font-size:16px;color:var(--text-secondary)}
.pills{display:flex;gap:8px;overflow-x:auto;margin-top:14px;position:relative;padding-bottom:2px}
.pill{flex:0 0 auto;font-size:12px;font-weight:500;padding:8px 14px;border-radius:9999px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-subtle);min-height:32px}
.pill.active{background:var(--accent-primary);color:#fff;border-color:var(--accent-primary)}
.qa-bar{display:flex;justify-content:space-between;margin:20px 0 8px}
.qa-btn{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);min-width:48px}
.qa-btn .circle{width:48px;height:48px;border-radius:9999px;background:var(--bg-secondary);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center}
.qa-btn.active .circle{background:var(--accent-primary);border-color:var(--accent-primary);color:#fff}
.qa-btn svg{width:22px;height:22px}
.card{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;margin-top:12px}
.row{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;padding:12px 16px;text-align:left;border-bottom:1px solid var(--border-subtle)}
.row:last-child{border-bottom:0}
.row .icon{width:24px;height:24px;flex:0 0 auto;color:var(--text-secondary)}
.row .texts{flex:1;min-width:0}
.row .title{font-size:16px;font-weight:500}
.row .status{font-size:14px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .chev{width:16px;height:16px;color:var(--text-secondary);flex:0 0 auto}
.section-title{font-size:18px;font-weight:500;margin:20px 0 4px}
.section-sub{font-size:14px;color:var(--text-secondary);margin-bottom:8px}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:3px;background:var(--bg-tertiary);outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer}
input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#fff;border:0;box-shadow:0 2px 6px rgba(0,0,0,0.4)}
.slider-row{padding:14px 16px}
.slider-row .labels{display:flex;justify-content:space-between;font-size:14px;color:var(--text-secondary);margin-bottom:10px}
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;height:calc(83px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:rgba(20,20,20,0.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.1)}
[data-theme="light"] .tabbar{background:rgba(244,244,244,0.9);border-top-color:rgba(0,0,0,0.1)}
.tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11px;color:var(--text-secondary)}
.tab.active{color:var(--accent-primary)}
.tab svg{width:24px;height:24px}
.sheet-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .33s cubic-bezier(0.25,0.1,0.25,1.0);z-index:50}
.sheet-backdrop.open{opacity:1;pointer-events:auto}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--sheet-bg);border-radius:24px 24px 0 0;max-height:86vh;overflow-y:auto;padding:12px 20px calc(20px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .33s cubic-bezier(0.25,0.1,0.25,1.0)}
.sheet.open{transform:translateY(0)}
.grabber{width:36px;height:4px;border-radius:2px;background:#48484A;margin:0 auto 16px}
.sheet h2{font-size:24px;font-weight:500;margin-bottom:4px}
.sheet .sub{font-size:14px;color:var(--text-secondary);margin-bottom:16px}
.segmented{display:flex;background:#1C1C1E;padding:4px;border-radius:12px;margin-bottom:16px}
[data-theme="light"] .segmented{background:#E8E8E8}
.segmented button{flex:1;padding:10px 4px;border-radius:8px;font-size:14px;color:var(--text-secondary);min-height:40px}
.segmented button.active{background:var(--bg-tertiary);color:var(--text-primary)}
.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.swatch{aspect-ratio:1;border-radius:50%;border:2px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}
.swatch.active{border-color:var(--accent-primary);box-shadow:0 0 0 2px var(--accent-primary)}
.field{margin-bottom:14px}
.field label{display:block;font-size:14px;color:var(--text-secondary);margin-bottom:6px}
.field input[type=text],.field input[type=number],.field select,.field input[type=password]{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-tertiary);color:var(--text-primary)}
.hex-row{display:flex;gap:10px;align-items:center}
.hex-row input[type=color]{width:44px;height:44px;padding:0;border:1px solid var(--border-subtle);border-radius:10px;background:none;flex:0 0 auto}
.hex-row input[type=text]{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 20px;border-radius:12px;background:var(--accent-primary);color:#fff;font-size:16px;font-weight:500;width:100%}
.btn.secondary{background:var(--bg-tertiary);color:var(--text-primary)}
.btn.danger{background:var(--status-error)}
.btn.small{width:auto;min-height:36px;padding:8px 14px;font-size:14px;border-radius:9999px}
.node-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-subtle)}
.node-row input[type=color]{width:40px;height:40px;padding:0;border:1px solid var(--border-subtle);border-radius:50%;background:none;flex:0 0 auto}
.stepper{display:flex;align-items:center;gap:4px;margin-left:auto}
.stepper button{width:44px;height:44px;border-radius:50%;background:var(--bg-tertiary);font-size:20px;display:flex;align-items:center;justify-content:center}
.stepper .count{min-width:36px;text-align:center;font-size:16px}
.effect-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.effect-btn{padding:14px 6px;border-radius:12px;background:var(--bg-tertiary);border:1px solid var(--border-subtle);font-size:14px;font-weight:500;text-align:center}
.effect-btn.active{background:var(--accent-primary);border-color:var(--accent-primary);color:#fff}
.zone-card{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:16px;margin-top:12px}
.zone-card h3{font-size:16px;font-weight:500}
.zone-card .runs{font-size:14px;color:var(--text-secondary);margin:6px 0 12px}
.zone-card .runs input{width:52px;min-height:36px;text-align:center;padding:4px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-tertiary);color:var(--text-primary)}
.zone-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.toggle{position:relative;width:52px;height:32px;border-radius:9999px;background:var(--bg-tertiary);border:1px solid var(--border-subtle);flex:0 0 auto}
.toggle::after{content:'';position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .2s}
.toggle.on{background:var(--status-success)}
.toggle.on::after{transform:translateX(20px)}
.scene-card{background:var(--bg-secondary);border:1px solid var(--border-subtle);border-radius:12px;padding:16px;margin-top:12px}
.scene-card h3{font-size:16px;font-weight:500}
.scene-card .meta{font-size:14px;color:var(--text-secondary);margin:4px 0 10px}
.scene-dots{display:flex;gap:4px;margin:8px 0}
.scene-dots span{width:16px;height:16px;border-radius:50%;border:1px solid var(--border-subtle)}
.chips{display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px}
.chip{flex:0 0 auto;font-size:12px;font-weight:500;padding:8px 14px;border-radius:9999px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border-subtle);min-height:32px}
.chip.active{background:var(--accent-primary);color:#fff;border-color:var(--accent-primary)}
#toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%) translateY(20px);background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-subtle);padding:12px 18px;border-radius:9999px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:70;max-width:90vw;text-align:center}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.mic-btn{width:88px;height:88px;border-radius:50%;background:var(--accent-primary);color:#fff;display:flex;align-items:center;justify-content:center;margin:8px auto 16px}
.mic-btn.listening{background:var(--status-error);animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(217,48,37,0.4)}50%{box-shadow:0 0 0 16px rgba(217,48,37,0)}}
.mic-btn svg{width:36px;height:36px}
.cmd-preview{background:var(--bg-tertiary);border:1px solid var(--border-subtle);border-radius:12px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;margin:12px 0}
.kv{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-subtle);font-size:14px}
.kv:last-child{border-bottom:0}
.kv b{font-weight:500}
@media(min-width:768px){
  main{max-width:none;padding:24px 24px calc(83px + 24px)}
  #view-control.active{display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start;transition:all .45s cubic-bezier(0.22,1,0.36,1)}
  #view-control .col-left{grid-column:1;grid-row:1}
  #view-control .hero{grid-column:2;grid-row:1}
  #ledCanvas{height:280px}
  #view-zones.active,#view-scenes.active,#view-settings.active{max-width:720px;margin:0 auto}
  .sheet{left:50%;right:auto;bottom:24px;transform:translate(-50%,20px);width:520px;border-radius:16px;opacity:0}
  .sheet.open{transform:translate(-50%,0);opacity:1}
}
</style>
</head>
<body>
<div id="wakebar"></div>
<header class="topbar">
  <div>
    <h1>Cool Door Trimlights</h1>
    <p class="telemetry" id="telemetry">Simulation</p>
  </div>
  <button class="power-btn on" id="powerBtn" aria-label="Toggle power">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>
  </button>
</header>
<main>
  <section class="view active" id="view-control">
    <div class="col-left">
      <div class="qa-bar">
        <button class="qa-btn" id="qaPower"><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v8"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></svg></span>Power</button>
        <button class="qa-btn" id="qaVoice"><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></span>Voice AI</button>
        <button class="qa-btn" id="qaWarm"><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>2700K Warm</button>
        <button class="qa-btn" id="qaPattern"><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>Pattern</button>
        <button class="qa-btn" id="qaScenes"><span class="circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg></span>Scenes</button>
      </div>
      <div class="card">
        <button class="row" id="rowColor">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/><circle cx="12" cy="12" r="3"/></svg></span>
          <span class="texts"><span class="title">Color</span><span class="status" id="colorStatus">#ef4444</span></span>
          <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
        </button>
        <button class="row" id="rowPattern">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>
          <span class="texts"><span class="title">Pattern</span><span class="status" id="patternStatus">6 nodes</span></span>
          <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
        </button>
        <button class="row" id="rowEffect">
          <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></span>
          <span class="texts"><span class="title">Effect</span><span class="status" id="effectStatus">CHASE</span></span>
          <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
        </button>
        <div class="slider-row">
          <div class="labels"><span>Brightness</span><span class="num" id="brightnessVal">85%</span></div>
          <input type="range" id="brightnessSlider" min="0" max="100" step="1" value="85" aria-label="Brightness">
        </div>
        <div class="slider-row">
          <div class="labels"><span>Speed</span><span class="num" id="speedVal">50%</span></div>
          <input type="range" id="speedSlider" min="0" max="100" step="1" value="50" aria-label="Speed">
        </div>
      </div>
    </div>
    <div class="hero" id="hero">
      <canvas id="ledCanvas" aria-label="Live LED strip visualizer"></canvas>
      <div class="hero-readout">
        <span class="big num" id="heroBrightness">85%</span>
        <span class="state" id="heroState">CHASE</span>
      </div>
      <div class="pills" id="zonePills"></div>
    </div>
  </section>

  <section class="view" id="view-zones">
    <h2 class="section-title">Zones</h2>
    <p class="section-sub">Measured roofline runs from your sketch, 151 ft total. Tap a run length to correct it. Zone colors override the global pattern; clear to return to the pattern.</p>
    <div id="zoneList"></div>
  </section>

  <section class="view" id="view-scenes">
    <h2 class="section-title">Scenes</h2>
    <p class="section-sub">Saved looks. Apply one instantly, or duplicate and rename it to make it yours.</p>
    <div class="field"><input type="text" id="sceneSearch" placeholder="Search scenes" aria-label="Search scenes"></div>
    <div class="chips" id="sceneChips"></div>
    <div id="sceneList"></div>
    <button class="btn" id="newSceneBtn" style="margin-top:16px">Save current look as a scene</button>
  </section>

  <section class="view" id="view-settings">
    <h2 class="section-title">Settings</h2>
    <p class="section-sub">Appearance, backup, connection, and diagnostics.</p>
    <div class="card">
      <div class="row" style="cursor:default">
        <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
        <span class="texts"><span class="title">Theme</span><span class="status">OLED dark by default</span></span>
        <span class="segmented" style="margin:0;min-width:150px"><button id="themeDark" class="active">Dark</button><button id="themeLight">Light</button></span>
      </div>
      <div class="row" style="cursor:default">
        <span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 15l6 6 6-6"/></svg></span>
        <span class="texts"><span class="title">Backup</span><span class="status">Export or import all scenes as JSON</span></span>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn secondary" id="exportBtn" style="flex:1">Export JSON</button>
      <button class="btn secondary" id="importBtn" style="flex:1">Import JSON</button>
      <input type="file" id="importFile" accept="application/json,.json" style="display:none">
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row" style="cursor:default">
        <span class="texts"><span class="title">Connection</span><span class="status" id="connStatus">Checking edge status</span></span>
      </div>
      <div style="padding:4px 16px 12px" id="diagList"></div>
    </div>
    <div class="field" style="margin-top:16px">
      <label for="pinInput">App PIN (optional, matches the APP_PIN secret on the Worker)</label>
      <input type="password" id="pinInput" placeholder="Leave blank if no PIN is set" autocomplete="off">
    </div>
    <button class="btn danger" id="resetBtn" style="margin-top:8px">Reset to defaults</button>
    <p class="section-sub" style="margin-top:16px">Trimlight Edge v2.0.0. Single-file Cloudflare Worker. Trimlight is a trademark of Trimlight LLC; this app is an independent controller for the Trimlight Edge Cloud API.</p>
  </section>
</main>
<nav class="tabbar">
  <button class="tab active" data-tab="control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>Control</button>
  <button class="tab" data-tab="zones"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>Zones</button>
  <button class="tab" data-tab="scenes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>Scenes</button>
  <button class="tab" data-tab="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>Settings</button>
</nav>
<div class="sheet-backdrop" id="sheetBackdrop"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>
<div id="toast"></div>
<script nonce="${nonce}">
'use strict';
/* ================= Client: state ================= */
var LS_KEY = 'trimlight-edge-v2-state';
var LS_SCENES = 'trimlight-edge-v2-scenes';
var LS_PIN = 'trimlight-edge-v2-pin';

var ZONES = [
  { id: 1, name: 'Left Gables', runs: [18, 18, 3, 3], ft: 42 },
  { id: 2, name: 'Entry Gable', runs: [12, 10, 10], ft: 32 },
  { id: 3, name: 'Right Main Gable', runs: [20, 8], ft: 28 },
  { id: 4, name: 'Right Inner Gable', runs: [13, 13, 14, 6, 3], ft: 49 }
];
var TOTAL_FT = 151;

var SWATCHES = [
  { code: 'R', hex: '#ef4444' }, { code: 'G', hex: '#22c55e' }, { code: 'B', hex: '#2563eb' },
  { code: 'Y', hex: '#facc15' }, { code: 'PU', hex: '#9333ea' }, { code: 'O', hex: '#f97316' },
  { code: 'W', hex: '#ffffff' }, { code: 'WW', hex: '#f59e0b' }, { code: 'PI', hex: '#ec4899' },
  { code: 'C', hex: '#06b6d4' }, { code: 'BK', hex: '#090612' }, { code: 'X', hex: '#000000' }
];
var EFFECTS = ['STATIC', 'CHASE', 'FADE', 'TWINKLE', 'WAVE', 'COMET', 'STROBE', 'PULSE', 'RAINBOW'];
var CATEGORIES = ['Architectural', 'Holiday', 'Game Day', 'Party', 'Custom'];
var RAINBOW_HEX = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#2563eb', '#9333ea', '#ec4899'];

var DEFAULT_NODES = [
  { hex: '#ef4444', count: 8 }, { hex: '#facc15', count: 8 }, { hex: '#22c55e', count: 8 },
  { hex: '#2563eb', count: 8 }, { hex: '#9333ea', count: 8 }, { hex: '#f97316', count: 8 }
];

var STARTER_SCENES = [
  { id: 'starter-warm-welcome', name: 'Warm Welcome', category: 'Architectural', effect: 'STATIC', brightness: 80, speed: 50, color: '#f5c98a', nodes: [{ hex: '#f5c98a', count: 12 }], zoneOverrides: {} },
  { id: 'starter-christmas', name: 'Christmas Classic', category: 'Holiday', effect: 'CHASE', brightness: 90, speed: 45, color: '#ef4444', nodes: [{ hex: '#ef4444', count: 10 }, { hex: '#22c55e', count: 10 }, { hex: '#ffffff', count: 4 }], zoneOverrides: {} },
  { id: 'starter-game-day', name: 'Game Day', category: 'Game Day', effect: 'PULSE', brightness: 100, speed: 60, color: '#ef4444', nodes: [{ hex: '#ef4444', count: 12 }, { hex: '#ffffff', count: 12 }], zoneOverrides: {} },
  { id: 'starter-party', name: 'Party Pulse', category: 'Party', effect: 'RAINBOW', brightness: 95, speed: 70, color: '#9333ea', nodes: [{ hex: '#ef4444', count: 6 }, { hex: '#f97316', count: 6 }, { hex: '#facc15', count: 6 }, { hex: '#22c55e', count: 6 }, { hex: '#06b6d4', count: 6 }, { hex: '#9333ea', count: 6 }], zoneOverrides: {} }
];

function defaultState() {
  return {
    power: true, brightness: 85, speed: 50, effect: 'CHASE',
    colorMode: 'swatches', color: '#ef4444', kelvin: 2700,
    nodes: JSON.parse(JSON.stringify(DEFAULT_NODES)),
    zoneOverrides: {}, activeZone: 'all', theme: 'dark'
  };
}

function loadState() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    var s = JSON.parse(raw);
    var d = defaultState();
    for (var k in d) { if (s[k] === undefined) s[k] = d[k]; }
    if (!Array.isArray(s.nodes) || !s.nodes.length) s.nodes = JSON.parse(JSON.stringify(DEFAULT_NODES));
    return s;
  } catch (e) { return defaultState(); }
}

function loadScenes() {
  try {
    var raw = localStorage.getItem(LS_SCENES);
    if (!raw) return JSON.parse(JSON.stringify(STARTER_SCENES));
    var list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return JSON.parse(JSON.stringify(STARTER_SCENES));
    return list;
  } catch (e) { return JSON.parse(JSON.stringify(STARTER_SCENES)); }
}

var state = loadState();
var scenes = loadScenes();
var health = { ok: false, simulated: true, kv: false, ai: false, version: '2.0.0' };
var pendingQueue = [];
var sceneFilter = 'All';
var sceneSearch = '';
var editingSceneId = null;
var applyTimer = null;
var lastApplyAt = 0;
var wakeCount = 0;
var voiceRec = null;
var pendingVoiceCmd = null;

/* ================= Client: helpers ================= */
function $(id) { return document.getElementById(id); }
function clampNum(v, lo, hi) { v = Number(v); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function saveScenes() { try { localStorage.setItem(LS_SCENES, JSON.stringify(scenes)); } catch (e) {} }
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2600);
}
function hexOk(h) { return /^#[0-9a-fA-F]{6}$/.test(h); }
function hexToRgb(hex) {
  var h = hex.replace('#', '');
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}
function rgbToHex(r, g, b) {
  function p(n) { var s = Math.round(clampNum(n, 0, 255)).toString(16); return s.length === 1 ? '0' + s : s; }
  return '#' + p(r) + p(g) + p(b);
}
function kelvinToHex(k) {
  var t = k / 100;
  var r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) { b = 255; } else if (t <= 19) { b = 0; } else { b = 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  return rgbToHex(r, g, b);
}
function hexToHsl(hex) {
  var c = hexToRgb(hex);
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
  }
  return { h: h, s: s, l: l };
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function glowColor() {
  if (!state.power) return 'rgba(62,106,225,0.15)';
  var c = hexToRgb(state.color);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.22)';
}
function setWake(on) {
  wakeCount = Math.max(0, wakeCount + (on ? 1 : -1));
  $('wakebar').classList.toggle('on', wakeCount > 0);
}
function apiHeaders() {
  var h = { 'Content-Type': 'application/json' };
  try {
    var pin = localStorage.getItem(LS_PIN);
    if (pin) h['X-App-Pin'] = pin;
  } catch (e) {}
  return h;
}

/* ================= Client: telemetry + apply ================= */
function updateTelemetry() {
  var t = $('telemetry');
  var conn = $('connStatus');
  var queued = pendingQueue.length;
  if (!navigator.onLine) {
    t.textContent = queued > 0 ? 'Offline \u2022 Queued (' + queued + ')' : 'Offline';
  } else if (health.simulated) {
    t.textContent = 'Simulation';
  } else {
    t.textContent = 'Online \u2022 Edge \u2022 95%';
  }
  if (conn) {
    conn.textContent = !navigator.onLine ? 'Offline. Edits queue locally and flush on reconnect.'
      : health.simulated ? 'Simulation Mode. Set the Trimlight secrets on the Worker to go live.'
      : 'Connected to the Trimlight Edge Cloud.';
  }
  var diag = $('diagList');
  if (diag) {
    diag.innerHTML = '';
    var rows = [
      ['Mode', health.simulated ? 'Simulation' : 'Live'],
      ['Presets storage', health.kv ? 'Cloud KV' : 'Local only'],
      ['Voice AI', health.ai ? 'Workers AI' : 'On-device parser'],
      ['Queued edits', String(queued)],
      ['Version', health.version || '2.0.0']
    ];
    rows.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'kv';
      var a = document.createElement('span'); a.textContent = r[0];
      var b = document.createElement('b'); b.textContent = r[1];
      div.appendChild(a); div.appendChild(b);
      diag.appendChild(div);
    });
  }
}

function applyPayload() {
  return {
    power: state.power,
    nodes: state.nodes,
    effect: state.effect,
    brightness: state.brightness,
    speed: state.speed,
    zoneOverrides: state.zoneOverrides
  };
}

function applyNow() {
  if (!navigator.onLine) {
    pendingQueue.push(applyPayload());
    updateTelemetry();
    return;
  }
  setWake(true);
  fetch('/api/apply', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(applyPayload()) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      setWake(false);
      if (d && d.simulated !== undefined) health.simulated = !!d.simulated;
      updateTelemetry();
      if (d && d.ok === false) toast('Trimlight error: ' + (d.desc || d.error || 'upstream failed'));
    })
    .catch(function () {
      setWake(false);
      pendingQueue.push(applyPayload());
      updateTelemetry();
    });
}

function applyDebounced() {
  var now = Date.now();
  var wait = Math.max(0, 250 - (now - lastApplyAt));
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(function () {
    lastApplyAt = Date.now();
    applyNow();
  }, wait);
}

function flushQueue() {
  if (!pendingQueue.length || !navigator.onLine) return;
  pendingQueue = [];
  applyNow();
  updateTelemetry();
  toast('Back online. Queued edits sent.');
}

/* ================= Client: LED visualizer ================= */
var canvas = null, ctx = null;
function patternColors() {
  var cols = [];
  state.nodes.forEach(function (n) {
    var c = clampNum(n.count, 0, 30);
    for (var i = 0; i < c; i++) cols.push(n.hex);
  });
  if (!cols.length) cols = ['#000000'];
  return cols;
}

function zonePixelCounts() {
  var totalPx = 150;
  return ZONES.map(function (z) { return Math.max(10, Math.round(z.ft / TOTAL_FT * totalPx)); });
}

function drawLED(now) {
  if (!canvas || !ctx) return;
  var w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);
  var counts = zonePixelCounts();
  var totalPx = counts[0] + counts[1] + counts[2] + counts[3];
  var cols = patternColors();
  var stripH = Math.max(12, Math.floor(h / 9));
  var gap = Math.floor((h - stripH * 4) / 5);
  var bright = state.power ? state.brightness / 100 : 0;
  var speedF = 0.4 + (state.speed / 100) * 2.2;
  var globalIdx = 0;
  for (var zi = 0; zi < 4; zi++) {
    var n = counts[zi];
    var pxW = w / n;
    var y = gap + zi * (stripH + gap);
    var ov = state.zoneOverrides[String(ZONES[zi].id)];
    for (var j = 0; j < n; j++) {
      var hex;
      if (ov) {
        hex = ov.power === false ? '#000000' : (ov.hex || '#ffffff');
      } else if (state.effect === 'RAINBOW') {
        var hue = (globalIdx * 7 + now / 40 * speedF) % 360;
        hex = hslToHex(hue, 0.85, 0.55);
      } else {
        var shift = 0;
        if (state.effect === 'CHASE' || state.effect === 'WAVE' || state.effect === 'COMET') shift = Math.floor(now / 130 * speedF);
        var idx = (globalIdx + shift) % cols.length;
        hex = cols[idx];
      }
      var a = 1;
      if (state.effect === 'FADE' || state.effect === 'PULSE') {
        a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 700 * speedF));
      } else if (state.effect === 'WAVE') {
        a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((globalIdx / totalPx) * Math.PI * 4 - now / 300 * speedF));
      } else if (state.effect === 'TWINKLE') {
        var seed = Math.floor(now / 260) * 7919 + globalIdx * 104729;
        var rnd = ((seed * 2654435761) % 1000) / 1000;
        a = rnd > 0.82 ? 0.15 : 1;
      } else if (state.effect === 'STROBE') {
        a = (Math.floor(now / 160) % 2 === 0) ? 1 : 0.08;
      } else if (state.effect === 'COMET') {
        var head = (now / 18 * speedF) % (totalPx + 30);
        var dist = Math.abs(globalIdx - head);
        a = dist < 14 ? 1 - dist / 14 : 0.25;
      }
      var c = hexToRgb(hex);
      var alpha = Math.max(0, Math.min(1, a * bright));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = hex;
      ctx.shadowBlur = alpha > 0.05 ? 10 : 0;
      ctx.fillStyle = hex;
      var x = j * pxW + 1;
      var pw = Math.max(2, pxW - 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, pw, stripH, 4); else ctx.rect(x, y, pw, stripH);
      ctx.fill();
      ctx.restore();
      globalIdx++;
    }
  }
}

function sizeCanvas() {
  if (!canvas || !ctx) return;
  var rect = canvas.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick(now) {
  drawLED(now || 0);
  requestAnimationFrame(tick);
}

/* ================= Client: render ================= */
function renderAll() {
  document.documentElement.setAttribute('data-theme', state.theme);
  $('powerBtn').classList.toggle('on', state.power);
  $('qaPower').classList.toggle('active', state.power);
  $('heroBrightness').textContent = state.power ? state.brightness + '%' : 'Off';
  $('heroState').textContent = state.power ? state.effect : 'OFF';
  $('hero').style.setProperty('--glow-color', glowColor());
  $('colorStatus').textContent = state.colorMode === 'kelvin' ? state.kelvin + 'K \u2022 ' + state.color : state.color;
  var totalLeds = 0;
  state.nodes.forEach(function (n) { totalLeds += clampNum(n.count, 0, 30); });
  $('patternStatus').textContent = state.nodes.length + ' nodes \u2022 ' + totalLeds + ' LEDs';
  $('effectStatus').textContent = state.effect;
  $('brightnessVal').textContent = state.brightness + '%';
  $('speedVal').textContent = state.speed + '%';
  paintSlider($('brightnessSlider'), state.brightness);
  paintSlider($('speedSlider'), state.speed);
  $('brightnessSlider').value = state.brightness;
  $('speedSlider').value = state.speed;
  $('themeDark').classList.toggle('active', state.theme === 'dark');
  $('themeLight').classList.toggle('active', state.theme === 'light');
  renderPills();
  renderZones();
  renderScenes();
  updateTelemetry();
}

function paintSlider(el, v) {
  el.style.background = 'linear-gradient(to right, var(--accent-primary) ' + v + '%, var(--bg-tertiary) ' + v + '%)';
}

function renderPills() {
  var wrap = $('zonePills');
  wrap.innerHTML = '';
  var labels = ['All Zones', 'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];
  labels.forEach(function (label, i) {
    var key = i === 0 ? 'all' : String(i);
    var b = document.createElement('button');
    b.className = 'pill' + (state.activeZone === key ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', function () {
      state.activeZone = key;
      saveState();
      renderPills();
      if (key !== 'all') switchTab('zones');
    });
    wrap.appendChild(b);
  });
}

function renderZones() {
  var list = $('zoneList');
  list.innerHTML = '';
  ZONES.forEach(function (z) {
    var ov = state.zoneOverrides[String(z.id)];
    var card = document.createElement('div');
    card.className = 'zone-card';
    var h = document.createElement('h3');
    h.textContent = 'Zone ' + z.id + ' \u2022 ' + z.name;
    card.appendChild(h);
    var runs = document.createElement('div');
    runs.className = 'runs';
    runs.appendChild(document.createTextNode(z.ft + ' ft total \u2022 runs '));
    z.runs.forEach(function (r, ri) {
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.max = '100';
      inp.value = String(r);
      inp.setAttribute('aria-label', 'Zone ' + z.id + ' run ' + (ri + 1) + ' feet');
      inp.addEventListener('change', function () {
        var v = clampNum(inp.value, 0, 100);
        z.runs[ri] = v;
        z.ft = 0;
        z.runs.forEach(function (x) { z.ft += x; });
        saveState();
        renderZones();
      });
      runs.appendChild(inp);
      if (ri < z.runs.length - 1) runs.appendChild(document.createTextNode(' + '));
    });
    runs.appendChild(document.createTextNode(' ft'));
    card.appendChild(runs);
    var ctrls = document.createElement('div');
    ctrls.className = 'zone-controls';
    var color = document.createElement('input');
    color.type = 'color';
    color.value = ov && ov.hex ? ov.hex : state.color;
    color.setAttribute('aria-label', 'Zone ' + z.id + ' color');
    color.addEventListener('input', function () {
      state.zoneOverrides[String(z.id)] = { hex: color.value, power: true };
      saveState();
      applyDebounced();
    });
    color.addEventListener('change', function () { renderZones(); });
    ctrls.appendChild(color);
    var tog = document.createElement('button');
    tog.className = 'toggle' + (ov && ov.power === false ? '' : ' on');
    tog.setAttribute('aria-label', 'Zone ' + z.id + ' power');
    tog.addEventListener('click', function () {
      if (!ov) {
        state.zoneOverrides[String(z.id)] = { hex: state.color, power: false };
      } else {
        ov.power = ov.power === false ? true : false;
      }
      saveState();
      renderZones();
      applyDebounced();
    });
    ctrls.appendChild(tog);
    var lbl = document.createElement('span');
    lbl.style.fontSize = '14px';
    lbl.style.color = 'var(--text-secondary)';
    lbl.textContent = ov ? (ov.power === false ? 'Override: off' : 'Override: ' + ov.hex) : 'Following global pattern';
    ctrls.appendChild(lbl);
    if (ov) {
      var clr = document.createElement('button');
      clr.className = 'btn small secondary';
      clr.textContent = 'Clear override';
      clr.addEventListener('click', function () {
        delete state.zoneOverrides[String(z.id)];
        saveState();
        renderZones();
        applyDebounced();
      });
      ctrls.appendChild(clr);
    }
    card.appendChild(ctrls);
    list.appendChild(card);
  });
  var note = document.createElement('p');
  note.className = 'section-sub';
  note.style.marginTop = '12px';
  note.textContent = 'Run lengths are editable and saved on this device. Correct any that do not match the tape measure and the strips rescale.';
  list.appendChild(note);
}

function sceneMatches(s) {
  if (sceneFilter !== 'All' && s.category !== sceneFilter) return false;
  if (sceneSearch && s.name.toLowerCase().indexOf(sceneSearch.toLowerCase()) === -1) return false;
  return true;
}

function renderScenes() {
  var chips = $('sceneChips');
  chips.innerHTML = '';
  ['All'].concat(CATEGORIES).forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'chip' + (sceneFilter === c ? ' active' : '');
    b.textContent = c;
    b.addEventListener('click', function () { sceneFilter = c; renderScenes(); });
    chips.appendChild(b);
  });
  var list = $('sceneList');
  list.innerHTML = '';
  var shown = scenes.filter(sceneMatches);
  if (!shown.length) {
    var empty = document.createElement('p');
    empty.className = 'section-sub';
    empty.textContent = 'No scenes match. Clear the search or save a new scene.';
    list.appendChild(empty);
    return;
  }
  shown.forEach(function (s) {
    var card = document.createElement('div');
    card.className = 'scene-card';
    var h = document.createElement('h3');
    h.textContent = s.name;
    card.appendChild(h);
    var meta = document.createElement('div');
    meta.className = 'meta num';
    meta.textContent = s.category + ' \u2022 ' + s.effect + ' \u2022 ' + s.brightness + '% \u2022 ' + (s.nodes ? s.nodes.length : 0) + ' nodes';
    card.appendChild(meta);
    var dots = document.createElement('div');
    dots.className = 'scene-dots';
    (s.nodes || []).forEach(function (n) {
      var d = document.createElement('span');
      d.style.background = n.hex;
      dots.appendChild(d);
    });
    card.appendChild(dots);
    var row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.flexWrap = 'wrap';
    var apply = document.createElement('button');
    apply.className = 'btn small';
    apply.textContent = 'Apply';
    apply.addEventListener('click', function () { applyScene(s); });
    row.appendChild(apply);
    var dup = document.createElement('button');
    dup.className = 'btn small secondary';
    dup.textContent = 'Duplicate';
    dup.addEventListener('click', function () { duplicateScene(s); });
    row.appendChild(dup);
    var ren = document.createElement('button');
    ren.className = 'btn small secondary';
    ren.textContent = 'Rename';
    ren.addEventListener('click', function () { openSceneSheet(s); });
    row.appendChild(ren);
    var del = document.createElement('button');
    del.className = 'btn small danger';
    del.textContent = 'Delete';
    del.addEventListener('click', function () { deleteScene(s.id); });
    row.appendChild(del);
    card.appendChild(row);
    list.appendChild(card);
  });
}

function applyScene(s) {
  state.effect = s.effect;
  state.brightness = clampNum(s.brightness, 0, 100);
  state.speed = clampNum(s.speed, 0, 100);
  state.color = s.color || (s.nodes && s.nodes[0] ? s.nodes[0].hex : state.color);
  state.nodes = JSON.parse(JSON.stringify(s.nodes || DEFAULT_NODES));
  state.zoneOverrides = JSON.parse(JSON.stringify(s.zoneOverrides || {}));
  state.power = true;
  saveState();
  renderAll();
  applyDebounced();
  toast('Applied ' + s.name);
}

function duplicateScene(s) {
  var copy = JSON.parse(JSON.stringify(s));
  copy.id = 'scene-' + Date.now();
  copy.name = s.name + ' copy';
  scenes.push(copy);
  saveScenes();
  syncPreset(copy);
  renderScenes();
  toast('Duplicated as ' + copy.name);
}

function deleteScene(id) {
  scenes = scenes.filter(function (s) { return s.id !== id; });
  saveScenes();
  syncPresetsDelete(id);
  renderScenes();
  toast('Scene deleted');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
  $('view-' + tab).classList.add('active');
  if (tab === 'control') sizeCanvas();
  window.scrollTo(0, 0);
}

/* ================= Client: sheets ================= */
function openSheet() {
  $('sheetBackdrop').classList.add('open');
  $('sheet').classList.add('open');
}
function closeSheet() {
  $('sheetBackdrop').classList.remove('open');
  $('sheet').classList.remove('open');
}

function setSolidColor(hex) {
  state.color = hex;
  state.nodes = [{ hex: hex, count: 12 }];
  saveState();
  renderAll();
  applyDebounced();
}

function renderColorSheet() {
  var s = $('sheet');
  var html = '<div class="grabber"></div><h2>Color</h2><p class="sub">Sets a solid color across the roofline. Build multi-color patterns in the Pattern sheet.</p>';
  html += '<div class="segmented">';
  html += '<button data-mode="swatches"' + (state.colorMode === 'swatches' ? ' class="active"' : '') + '>Swatches</button>';
  html += '<button data-mode="spectrum"' + (state.colorMode === 'spectrum' ? ' class="active"' : '') + '>Full Spectrum</button>';
  html += '<button data-mode="kelvin"' + (state.colorMode === 'kelvin' ? ' class="active"' : '') + '>Kelvin White</button>';
  html += '</div><div id="colorBody"></div>';
  html += '<button class="btn secondary" id="colorDone" style="margin-top:16px">Done</button>';
  s.innerHTML = html;
  s.querySelectorAll('.segmented button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.colorMode = b.getAttribute('data-mode');
      saveState();
      renderColorSheet();
    });
  });
  var body = $('colorBody');
  if (state.colorMode === 'swatches') {
    var grid = document.createElement('div');
    grid.className = 'swatches';
    SWATCHES.forEach(function (sw) {
      var b = document.createElement('button');
      b.className = 'swatch' + (state.color.toLowerCase() === sw.hex ? ' active' : '');
      b.style.background = sw.hex;
      b.textContent = sw.code;
      b.style.color = (sw.hex === '#ffffff' || sw.hex === '#facc15' || sw.hex === '#f59e0b') ? '#171A20' : '#FFFFFF';
      if (sw.code === 'X') b.textContent = 'Clear';
      b.addEventListener('click', function () {
        if (sw.code === 'X') {
          state.power = false;
          saveState(); renderAll(); applyNow(); renderColorSheet();
          return;
        }
        setSolidColor(sw.hex);
        renderColorSheet();
      });
      grid.appendChild(b);
    });
    body.appendChild(grid);
  } else if (state.colorMode === 'spectrum') {
    var wrap = document.createElement('div');
    var hexRow = document.createElement('div');
    hexRow.className = 'hex-row';
    var wheel = document.createElement('input');
    wheel.type = 'color';
    wheel.value = hexOk(state.color) ? state.color : '#ef4444';
    wheel.setAttribute('aria-label', 'Color wheel');
    var hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = state.color;
    hexInput.maxLength = 7;
    hexInput.setAttribute('aria-label', 'Hex color');
    hexRow.appendChild(wheel);
    hexRow.appendChild(hexInput);
    wrap.appendChild(hexRow);
    var rgb = hexToRgb(state.color);
    [['R', rgb.r], ['G', rgb.g], ['B', rgb.b]].forEach(function (ch) {
      var f = document.createElement('div');
      f.className = 'field';
      f.style.marginTop = '14px';
      var lab = document.createElement('label');
      lab.textContent = ch[0] + ' \u2022 ' + ch[1];
      f.appendChild(lab);
      var sl = document.createElement('input');
      sl.type = 'range';
      sl.min = '0'; sl.max = '255'; sl.step = '1'; sl.value = String(ch[1]);
      sl.setAttribute('aria-label', ch[0] + ' channel');
      sl.addEventListener('input', function () {
        var cur = hexToRgb(state.color);
        if (ch[0] === 'R') cur.r = Number(sl.value);
        if (ch[0] === 'G') cur.g = Number(sl.value);
        if (ch[0] === 'B') cur.b = Number(sl.value);
        lab.textContent = ch[0] + ' \u2022 ' + sl.value;
        setSolidColor(rgbToHex(cur.r, cur.g, cur.b));
        hexInput.value = state.color;
        wheel.value = state.color;
      });
      f.appendChild(sl);
      wrap.appendChild(f);
    });
    wheel.addEventListener('input', function () {
      setSolidColor(wheel.value);
      hexInput.value = wheel.value;
    });
    hexInput.addEventListener('change', function () {
      var v = hexInput.value.trim().toLowerCase();
      if (v.charAt(0) !== '#') v = '#' + v;
      if (hexOk(v)) { setSolidColor(v); wheel.value = v; }
      else { hexInput.value = state.color; toast('Enter a valid #RRGGBB color'); }
    });
    body.appendChild(wrap);
  } else {
    var kWrap = document.createElement('div');
    var kLab = document.createElement('div');
    kLab.className = 'field';
    var kl = document.createElement('label');
    kl.textContent = 'Architectural white \u2022 ' + state.kelvin + 'K \u2022 ' + kelvinToHex(state.kelvin);
    kLab.appendChild(kl);
    var kSl = document.createElement('input');
    kSl.type = 'range';
    kSl.min = '2200'; kSl.max = '6500'; kSl.step = '50'; kSl.value = String(state.kelvin);
    kSl.setAttribute('aria-label', 'Color temperature in Kelvin');
    kSl.addEventListener('input', function () {
      state.kelvin = Number(kSl.value);
      state.colorMode = 'kelvin';
      state.color = kelvinToHex(state.kelvin);
      state.nodes = [{ hex: state.color, count: 12 }];
      kl.textContent = 'Architectural white \u2022 ' + state.kelvin + 'K \u2022 ' + state.color;
      saveState();
      renderAll();
      applyDebounced();
    });
    kLab.appendChild(kSl);
    kWrap.appendChild(kLab);
    var prev = document.createElement('div');
    prev.style.height = '56px';
    prev.style.borderRadius = '12px';
    prev.style.background = kelvinToHex(state.kelvin);
    prev.style.border = '1px solid var(--border-subtle)';
    kWrap.appendChild(prev);
    var hint = document.createElement('p');
    hint.className = 'section-sub';
    hint.style.marginTop = '10px';
    hint.textContent = '2200K candlelight to 6500K daylight. 2700K is the warm default.';
    kWrap.appendChild(hint);
    body.appendChild(kWrap);
  }
  $('colorDone').addEventListener('click', closeSheet);
  openSheet();
}

function renderPatternSheet() {
  var s = $('sheet');
  var html = '<div class="grabber"></div><h2>Pattern</h2><p class="sub">Up to 12 nodes. Each node is one color run of 0 to 30 LEDs. The strip repeats the pattern along the roofline.</p><div id="nodeList"></div>';
  html += '<button class="btn secondary" id="addNodeBtn" style="margin-top:14px">Add node</button>';
  html += '<button class="btn" id="patternDone" style="margin-top:10px">Done</button>';
  s.innerHTML = html;
  var list = $('nodeList');
  state.nodes.forEach(function (n, i) {
    var row = document.createElement('div');
    row.className = 'node-row';
    var num = document.createElement('span');
    num.style.fontSize = '14px';
    num.style.color = 'var(--text-secondary)';
    num.textContent = 'Node ' + (i + 1);
    row.appendChild(num);
    var col = document.createElement('input');
    col.type = 'color';
    col.value = n.hex;
    col.setAttribute('aria-label', 'Node ' + (i + 1) + ' color');
    col.addEventListener('input', function () {
      state.nodes[i].hex = col.value;
      state.color = col.value;
      saveState();
      renderAll();
      applyDebounced();
    });
    row.appendChild(col);
    var step = document.createElement('div');
    step.className = 'stepper';
    var minus = document.createElement('button');
    minus.textContent = '\u2212';
    minus.setAttribute('aria-label', 'Fewer LEDs');
    minus.addEventListener('click', function () {
      state.nodes[i].count = clampNum(state.nodes[i].count - 1, 0, 30);
      saveState(); renderAll(); renderPatternSheet(); applyDebounced();
    });
    var cnt = document.createElement('span');
    cnt.className = 'count num';
    cnt.textContent = String(clampNum(n.count, 0, 30));
    var plus = document.createElement('button');
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'More LEDs');
    plus.addEventListener('click', function () {
      state.nodes[i].count = clampNum(state.nodes[i].count + 1, 0, 30);
      saveState(); renderAll(); renderPatternSheet(); applyDebounced();
    });
    step.appendChild(minus); step.appendChild(cnt); step.appendChild(plus);
    row.appendChild(step);
    if (state.nodes.length > 1) {
      var rm = document.createElement('button');
      rm.className = 'btn small danger';
      rm.textContent = 'Remove';
      rm.addEventListener('click', function () {
        state.nodes.splice(i, 1);
        saveState(); renderAll(); renderPatternSheet(); applyDebounced();
      });
      row.appendChild(rm);
    }
    list.appendChild(row);
  });
  $('addNodeBtn').addEventListener('click', function () {
    if (state.nodes.length >= 12) { toast('12 nodes is the maximum'); return; }
    state.nodes.push({ hex: state.color, count: 6 });
    saveState(); renderAll(); renderPatternSheet(); applyDebounced();
  });
  $('patternDone').addEventListener('click', closeSheet);
  openSheet();
}

function renderEffectSheet() {
  var s = $('sheet');
  var html = '<div class="grabber"></div><h2>Effect</h2><p class="sub">How the pattern moves. Rainbow auto-fills rainbow node colors.</p><div class="effect-grid">';
  EFFECTS.forEach(function (e) {
    html += '<button class="effect-btn' + (state.effect === e ? ' active' : '') + '" data-effect="' + e + '">' + e + '</button>';
  });
  html += '</div><button class="btn" id="effectDone" style="margin-top:16px">Done</button>';
  s.innerHTML = html;
  s.querySelectorAll('.effect-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.effect = b.getAttribute('data-effect');
      if (state.effect === 'RAINBOW') {
        var total = 0;
        state.nodes.forEach(function (n) { total += clampNum(n.count, 0, 30); });
        if (!total) total = 48;
        var per = Math.max(1, Math.round(total / RAINBOW_HEX.length));
        state.nodes = RAINBOW_HEX.map(function (h) { return { hex: h, count: per }; });
      }
      saveState();
      renderAll();
      applyDebounced();
      renderEffectSheet();
    });
  });
  $('effectDone').addEventListener('click', closeSheet);
  openSheet();
}

function renderSceneSheet(scene) {
  var isEdit = !!scene;
  var s = $('sheet');
  var html = '<div class="grabber"></div><h2>' + (isEdit ? 'Rename scene' : 'Save scene') + '</h2><p class="sub">' + (isEdit ? 'Change the name or category.' : 'Saves the current color, pattern, effect, brightness, speed, and zone overrides.') + '</p>';
  html += '<div class="field"><label for="sceneName">Name</label><input type="text" id="sceneName" value="' + (isEdit ? scene.name.replace(/"/g, '') : '') + '" placeholder="e.g. Christmas Classic"></div>';
  html += '<div class="field"><label for="sceneCat">Category</label><select id="sceneCat">';
  CATEGORIES.forEach(function (c) {
    html += '<option value="' + c + '"' + (isEdit && scene.category === c ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select></div>';
  html += '<button class="btn" id="sceneSaveBtn">Save scene</button>';
  s.innerHTML = html;
  $('sceneSaveBtn').addEventListener('click', function () {
    var name = $('sceneName').value.trim();
    if (!name) { toast('Give the scene a name'); return; }
    var cat = $('sceneCat').value;
    if (isEdit) {
      scene.name = name;
      scene.category = cat;
      syncPreset(scene);
    } else {
      var ns = {
        id: 'scene-' + Date.now(),
        name: name, category: cat,
        effect: state.effect, brightness: state.brightness, speed: state.speed,
        color: state.color,
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        zoneOverrides: JSON.parse(JSON.stringify(state.zoneOverrides))
      };
      scenes.push(ns);
      syncPreset(ns);
    }
    saveScenes();
    renderScenes();
    closeSheet();
    toast('Scene saved');
  });
  openSheet();
}

/* ================= Client: voice ================= */
var COLOR_WORDS = [
  ['warm white', '#f5c98a'], ['red', '#ef4444'], ['green', '#22c55e'], ['blue', '#2563eb'],
  ['yellow', '#facc15'], ['purple', '#9333ea'], ['orange', '#f97316'], ['white', '#ffffff'],
  ['pink', '#ec4899'], ['cyan', '#06b6d4'], ['gold', '#f59e0b'], ['teal', '#06b6d4']
];

function parseCommandLocal(text) {
  var t = ' ' + String(text || '').toLowerCase() + ' ';
  var cmd = { action: 'apply', effect: null, brightness: null, speed: null, color: null, nodes: null, name: null };
  var matched = 0;
  if (t.indexOf('turn off') !== -1 || t.indexOf('lights off') !== -1 || t.indexOf('power off') !== -1 || t.indexOf('switch off') !== -1) {
    cmd.action = 'power_off'; matched++;
    return cmd;
  }
  if (t.indexOf('turn on') !== -1 || t.indexOf('lights on') !== -1 || t.indexOf('power on') !== -1 || t.indexOf('switch on') !== -1) {
    cmd.action = 'power_on'; matched++;
  }
  var saveM = t.match(/save (?:this )?as (.+)/) || t.match(/save (.+)/);
  if (saveM) {
    cmd.action = 'save';
    cmd.name = saveM[1].replace(/[.]+$/, '').trim();
    matched++;
  }
  var effMap = { rainbow: 'RAINBOW', chase: 'CHASE', twinkle: 'TWINKLE', wave: 'WAVE', comet: 'COMET', strobe: 'STROBE', pulse: 'PULSE', fade: 'FADE', static: 'STATIC', solid: 'STATIC', breath: 'PULSE' };
  for (var k in effMap) {
    if (t.indexOf(k) !== -1) { cmd.effect = effMap[k]; matched++; break; }
  }
  if (t.indexOf('christmas') !== -1) {
    cmd.nodes = [{ hex: '#ef4444', count: 10 }, { hex: '#22c55e', count: 10 }, { hex: '#ffffff', count: 4 }];
    cmd.color = '#ef4444'; matched++;
  } else if (t.indexOf('halloween') !== -1) {
    cmd.nodes = [{ hex: '#f97316', count: 12 }, { hex: '#9333ea', count: 12 }];
    cmd.color = '#f97316'; matched++;
  } else {
    for (var i = 0; i < COLOR_WORDS.length; i++) {
      if (t.indexOf(COLOR_WORDS[i][0]) !== -1) {
        cmd.color = COLOR_WORDS[i][1];
        cmd.nodes = [{ hex: COLOR_WORDS[i][1], count: 12 }];
        matched++;
        break;
      }
    }
  }
  var bM = t.match(/(\\d{1,3})\\s*%/);
  if (bM) { cmd.brightness = clampNum(Number(bM[1]), 0, 100); matched++; }
  else {
    var bM2 = t.match(/brightness\\s*(\\d{1,3})/) || t.match(/(\\d{1,3})\\s*percent/);
    if (bM2) { cmd.brightness = clampNum(Number(bM2[1]), 0, 100); matched++; }
  }
  var sM = t.match(/speed\\s*(\\d{1,3})/);
  if (sM) { cmd.speed = clampNum(Number(sM[1]), 0, 100); matched++; }
  cmd._matched = matched;
  return cmd;
}

function executeVoiceCmd(cmd) {
  if (!cmd) return;
  if (cmd.action === 'power_off') { state.power = false; }
  else if (cmd.action === 'power_on') { state.power = true; }
  if (cmd.effect) state.effect = cmd.effect;
  if (typeof cmd.brightness === 'number') state.brightness = clampNum(cmd.brightness, 0, 100);
  if (typeof cmd.speed === 'number') state.speed = clampNum(cmd.speed, 0, 100);
  if (Array.isArray(cmd.nodes) && cmd.nodes.length) {
    state.nodes = cmd.nodes.slice(0, 12).map(function (n) { return { hex: n.hex, count: clampNum(n.count, 0, 30) }; });
    state.color = cmd.nodes[0].hex;
  } else if (cmd.color) {
    state.color = cmd.color;
    state.nodes = [{ hex: cmd.color, count: 12 }];
  }
  if (cmd.action === 'save' && cmd.name) {
    var ns = {
      id: 'scene-' + Date.now(), name: cmd.name, category: 'Custom',
      effect: state.effect, brightness: state.brightness, speed: state.speed,
      color: state.color,
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      zoneOverrides: JSON.parse(JSON.stringify(state.zoneOverrides))
    };
    scenes.push(ns);
    saveScenes();
    syncPreset(ns);
    renderScenes();
  }
  saveState();
  renderAll();
  applyDebounced();
}

function renderVoiceSheet() {
  var s = $('sheet');
  var html = '<div class="grabber"></div><h2>Voice AI</h2><p class="sub">Say or type a command, like \u201cturn the lights red and chase at 80 percent\u201d or \u201csave this as Christmas\u201d.</p>';
  html += '<button class="mic-btn" id="voiceMic" aria-label="Start listening"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></button>';
  html += '<p class="section-sub" id="voiceStatus" style="text-align:center">Tap the mic or type below.</p>';
  html += '<div class="field"><input type="text" id="voiceText" placeholder="Type a command" autocomplete="off"></div>';
  html += '<button class="btn secondary" id="voiceParse">Parse command</button>';
  html += '<div class="cmd-preview" id="voicePreview" style="display:none"></div>';
  html += '<div style="display:flex;gap:10px;margin-top:12px"><button class="btn" id="voiceApply" style="flex:1" disabled>Apply</button><button class="btn secondary" id="voiceCancel" style="flex:1">Cancel</button></div>';
  s.innerHTML = html;
  $('voiceCancel').addEventListener('click', closeSheet);
  function showCmd(cmd, source) {
    pendingVoiceCmd = cmd;
    var pre = $('voicePreview');
    pre.style.display = 'block';
    pre.textContent = JSON.stringify(cmd, null, 2) + '\\n\\nSource: ' + source;
    $('voiceApply').disabled = false;
    if (cmd._matched === 0) $('voiceStatus').textContent = 'I did not catch a color, effect, or brightness in that. Try again.';
    else $('voiceStatus').textContent = 'Understood. Review and apply.';
  }
  function parseText(text) {
    if (!text.trim()) { $('voiceStatus').textContent = 'Type or say a command first.'; return; }
    var local = parseCommandLocal(text);
    showCmd(local, 'On-device parser');
    if (navigator.onLine && health.ai) {
      fetch('/api/voice', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ text: text }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.command) showCmd(d.command, 'Workers AI');
        })
        .catch(function () {});
    }
  }
  $('voiceParse').addEventListener('click', function () { parseText($('voiceText').value); });
  $('voiceText').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') parseText($('voiceText').value);
  });
  $('voiceApply').addEventListener('click', function () {
    if (!pendingVoiceCmd) return;
    executeVoiceCmd(pendingVoiceCmd);
    pendingVoiceCmd = null;
    closeSheet();
    toast('Voice command applied');
  });
  $('voiceMic').addEventListener('click', function () {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      $('voiceStatus').textContent = 'Speech recognition is not supported in this browser. Type a command below.';
      return;
    }
    if (voiceRec) { try { voiceRec.stop(); } catch (e) {} voiceRec = null; return; }
    var rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    voiceRec = rec;
    $('voiceMic').classList.add('listening');
    $('voiceStatus').textContent = 'Listening. Speak now.';
    rec.onresult = function (e) {
      var text = e.results[0][0].transcript;
      $('voiceText').value = text;
      parseText(text);
    };
    rec.onerror = function (e) {
      $('voiceStatus').textContent = 'Microphone error: ' + (e.error || 'unknown') + '. Type a command below.';
    };
    rec.onend = function () {
      voiceRec = null;
      $('voiceMic').classList.remove('listening');
    };
    try { rec.start(); } catch (e) {
      $('voiceStatus').textContent = 'Could not start the microphone. Type a command below.';
      voiceRec = null;
      $('voiceMic').classList.remove('listening');
    }
  });
  openSheet();
}

/* ================= Client: presets sync + settings ================= */
function fetchPresets() {
  fetch('/api/presets', { headers: apiHeaders() })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d && d.storage === 'kv' && Array.isArray(d.presets) && d.presets.length) {
        scenes = d.presets;
        saveScenes();
        renderScenes();
      }
    })
    .catch(function () {});
}
function syncPreset(scene) {
  fetch('/api/presets', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ preset: scene }) }).catch(function () {});
}
function syncPresetsDelete(id) {
  fetch('/api/presets', { method: 'DELETE', headers: apiHeaders(), body: JSON.stringify({ id: id }) }).catch(function () {});
}
function fetchHealth() {
  fetch('/api/health', { headers: apiHeaders() })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d) {
        health.ok = !!d.ok;
        health.simulated = !!d.simulated;
        health.kv = !!d.kv;
        health.ai = !!d.ai;
        health.version = d.version || health.version;
      }
      updateTelemetry();
    })
    .catch(function () { updateTelemetry(); });
}

/* ================= Client: init ================= */
function wireSlider(id, key, labelId) {
  var el = $(id);
  var lastInt = state[key];
  el.addEventListener('input', function () {
    var v = clampNum(Number(el.value), 0, 100);
    var iv = Math.round(v);
    if (iv !== Math.round(lastInt) && navigator.vibrate) { try { navigator.vibrate(5); } catch (e) {} }
    lastInt = v;
    state[key] = iv;
    $(labelId).textContent = iv + '%';
    paintSlider(el, iv);
    saveState();
    renderAll();
    applyDebounced();
  });
}

function init() {
  canvas = $('ledCanvas');
  ctx = canvas.getContext('2d');
  try {
    var pin = localStorage.getItem(LS_PIN);
    if (pin) $('pinInput').value = pin;
  } catch (e) {}
  $('powerBtn').addEventListener('click', function () {
    state.power = !state.power;
    saveState();
    renderAll();
    applyNow();
  });
  $('qaPower').addEventListener('click', function () {
    state.power = !state.power;
    saveState();
    renderAll();
    applyNow();
  });
  $('qaVoice').addEventListener('click', renderVoiceSheet);
  $('qaWarm').addEventListener('click', function () {
    state.colorMode = 'kelvin';
    state.kelvin = 2700;
    state.color = kelvinToHex(2700);
    state.effect = 'STATIC';
    state.nodes = [{ hex: state.color, count: 12 }];
    state.power = true;
    saveState();
    renderAll();
    applyDebounced();
    toast('2700K warm white');
  });
  $('qaPattern').addEventListener('click', renderPatternSheet);
  $('qaScenes').addEventListener('click', function () { switchTab('scenes'); });
  $('rowColor').addEventListener('click', renderColorSheet);
  $('rowPattern').addEventListener('click', renderPatternSheet);
  $('rowEffect').addEventListener('click', renderEffectSheet);
  wireSlider('brightnessSlider', 'brightness', 'brightnessVal');
  wireSlider('speedSlider', 'speed', 'speedVal');
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
  });
  $('sceneSearch').addEventListener('input', function () {
    sceneSearch = $('sceneSearch').value;
    renderScenes();
  });
  $('newSceneBtn').addEventListener('click', function () { editingSceneId = null; renderSceneSheet(null); });
  $('themeDark').addEventListener('click', function () {
    state.theme = 'dark';
    saveState();
    renderAll();
  });
  $('themeLight').addEventListener('click', function () {
    state.theme = 'light';
    saveState();
    renderAll();
  });
  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(scenes, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trimlight-scenes.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Scenes exported');
  });
  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = $('importFile').files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('not an array');
        var valid = data.filter(function (s) { return s && s.name && Array.isArray(s.nodes); });
        if (!valid.length) { toast('No valid scenes in that file'); return; }
        scenes = valid;
        saveScenes();
        valid.forEach(syncPreset);
        renderScenes();
        toast(valid.length + ' scenes imported');
      } catch (e) {
        toast('Import failed: not a valid scenes file');
      }
    };
    reader.readAsText(f);
    $('importFile').value = '';
  });
  $('pinInput').addEventListener('change', function () {
    try { localStorage.setItem(LS_PIN, $('pinInput').value); } catch (e) {}
    toast('PIN saved on this device');
  });
  $('resetBtn').addEventListener('click', function () {
    if (!window.confirm('Reset all lighting state, scenes, and settings to defaults?')) return;
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SCENES);
    } catch (e) {}
    window.location.reload();
  });
  $('sheetBackdrop').addEventListener('click', closeSheet);
  window.addEventListener('online', flushQueue);
  window.addEventListener('offline', updateTelemetry);
  window.addEventListener('resize', sizeCanvas);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sizeCanvas(); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
  sizeCanvas();
  renderAll();
  requestAnimationFrame(tick);
  fetchHealth();
  fetchPresets();
}

document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Service worker (served at /sw.js). Stale-while-revalidate for the app
// shell; /api/* always bypasses the cache.
// ---------------------------------------------------------------------------
const SW_JS = `var CACHE = 'trimlight-edge-v2';
var SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.pathname.indexOf('/api/') === 0) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
`;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#000000"/><path d="M96 300 L200 180 L256 236 L312 180 L416 300" fill="none" stroke="#ef4444" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="M140 340 h232" stroke="#3E6AE1" stroke-width="20" stroke-linecap="round"/><circle cx="256" cy="400" r="18" fill="#facc15"/></svg>`;

const LLMS_TXT = `Trimlight Edge v2
=================
An offline-first Progressive Web App for controlling Trimlight Edge permanent
roofline lighting, served as a single-file Cloudflare Worker.

What it does
- Control power, color, pattern nodes, effects, brightness, and speed for a
  151 ft roofline split into four zones (Left Gables 42 ft, Entry Gable 32 ft,
  Right Main Gable 28 ft, Right Inner Gable 49 ft).
- Save scenes (presets) locally and in Cloudflare KV.
- Voice and text commands via Workers AI with an on-device parser fallback.
- Works offline: edits queue in localStorage and flush on reconnect.

Routes
- GET / — the app
- GET /api/health — { ok, simulated, kv, ai, version }
- POST /api/apply — apply a lighting state (Simulation Mode until the
  Trimlight secrets are set)
- GET | POST | DELETE /api/presets — scene CRUD (KV-backed, local-only fallback)
- POST /api/voice — natural-language command to structured lighting command

Secrets (set with wrangler secret put)
- TRIMLIGHT_API_ID, TRIMLIGHT_API_SECRET, TRIMLIGHT_DEVICE_ID
- APP_PIN (optional)
`;

// ---------------------------------------------------------------------------
// Trimlight Edge Cloud proxy
// ---------------------------------------------------------------------------
function b64encode(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

async function trimlightHeaders(env) {
  const ts = String(Date.now());
  const msg = 'Trimlight|' + env.TRIMLIGHT_API_ID + '|' + ts;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.TRIMLIGHT_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return {
    Authorization: b64encode(new Uint8Array(sig)),
    'S-ClientId': env.TRIMLIGHT_API_ID,
    'S-Timestamp': ts,
    'Content-Type': 'application/json',
  };
}

function trimlightConfigured(env) {
  return !!(env.TRIMLIGHT_API_ID && env.TRIMLIGHT_API_SECRET && env.TRIMLIGHT_DEVICE_ID);
}

function rainbowNodes(total) {
  if (!total || total <= 0) total = 48;
  const per = Math.max(1, Math.round(total / RAINBOW_HEX.length));
  return RAINBOW_HEX.map((h) => ({ hex: h, count: per }));
}

// Expand pattern nodes to a per-LED color array, then apply zone overrides
// by roofline position (zones are sequential segments of the 151 ft run).
function expandToLeds(nodes, zoneOverrides) {
  const leds = [];
  for (const n of nodes || []) {
    const count = clamp(n.count, 0, 30);
    for (let i = 0; i < count; i++) leds.push(hexToInt(n.hex));
  }
  if (!leds.length) leds.push(0);
  const total = leds.length;
  let acc = 0;
  for (const z of ZONE_FT) {
    const lo = Math.floor((acc / TOTAL_FT) * total);
    const hi = Math.ceil(((acc + z.ft) / TOTAL_FT) * total);
    const ov = zoneOverrides && zoneOverrides[String(z.id)];
    if (ov) {
      const color = ov.power === false ? 0 : hexToInt(ov.hex || '#ffffff');
      for (let j = lo; j < hi && j < total; j++) leds[j] = color;
    }
    acc += z.ft;
  }
  return leds;
}

function compressLeds(leds) {
  const px = [];
  let i = 0;
  while (i < leds.length) {
    const c = leds[i];
    let j = i;
    while (j < leds.length && leds[j] === c) j++;
    px.push({ index: Math.min(i, 29), count: Math.min(j - i, 60), color: c, disable: false });
    i = j;
  }
  return px;
}

async function handleApply(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!trimlightConfigured(env)) {
    return json({ simulated: true, appliedState: body });
  }
  const base = (env.TRIMLIGHT_BASE_URL || 'https://trimlight.ledhue.com/trimlight').replace(/\/+$/, '');
  const headers = await trimlightHeaders(env);
  const deviceId = env.TRIMLIGHT_DEVICE_ID;

  if (body.power === false) {
    const res = await fetch(base + '/v1/oauth/resources/device/update', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, payload: { switchState: 0 } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, status: res.status, desc: data.desc || data.message || 'Trimlight update failed', upstream: data }, res.status);
    return json({ ok: true, simulated: false, appliedState: body, upstream: data });
  }

  const effect = typeof body.effect === 'string' && EFFECT_MODES[body.effect] !== undefined ? body.effect : 'STATIC';
  const mode = EFFECT_MODES[effect];
  const brightness = Math.round((clamp(body.brightness, 0, 100) * 255) / 100);
  const speed = Math.round((clamp(body.speed, 0, 100) * 255) / 100);
  let nodes = Array.isArray(body.nodes) ? body.nodes.slice(0, 12) : [];
  if (effect === 'RAINBOW') {
    let total = 0;
    nodes.forEach((n) => { total += clamp(n.count, 0, 30); });
    nodes = rainbowNodes(total);
  }
  const leds = expandToLeds(nodes, body.zoneOverrides || {});
  const pixels = compressLeds(leds);
  const res = await fetch(base + '/v1/oauth/resources/device/effect/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      deviceId,
      payload: { category: 1, mode, speed, brightness, pixels },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, status: res.status, desc: data.desc || data.message || 'Trimlight effect preview failed', upstream: data }, res.status);
  return json({ ok: true, simulated: false, appliedState: body, upstream: data });
}

// ---------------------------------------------------------------------------
// Presets (KV-backed, local-only fallback)
// ---------------------------------------------------------------------------
async function kvGetPresets(env) {
  if (!env.TRIMLIGHT_KV) return null;
  const raw = await env.TRIMLIGHT_KV.get('presets');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

async function handlePresets(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const presets = await kvGetPresets(env);
    if (presets === null) return json({ storage: 'local-only', presets: [] });
    return json({ storage: 'kv', presets });
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const preset = body.preset || body;
    if (!preset || typeof preset !== 'object' || !preset.name) {
      return json({ ok: false, error: 'preset with a name is required' }, 400);
    }
    if (!preset.id) preset.id = crypto.randomUUID();
    const presets = await kvGetPresets(env);
    if (presets === null) return json({ ok: false, storage: 'local-only', preset });
    const idx = presets.findIndex((p) => p.id === preset.id);
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    await env.TRIMLIGHT_KV.put('presets', JSON.stringify(presets));
    return json({ ok: true, storage: 'kv', preset });
  }
  if (request.method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    const id = body.id || url.searchParams.get('id');
    if (!id) return json({ ok: false, error: 'id is required' }, 400);
    const presets = await kvGetPresets(env);
    if (presets === null) return json({ ok: false, storage: 'local-only' });
    const next = presets.filter((p) => p.id !== id);
    if (next.length === presets.length) return json({ ok: false, error: 'preset not found' }, 404);
    await env.TRIMLIGHT_KV.put('presets', JSON.stringify(next));
    return json({ ok: true, storage: 'kv', removed: id });
  }
  return json({ ok: false, error: 'method not allowed' }, 405);
}

// ---------------------------------------------------------------------------
// Voice: Workers AI with on-device parser fallback (server copy)
// ---------------------------------------------------------------------------
const VOICE_COLOR_WORDS = [
  ['warm white', '#f5c98a'], ['red', '#ef4444'], ['green', '#22c55e'], ['blue', '#2563eb'],
  ['yellow', '#facc15'], ['purple', '#9333ea'], ['orange', '#f97316'], ['white', '#ffffff'],
  ['pink', '#ec4899'], ['cyan', '#06b6d4'], ['gold', '#f59e0b'], ['teal', '#06b6d4'],
];

function parseVoiceCommand(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const cmd = { action: 'apply', effect: null, brightness: null, speed: null, color: null, nodes: null, name: null };
  let matched = 0;
  if (t.indexOf('turn off') !== -1 || t.indexOf('lights off') !== -1 || t.indexOf('power off') !== -1 || t.indexOf('switch off') !== -1) {
    cmd.action = 'power_off';
    return cmd;
  }
  if (t.indexOf('turn on') !== -1 || t.indexOf('lights on') !== -1 || t.indexOf('power on') !== -1 || t.indexOf('switch on') !== -1) {
    cmd.action = 'power_on';
    matched++;
  }
  const saveM = t.match(/save (?:this )?as (.+)/) || t.match(/save (.+)/);
  if (saveM) {
    cmd.action = 'save';
    cmd.name = saveM[1].replace(/[.]+$/, '').trim();
    matched++;
  }
  const effMap = { rainbow: 'RAINBOW', chase: 'CHASE', twinkle: 'TWINKLE', wave: 'WAVE', comet: 'COMET', strobe: 'STROBE', pulse: 'PULSE', fade: 'FADE', static: 'STATIC', solid: 'STATIC', breath: 'PULSE' };
  for (const k in effMap) {
    if (t.indexOf(k) !== -1) { cmd.effect = effMap[k]; matched++; break; }
  }
  if (t.indexOf('christmas') !== -1) {
    cmd.nodes = [{ hex: '#ef4444', count: 10 }, { hex: '#22c55e', count: 10 }, { hex: '#ffffff', count: 4 }];
    cmd.color = '#ef4444';
    matched++;
  } else if (t.indexOf('halloween') !== -1) {
    cmd.nodes = [{ hex: '#f97316', count: 12 }, { hex: '#9333ea', count: 12 }];
    cmd.color = '#f97316';
    matched++;
  } else {
    for (const [word, hex] of VOICE_COLOR_WORDS) {
      if (t.indexOf(word) !== -1) {
        cmd.color = hex;
        cmd.nodes = [{ hex, count: 12 }];
        matched++;
        break;
      }
    }
  }
  const bM = t.match(/(\d{1,3})\s*%/) || t.match(/brightness\s*(\d{1,3})/) || t.match(/(\d{1,3})\s*percent/);
  if (bM) { cmd.brightness = clamp(Number(bM[1]), 0, 100); matched++; }
  const sM = t.match(/speed\s*(\d{1,3})/);
  if (sM) { cmd.speed = clamp(Number(sM[1]), 0, 100); matched++; }
  cmd._matched = matched;
  return cmd;
}

const VOICE_SYSTEM = 'You convert a lighting request into one JSON object. Reply with ONLY a JSON object, no other text. Shape: {"action":"apply"|"save"|"power_on"|"power_off","effect":"STATIC|CHASE|FADE|TWINKLE|WAVE|COMET|STROBE|PULSE|RAINBOW","brightness":0-100,"speed":0-100,"color":"#RRGGBB","nodes":[{"hex":"#RRGGBB","count":0-30}],"name":"scene name when action is save"}';

async function handleVoice(request, env) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || '');
  let cmd = null;
  let source = 'parser';
  if (env.AI && text) {
    try {
      const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: VOICE_SYSTEM },
          { role: 'user', content: text },
        ],
      });
      const raw = typeof out === 'string' ? out : (out.response || '');
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        cmd = JSON.parse(m[0]);
        source = 'workers-ai';
      }
    } catch (e) {
      cmd = null;
    }
  }
  if (!cmd) cmd = parseVoiceCommand(text);
  return json({ ok: true, command: cmd, source });
}

// ---------------------------------------------------------------------------
// API guard: optional APP_PIN. Same-origin browser requests pass without the
// PIN (the browser cannot hold the secret); cross-origin/programmatic
// callers must send X-App-Pin when APP_PIN is set.
// ---------------------------------------------------------------------------
function pinAllowed(request, env) {
  const pin = env.APP_PIN;
  if (!pin) return true;
  const origin = new URL(request.url).origin;
  const hdr = request.headers.get('X-App-Pin');
  if (hdr && hdr === pin) return true;
  const o = request.headers.get('Origin');
  if (o && o === origin) return true;
  const r = request.headers.get('Referer');
  if (r && r.startsWith(origin + '/')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/') {
      const nonce = crypto.randomUUID();
      const csp = [
        "default-src 'self'",
        "script-src 'nonce-" + nonce + "'",
        "style-src 'unsafe-inline'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; ');
      return new Response(renderHTML(nonce), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': csp,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (path === '/manifest.webmanifest') {
      return new Response(JSON.stringify({
        name: 'House With the Cool Door Trimlights',
        short_name: 'Cool Door Lights',
        description: 'Offline-first PWA for Trimlight Edge roofline lighting.',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }],
      }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
    }

    if (path === '/sw.js') {
      return new Response(SW_JS, { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' } });
    }

    if (path === '/icon.svg') {
      return new Response(ICON_SVG, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    }

    if (path === '/robots.txt') {
      return new Response('User-agent: *\nAllow: /\nSitemap: ' + url.origin + '/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (path === '/sitemap.xml') {
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + url.origin + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n';
      return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
    }

    if (path === '/llms.txt') {
      return new Response(LLMS_TXT, { headers: { 'Content-Type': 'text/plain' } });
    }

    if (path.startsWith('/api/')) {
      if (!pinAllowed(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      if (path === '/api/health' && request.method === 'GET') {
        return json({ ok: true, simulated: !trimlightConfigured(env), kv: !!env.TRIMLIGHT_KV, ai: !!env.AI, version: VERSION });
      }
      if (path === '/api/apply' && request.method === 'POST') return handleApply(request, env);
      if (path === '/api/presets') return handlePresets(request, env);
      if (path === '/api/voice' && request.method === 'POST') return handleVoice(request, env);
      return json({ ok: false, error: 'not found' }, 404);
    }

    return json({ ok: false, error: 'not found' }, 404);
  },
};
