class NormalTheme8Bit {
  constructor(audioCtx, output) {
    this.ctx = audioCtx;
    this.output = output;
    this.timers = [];
    this.playing = false;
    this.duration = 12 * 60 * 1000;
    this.startMs = 0;
    this.step = 0;
    this.onEnd = null;
    this.motifs = [
      [220.00, 261.63, 329.63, 293.66],
      [392.00, 349.23, 329.63, 261.63],
      [293.66, 329.63, 392.00, 440.00],
      [329.63, 293.66, 261.63, 220.00],
      [196.00, 220.00, 246.94, 261.63],
      [261.63, 233.08, 220.00, 196.00]
    ];
  }

  start(onEnd) {
    this.stop();
    this.playing = true;
    this.onEnd = onEnd || null;
    this.startMs = Date.now();
    this.step = 0;
    this.loop();
  }

  stop() {
    this.playing = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  wait(fn, ms) {
    const timer = setTimeout(fn, ms);
    this.timers.push(timer);
  }

  tone(freq, dur, type = "square", vol = 0.1) {
    if (!this.playing || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(this.output);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  noise(dur, vol = 0.05) {
    if (!this.playing || !this.ctx) return;
    const size = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    src.connect(gain);
    gain.connect(this.output);
    src.start();
  }

  getPhase(progress) {
    if (progress < 0.25) return { bpm: 86, intensity: 0.38, name: "calm" };
    if (progress < 0.50) return { bpm: 95, intensity: 0.45, name: "watching" };
    if (progress < 0.75) return { bpm: 115, intensity: 0.65, name: "danger" };
    if (progress < 0.92) return { bpm: 138, intensity: 0.85, name: "panic" };
    return { bpm: 162, intensity: 1.0, name: "apex" };
  }

  loop() {
    if (!this.playing) return;
    const elapsed = Date.now() - this.startMs;
    const progress = elapsed / this.duration;
    if (elapsed >= this.duration) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }
    const phase = this.getPhase(progress);
    const beatMs = 60000 / phase.bpm;
    this.arrangement(phase, beatMs);
    this.step++;
    this.wait(() => this.loop(), beatMs);
  }

  arrangement(phase, beatMs) {
    const motif = this.motifs[Math.floor(this.step / 16) % this.motifs.length];
    const note = motif[this.step % motif.length];
    const intensity = phase.intensity;
    this.bass(note, intensity);
    this.lead(note, motif, intensity, beatMs);
    this.arpeggio(note, motif, intensity, beatMs);
    this.drums(intensity, this.step);
    this.fx(intensity, phase.name);
  }

  bass(note, intensity) {
    const bassNote = note / 2;
    this.tone(bassNote, 0.24, "square", 0.08 + intensity * 0.08);
    if (this.step % 4 === 1) this.tone(bassNote * 0.75, 0.16, "sawtooth", 0.035 + intensity * 0.035);
    if (intensity > 0.55 && this.step % 2 === 0) {
      this.tone(bassNote / 2, 0.14, "sawtooth", 0.04 + intensity * 0.04);
    }
  }

  lead(note, motif, intensity, beatMs) {
    this.tone(note, 0.12, "square", 0.06 + intensity * 0.06);
    if (this.step % 2 === 0) {
      const answer = motif[(this.step + 1) % motif.length] * (this.step % 8 === 0 ? 2 : 1);
      this.wait(() => this.tone(answer, 0.09, "square", 0.035 + intensity * 0.045), beatMs * 0.52);
    }
    if (intensity > 0.45) {
      const harmony = motif[(this.step + 2) % motif.length] * 1.5;
      this.wait(() => this.tone(harmony, 0.08, "square", 0.035 + intensity * 0.03), beatMs * 0.35);
    }
    if (intensity > 0.8) {
      this.wait(() => this.tone(note * 2, 0.06, "square", 0.05), beatMs * 0.65);
    }
  }

  arpeggio(note, motif, intensity, beatMs) {
    const arp = [note, motif[(this.step + 1) % motif.length], note * 1.25, note * 1.5, note * 2];
    const speed = intensity > 0.8 ? 0.1 : 0.16;
    arp.forEach((n, i) => {
      this.wait(() => {
          if (this.playing) this.tone(n, 0.04, "square", 0.018 + intensity * 0.035);
      }, beatMs * speed * i);
    });
  }

  drums(intensity, step) {
    if (step % 4 === 0) this.tone(70, 0.08, "triangle", 0.06 + intensity * 0.08);
    if (step % 4 === 2) this.noise(0.04, 0.035 + intensity * 0.075);
    if (step % 2 === 1 && Math.random() < 0.45 + intensity * 0.3) this.noise(0.012, 0.018 + intensity * 0.035);
    if (intensity > 0.65 && Math.random() < 0.55) this.noise(0.018, 0.03 + intensity * 0.04);
  }

  fx(intensity, phaseName) {
    if (Math.random() < 0.06 + intensity * 0.08) {
      this.tone(600 + Math.random() * 500, 0.18, "sine", 0.018 + intensity * 0.015);
    }
    if (phaseName === "apex" && Math.random() < 0.2) {
      this.tone(90 + Math.random() * 70, 0.35, "sawtooth", 0.07);
    }
    if (intensity > 0.85 && Math.random() < 0.12) this.noise(0.12, 0.12);
  }
}

window.NormalTheme8Bit = NormalTheme8Bit;
