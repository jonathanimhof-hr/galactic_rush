// Galactic Rush V2 audio: everything is synthesised with Web Audio. Mix bus with ducking, generated reverbs,
// layered engine, Doppler flybys, sub-bass impacts and an original adaptive score. Silent no-op without Web Audio.
const NOTE = m => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, music: 0.55, sfx: 0.9 }; this.muted = false; this.state = 'off'; this.env = 'open'; this.voices = new Map(); }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);
      this.musicBus = c.createGain(); this.duckG = c.createGain(); this.musicBus.connect(this.duckG); this.duckG.connect(this.master);
      this.sfx = c.createGain(); this.sfx.connect(this.master); this.uiBus = c.createGain(); this.uiBus.connect(this.master); this.uiBus.gain.value = 0.6;
      // noise buffer and reverbs (generated impulse responses)
      const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
      this.verb = {}; this.sends = {};
      for (const [name, dur, decay, bright] of [['trench', 2.4, 2.6, 0.7], ['tunnel', 1.3, 3.2, 0.9], ['city', 1.6, 3.5, 0.5], ['hangar', 3.2, 2.2, 0.55], ['open', 0.6, 6, 0.3]]) {
        const conv = c.createConvolver(); conv.buffer = this.impulse(dur, decay, bright); const g = c.createGain(); g.gain.value = 0; this.sfx.connect(g); g.connect(conv); conv.connect(this.master); this.sends[name] = g;
      }
      this.musicVerb = c.createGain(); this.musicVerb.gain.value = 0.25; this.musicBus.connect(this.musicVerb); this.musicVerb.connect(this.sends.hangar.context ? this.verbIn('hangar') : this.master);
      this.buildEngine(); this.applyVolume(); this.setEnv(this.env);
      this.next = c.currentTime + 0.1; this.step = 0; this.timer = setInterval(() => this.schedule(), 25);
    } catch (e) { this.ctx = null; }
  }
  verbIn(name) { const g = this.ctx.createGain(); g.gain.value = 0.6; g.connect(this.sends[name]); return g; }
  impulse(dur, decay, bright) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * bright; d[i] = lp * Math.pow(1 - t, decay) * (i < 40 ? i / 40 : 1); } }
    return b;
  }
  configure(s) { this.muted = s.sound === 'off'; this.vol.master = +s.master; this.vol.music = +s.music; this.vol.sfx = +(s.sfx ?? 0.9); this.applyVolume(); }
  applyVolume() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05); this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }
  setEnv(name) {
    this.env = name; if (!this.ctx) return; const t = this.ctx.currentTime;
    const level = { trench: 0.32, tunnel: 0.42, city: 0.22, hangar: 0.35, open: 0.08 };
    for (const k in this.sends) this.sends[k].gain.setTargetAtTime(k === name ? (level[k] ?? 0.1) : 0, t, 0.25);
  }
  duck(amount = 0.45, hold = 0.3) { if (!this.ctx) return; const g = this.duckG.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(amount, t, 0.02); g.setTargetAtTime(1, t + hold, 0.5); }

  // ---------- player engine: sub rumble + turbine whine + afterburner roar ----------
  buildEngine() {
    const c = this.ctx, mk = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    this.eng = c.createGain(); this.eng.gain.value = 0; this.eng.connect(this.sfx);
    this.sub = mk('sine', 42); this.subG = c.createGain(); this.subG.gain.value = 0; this.sub.connect(this.subG); this.subG.connect(this.eng);
    this.wh1 = mk('sawtooth', 600); this.wh2 = mk('triangle', 906); this.whF = c.createBiquadFilter(); this.whF.type = 'bandpass'; this.whF.Q.value = 6; this.whG = c.createGain(); this.whG.gain.value = 0;
    this.wh1.connect(this.whF); this.wh2.connect(this.whF); this.whF.connect(this.whG); this.whG.connect(this.eng);
    const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true; ns.start();
    this.roarF = c.createBiquadFilter(); this.roarF.type = 'lowpass'; this.roarF.frequency.value = 400; this.roarG = c.createGain(); this.roarG.gain.value = 0; ns.connect(this.roarF); this.roarF.connect(this.roarG); this.roarG.connect(this.eng);
    this.rushF = c.createBiquadFilter(); this.rushF.type = 'bandpass'; this.rushF.Q.value = 0.7; this.rushG = c.createGain(); this.rushG.gain.value = 0; ns.connect(this.rushF); this.rushF.connect(this.rushG); this.rushG.connect(this.eng);
  }
  engine(speedFrac, throttle, boost, active, hull01 = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime, on = active && !this.muted ? 1 : 0;
    const stutter = hull01 < 0.3 && Math.random() < 0.15 ? 0.25 : 1;
    this.eng.gain.setTargetAtTime(on * stutter, t, 0.03);
    this.sub.frequency.setTargetAtTime(36 + speedFrac * 22, t, 0.1); this.subG.gain.setTargetAtTime(0.32 + throttle * 0.18 + (boost ? 0.15 : 0), t, 0.1);
    const f = 380 + speedFrac * 1250 + (boost ? 220 : 0); this.wh1.frequency.setTargetAtTime(f, t, 0.08); this.wh2.frequency.setTargetAtTime(f * 1.51, t, 0.08); this.whF.frequency.setTargetAtTime(f * 1.2, t, 0.08);
    this.whG.gain.setTargetAtTime(0.025 + speedFrac * 0.03, t, 0.1);
    this.roarF.frequency.setTargetAtTime(boost ? 2600 : 500 + throttle * 300, t, boost ? 0.04 : 0.2); this.roarG.gain.setTargetAtTime(boost ? 0.32 : 0.04 + throttle * 0.03, t, boost ? 0.03 : 0.25);
    this.rushF.frequency.setTargetAtTime(600 + speedFrac * 2600, t, 0.1); this.rushG.gain.setTargetAtTime(speedFrac * 0.09, t, 0.15);
    if (boost && Math.random() < 0.3) this.noise(0.04, 1800 + Math.random() * 2000, 0.05, 'bandpass');
  }
  // ---------- rival flybys with Doppler shift ----------
  rivals(list, lp, lv) {
    if (!this.ctx || this.muted) return; const c = this.ctx, t = c.currentTime, C = 520;
    const near = list.map(r => ({ r, d: r.pos.dist(lp) })).sort((a, b) => a.d - b.d).slice(0, 3), keep = new Set();
    for (const { r, d } of near) {
      if (d > 220) continue; keep.add(r.id);
      let v = this.voices.get(r.id);
      if (!v) { const o = c.createOscillator(); o.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
        o.connect(f); f.connect(g); g.connect(p); p.connect(this.sfx); o.start(); v = { o, f, g, p }; this.voices.set(r.id, v); }
      const dx = r.pos.x - lp.x, dy = r.pos.y - lp.y, dz = r.pos.z - lp.z, inv = 1 / Math.max(1, d);
      const vr = ((r.vel.x - lv.x) * dx + (r.vel.y - lv.y) * dy + (r.vel.z - lv.z) * dz) * inv, dop = Math.max(0.5, Math.min(2, C / (C + vr)));
      v.o.frequency.setTargetAtTime(170 * dop, t, 0.05); v.f.frequency.setTargetAtTime(700 * dop, t, 0.05);
      v.g.gain.setTargetAtTime(Math.min(0.18, 9 / (d + 8)), t, 0.05); if (v.p.pan) v.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx * inv * 1.2)), t, 0.05);
    }
    for (const [id, v] of this.voices) if (!keep.has(id)) v.g.gain.setTargetAtTime(0, t, 0.1);
  }
  // ---------- one-shots ----------
  tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0, dest, attack = 0.005) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(18, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, freq, vol = 0.3, type = 'lowpass', delay = 0, sweep = 1, dest, q = 0.8) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  ui(kind) { if (!this.ctx || this.muted) return; if (kind === 'move') this.tone(1400, 0.05, 'sine', 0.05, 1, 0, this.uiBus); else { this.tone(880, 0.09, 'triangle', 0.08, 1, 0, this.uiBus); this.tone(1320, 0.14, 'sine', 0.06, 1, 0.05, this.uiBus); } }
  play(name, k = 1, pos) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'count': this.tone(587, 0.32, 'square', 0.08); this.tone(1174, 0.32, 'sine', 0.05); break;
      case 'go': this.tone(880, 0.8, 'square', 0.09); this.tone(1318, 0.8, 'sine', 0.07); this.noise(0.6, 900, 0.12, 'bandpass', 0, 5); break;
      case 'hit': this.noise(0.18 + k * 0.25, 1400, Math.min(0.5, 0.12 + k * 0.35), 'lowpass', 0, 0.25); this.tone(110, 0.28, 'sine', Math.min(0.55, 0.15 + k * 0.4), 0.35); if (k > 0.5) this.duck(0.6, 0.15); break;
      case 'scrape': this.noise(0.16, 2600 + Math.random() * 1500, 0.07 * Math.max(0.4, k), 'bandpass', 0, 0.7, null, 4); break;
      case 'explode': this.noise(1.6, 2200, 0.55 * k, 'lowpass', 0, 0.06); this.tone(62, 1.3, 'sine', 0.6 * k, 0.4); this.tone(140, 0.4, 'triangle', 0.25 * k, 0.3);
        for (let i = 0; i < 6; i++) this.noise(0.06, 3000, 0.1 * k, 'highpass', 0.15 + Math.random() * 0.8); if (k > 0.4) this.duck(0.35, 0.6); break;
      case 'boost': this.noise(0.7, 260, 0.28, 'bandpass', 0, 9, null, 1.2); this.tone(70, 0.6, 'sine', 0.25, 1.6); break;
      case 'pad': this.tone(220, 0.45, 'sawtooth', 0.07, 4.5); this.noise(0.55, 400, 0.22, 'bandpass', 0, 7); break;
      case 'cell': [0, 0.05, 0.1].forEach((d, i) => this.tone(1046 * [1, 1.335, 1.5][i], 0.4, 'sine', 0.07, 1, d)); this.tone(2093, 0.6, 'sine', 0.03, 1, 0.12); break;
      case 'fire': this.tone(1600, 0.3, 'sawtooth', 0.08 * k, 0.12); this.noise(0.25, 5000, 0.07 * k, 'highpass'); break;
      case 'ionHit': for (let i = 0; i < 7; i++) this.noise(0.05, 4000 + Math.random() * 3000, 0.12 * k, 'bandpass', i * 0.06); this.tone(95, 0.6, 'square', 0.08 * k, 0.6); break;
      case 'shield': this.tone(330, 0.7, 'sine', 0.14, 3); this.tone(495, 0.7, 'triangle', 0.06, 3); break;
      case 'checkpoint': this.tone(1318, 0.12, 'triangle', 0.08); this.tone(1760, 0.2, 'sine', 0.07, 1, 0.07); break;
      case 'lap': [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.08, 1, i * 0.07)); break;
      case 'finalLap': [0, 0.18, 0.36].forEach((d, i) => { this.tone([587, 587, 880][i], 0.45, 'sawtooth', 0.06, 1, d); this.tone([294, 294, 440][i], 0.45, 'square', 0.04, 1, d); }); break;
      case 'finish': [587, 740, 880, 1175].forEach((f, i) => this.tone(f, 1.6, 'sawtooth', 0.045, 1, i * 0.04, null, 0.03)); this.noise(2, 6000, 0.1, 'highpass', 0.1, 0.5); break;
      case 'warn': this.tone(880, 0.09, 'square', 0.05); this.tone(660, 0.09, 'square', 0.05, 1, 0.11); break;
    }
  }
  // ---------- adaptive score: D minor, pads + ostinato + bass + drums; intensity follows the race ----------
  music(state) { if (state === 'finish' && this.state !== 'finish') this.finishT = 0; this.state = state; if (state === 'final') this.duck(1, 0); }
  schedule() {
    const c = this.ctx; if (!c) return;
    if (this.muted || this.state === 'off') { this.next = c.currentTime + 0.05; return; }
    const spb = 60 / 116 / 4, prog = [[50, 57, 62, 65, 69], [46, 53, 58, 62, 65], [43, 50, 55, 58, 62], [45, 52, 57, 61, 64]], st = this.state;
    const race = st === 'race' || st === 'final', fin = st === 'final';
    while (this.next < c.currentTime + 0.2) {
      const s = this.step, bar = Math.floor(s / 16) % 4, ch = prog[bar], t = this.next - c.currentTime, beat = s % 16;
      if (beat === 0) for (const n of ch.slice(0, 4)) { this.pad(NOTE(n + 12), spb * 16, t, race ? 0.016 : 0.022); }
      if (st === 'finish') { this.next += spb; this.step++; continue; }
      if (race || s % 2 === 0) { const arp = [0, 2, 3, 4, 3, 2, 1, 2][(s >> (race ? 0 : 1)) % 8], n = ch[arp] + 12 + (fin && s % 8 === 7 ? 12 : 0);
        this.tone(NOTE(n), spb * (race ? 0.9 : 1.6), 'sawtooth', race ? 0.025 : 0.018, 1, t, this.musicBus, 0.004); }
      if (race) {
        if (s % 2 === 0) this.tone(NOTE(ch[0] - 12), spb * 1.8, 'sawtooth', 0.05, 1, t, this.musicBus);
        if (beat % 4 === 0) { this.tone(140, 0.22, 'sine', 0.32, 0.25, t, this.musicBus); }
        if (beat % 4 === 2) this.noise(0.04, 8000, 0.04, 'highpass', t, 1, this.musicBus);
        if (fin && (beat === 4 || beat === 12)) { this.noise(0.18, 1800, 0.13, 'bandpass', t, 1, this.musicBus); this.tone(190, 0.12, 'triangle', 0.12, 0.5, t, this.musicBus); }
        if (fin && beat === 14) this.tone(NOTE(ch[1]), 0.2, 'square', 0.04, 1, t, this.musicBus);
        if (fin && beat === 0 && bar % 2 === 0) for (const n of ch.slice(1, 4)) this.tone(NOTE(n + 12), spb * 6, 'sawtooth', 0.025, 1, t, this.musicBus, 0.02);
      }
      this.next += spb; this.step++;
    }
  }
  pad(freq, dur, delay, vol) {
    const c = this.ctx, t = c.currentTime + delay, f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5); f.frequency.linearRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    for (const d of [-7, 0, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur * 1.1); }
    f.connect(g); g.connect(this.musicBus);
  }
}
