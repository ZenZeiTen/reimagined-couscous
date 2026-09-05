/**
 * AUDIO — buses · zone ambience · generated reverb · surfaces · feedback. All synthesised in Web Audio: no files,
 * no fetches, deterministic. master → compressor → out; amb bus + sfx bus; sfx also feeds two convolvers (A/B)
 * whose impulse responses are rebuilt per zone and crossfaded.
 */
import { clamp } from '../util.js';
export const AUDIO = {
  ready: false, zone: null, evT: {}, danger: 0, surface: 'stone',
  AMB: {
    shore:     { wind: 0.06, surf: 0.05, hum: 0.02, chime: 0,    heat: 0,    events: { creak: [6, 16], gull: [9, 30] },   rev: { len: 0.9, wet: 0.12, lp: 6000 } },
    shrine:    { wind: 0.01, surf: 0.03, hum: 0.03, chime: 0.01, heat: 0,    events: { drip: [2, 5] },   rev: { len: 2.2, wet: 0.3, lp: 2500 } },
    gallery:   { wind: 0.035, surf: 0,   hum: 0.04, chime: 0,    heat: 0,    events: { clatter: [14, 40] }, rev: { len: 1.8, wet: 0.22, lp: 5000 } },
    cloister:  { wind: 0,    surf: 0.02, hum: 0.03, chime: 0.008, heat: 0,   events: { bell: [12, 26], drip: [1.5, 4] }, rev: { len: 3.0, wet: 0.35, lp: 1400 } },
    cistern:   { wind: 0,    surf: 0,    hum: 0.06, chime: 0,    heat: 0.04, events: { groan: [8, 20], drip: [1, 3] },   rev: { len: 1.2, wet: 0.2, lp: 3000 } },
    sepulchre: { wind: 0,    surf: 0,    hum: 0.03, chime: 0.02, heat: 0,    events: { shard: [5, 12] },   rev: { len: 4.2, wet: 0.4, lp: 9000 } },
    moongate:  { wind: 0.01, surf: 0,    hum: 0.05, chime: 0.03, heat: 0,    events: { shard: [3, 8] },    rev: { len: 5.0, wet: 0.45, lp: 9000 } },
    none:      { wind: 0.03, surf: 0,    hum: 0.03, chime: 0,    heat: 0,    events: { drip: [2, 6] },     rev: { len: 1.5, wet: 0.2, lp: 4000 } } },
  vol: { master: 0.7, amb: 1.0, sfx: 1.0 },
  init() { if (this.ready) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; } const c = this.ctx; try {
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.amb = c.createGain(); this.amb.gain.value = this.vol.amb; this.amb.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = this.vol.sfx; this.sfx.connect(this.master);
    this.revA = { conv: c.createConvolver(), g: c.createGain() }; this.revB = { conv: c.createConvolver(), g: c.createGain() };
    for (const r of [this.revA, this.revB]) { r.g.gain.value = 0; this.sfx.connect(r.conv); r.conv.connect(r.g); r.g.connect(this.master); }
    this.revCur = this.revA;
    const len = c.sampleRate; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
    const layer = (make) => { const g = c.createGain(); g.gain.value = 0; make(g); g.connect(this.amb); return g; };
    const src = () => { const n = c.createBufferSource(); n.buffer = buf; n.loop = true; n.start(); return n; };
    this.L = {};
    this.L.wind = layer(g => { const n = src(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.8; n.connect(f); f.connect(g);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); });
    this.L.surf = layer(g => { const n = src(), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 180; f.Q.value = 0.6; const sw = c.createGain(); sw.gain.value = 0.5;
      n.connect(f); f.connect(sw); sw.connect(g); const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(sw.gain); lfo.start(); });
    this.L.hum = layer(g => { const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 44; const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 66; const g2 = c.createGain(); g2.gain.value = 0.25;
      o1.connect(g); o2.connect(g2); g2.connect(g); o1.start(); o2.start(); const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(g.gain); lfo.start(); });
    this.L.chime = layer(g => { [1210, 1815, 2420].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f + (i - 1) * 0.6; const og = c.createGain(); og.gain.value = 0.5 / (i + 1); o.connect(og); og.connect(g); o.start(); }); });
    this.L.heat = layer(g => { const n = src(), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200; n.connect(f); f.connect(g); });
    this.ready = true; if (c.state === 'suspended') c.resume(); this.setZone(this.zone || 'none', true); } catch (e) { console.error('audio init failed', e); this.ready = false; } },
  impulse(len, lp) { const c = this.ctx, n = Math.floor(c.sampleRate * len), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let y = 0; const a = Math.exp(-2 * Math.PI * lp / c.sampleRate);
      for (let i = 0; i < n; i++) { const env = Math.pow(1 - i / n, 2.2) * Math.exp(-3 * i / n); y = a * y + (1 - a) * (Math.random() * 2 - 1); d[i] = y * env * (i < 40 ? i / 40 : 1); } }
    return b; },
  setZone(id, hard) { this.zone = id; if (!this.ready) return; const c = this.ctx, t = c.currentTime, A = this.AMB[id] || this.AMB.none, tc = hard ? 0.05 : 2.5;
    for (const k in this.L) { this.L[k].gain.cancelScheduledValues(t); this.L[k].gain.setTargetAtTime(A[k] || 0, t, tc / 3); }
    const nxt = this.revCur === this.revA ? this.revB : this.revA; nxt.conv.buffer = this.impulse(A.rev.len, A.rev.lp);
    nxt.g.gain.cancelScheduledValues(t); nxt.g.gain.setTargetAtTime(A.rev.wet, t, tc / 3); this.revCur.g.gain.cancelScheduledValues(t); this.revCur.g.gain.setTargetAtTime(0, t, tc / 3); this.revCur = nxt;
    this.evT = {}; for (const ev in A.events) this.evT[ev] = A.events[ev][0] * (0.5 + Math.random()); },
  update(dt, dangerNear, bossNear) {
    if (!this.ready) return; const A = this.AMB[this.zone] || this.AMB.none;
    for (const ev in this.evT) { this.evT[ev] -= dt; if (this.evT[ev] <= 0) { const r = A.events[ev]; this.evT[ev] = r[0] + Math.random() * (r[1] - r[0]); const pan = Math.random() * 2 - 1;
      if (ev === 'drip') this.tone(1400 + Math.random() * 900, 500, 0.12, 'sine', 0.045, pan);
      else if (ev === 'creak') { this.tone(90 + Math.random() * 40, 60, 0.9, 'sawtooth', 0.04, pan); this.noise(0.5, 'bandpass', 300, 120, 0.05, pan); }
      else if (ev === 'gull') { this.tone(1800, 1200, 0.25, 'sine', 0.02, pan); setTimeout(() => this.tone(1600, 1100, 0.2, 'sine', 0.015, pan), 260); }
      else if (ev === 'clatter') { this.tone(700, 250, 0.2, 'square', 0.03, pan); this.noise(0.12, 'highpass', 1500, 1500, 0.025, pan); setTimeout(() => this.tone(600, 220, 0.18, 'square', 0.02, pan), 160); }
      else if (ev === 'bell') { this.bell(pan, 0.06); }
      else if (ev === 'groan') { this.tone(48, 32, 2.2, 'sawtooth', 0.09, pan); this.noise(1.6, 'lowpass', 220, 70, 0.08, pan); }
      else if (ev === 'shard') { this.tone(2200 + Math.random() * 1400, 3200, 0.5, 'sine', 0.025, pan); } } }
    this.danger += ((dangerNear ? 1 : 0) - this.danger) * Math.min(1, dt * 1.5);
    if (this.danger > 0.02) { this.dangerT = (this.dangerT || 0) + dt; const period = bossNear ? 0.7 : 1.1; if (this.dangerT > period) { this.dangerT = 0; this.tone(bossNear ? 41 : 52, 40, 0.35, 'sine', 0.16 * this.danger, 0); if (bossNear) this.tone(82, 60, 0.2, 'triangle', 0.05 * this.danger, 0); } } },
  bell(pan, g) { if (!this.ready) return; const c = this.ctx, t = c.currentTime; [220, 331, 552].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const gn = c.createGain();
    gn.gain.setValueAtTime((g || 0.06) / (i + 1), t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; o.connect(lp); lp.connect(gn); this.out(gn, pan); o.start(t); o.stop(t + 4.6); }); },
  out(node, pan) { const c = this.ctx; if (c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = clamp(pan || 0, -1, 1); node.connect(sp); sp.connect(this.sfx); } else node.connect(this.sfx); },
  tone(f0, f1, dur, type, gain, pan) { if (!this.ready) return; const c = this.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); this.out(g, pan); o.start(t); o.stop(t + dur + 0.02); },
  noise(dur, type, f0, f1, gain, pan) { if (!this.ready) return; const c = this.ctx, t = c.currentTime; const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur); f.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(f); f.connect(g); this.out(g, pan); n.start(t); n.stop(t + dur + 0.02); },
  step(g, pan, surf) { surf = surf || this.surface;
    if (surf === 'sand') this.noise(0.14, 'lowpass', 900, 250, g * 0.7, pan);
    else if (surf === 'wood') { this.tone(180, 90, 0.08, 'triangle', g * 0.9, pan); this.noise(0.06, 'lowpass', 600, 200, g * 0.4, pan); }
    else if (surf === 'iron') { this.tone(420, 160, 0.09, 'square', g * 0.35, pan); this.noise(0.07, 'highpass', 1200, 800, g * 0.3, pan); }
    else if (surf === 'water') this.noise(0.18, 'bandpass', 900, 300, g * 1.2, pan);
    else if (surf === 'quartz') { this.tone(900, 500, 0.06, 'sine', g * 0.25, pan); this.noise(0.07, 'highpass', 2000, 1200, g * 0.4, pan); }
    else this.noise(0.09, 'lowpass', 380, 120, g, pan); },
  swing(arc, kind) { if (kind === 'crush') { this.noise(0.3, 'lowpass', 500, 120, 0.4, 0.3); return; } if (kind === 'thrust') { this.noise(0.12, 'highpass', 1200, 3000, 0.25, 0.3); return; } this.noise(0.18 + (arc || 90) / 600, 'bandpass', 600, 2200, 0.35, 0.3); },
  hit(heavy) { this.tone(heavy ? 110 : 140, 50, heavy ? 0.26 : 0.18, 'sine', heavy ? 0.6 : 0.45, 0); this.noise(0.08, 'lowpass', 900, 200, 0.35, 0); if (heavy) this.noise(0.2, 'lowpass', 300, 80, 0.3, 0); },
  hurt() { this.tone(90, 40, 0.35, 'sawtooth', 0.35, 0); },
  winded() { this.noise(0.4, 'bandpass', 500, 200, 0.16, 0); },
  empty() { this.tone(300, 200, 0.06, 'square', 0.08, 0); },
  clank(pan) { this.tone(900, 300, 0.25, 'square', 0.1, pan); this.noise(0.15, 'highpass', 1500, 1500, 0.08, pan); },
  gate() { this.noise(1.6, 'lowpass', 260, 90, 0.5, 0.6); this.tone(60, 45, 1.6, 'sawtooth', 0.15, 0.6); },
  crystal() { this.tone(660, 1320, 1.2, 'sine', 0.12, 0); this.tone(990, 1980, 1.4, 'triangle', 0.05, 0); },
  trap() { this.noise(0.5, 'lowpass', 400, 80, 0.6, 0); },
  chime() { this.tone(880, 1760, 0.6, 'triangle', 0.08, 0); },
  guard() { this.tone(1400, 500, 0.18, 'square', 0.16, 0); this.noise(0.12, 'highpass', 2500, 2500, 0.18, 0); },
  guardBreak() { this.tone(700, 120, 0.5, 'sawtooth', 0.3, 0); this.noise(0.3, 'bandpass', 900, 300, 0.4, 0); },
  death() { this.tone(200, 30, 2.5, 'sawtooth', 0.25, 0); },
  ether(pan) { this.noise(3.0, 'highpass', 900, 3200, 0.10, pan); this.tone(520, 1040, 2.8, 'triangle', 0.045, pan); this.tone(130, 65, 3.0, 'sine', 0.06, pan); },
  page() { this.noise(0.08, 'highpass', 2000, 4000, 0.05, 0); },
  bow() { this.noise(0.15, 'bandpass', 900, 2600, 0.2, 0); this.tone(300, 120, 0.1, 'triangle', 0.06, 0); },
  forge() { this.tone(1200, 400, 0.3, 'square', 0.14, 0); this.noise(0.4, 'highpass', 2500, 1500, 0.2, 0); setTimeout(() => this.tone(1500, 500, 0.3, 'square', 0.1, 0), 300); },
  bossRoar() { this.tone(70, 35, 2.4, 'sawtooth', 0.35, 0); this.noise(1.8, 'lowpass', 400, 60, 0.4, 0); this.tone(2400, 300, 1.2, 'sine', 0.08, 0); },
  setVol(k, v) { this.vol[k] = v; if (!this.ready) return; ({ master: this.master, amb: this.amb, sfx: this.sfx })[k].gain.value = v; }
};
