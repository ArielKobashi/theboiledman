class BloodMoonTheme8Bit {
  constructor(audioCtx, output) {
    this.ctx = audioCtx;
    this.output = output;
    this.timers = [];
    this.playing = false;
    this.duration = 60 * 1000;
    this.startMs = 0;
    this.step = 0;
    this.onEnd = null;
    this.motifs = [
      [110.00, 116.54, 130.81, 146.83],
      [220.00, 233.08, 261.63, 293.66],
      [392.00, 349.23, 311.13, 293.66],
      [466.16, 440.00, 392.00, 349.23],
      [55.00, 58.27, 65.41, 73.42]
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

  tone(freq, dur, type = "square", vol = 0.15) {
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

  noise(dur, vol = 0.12) {
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

  loop() {
    if (!this.playing) return;
    const elapsed = Date.now() - this.startMs;
    if (elapsed >= this.duration) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }
    this.arrangement();
    this.step++;
    this.wait(() => this.loop(), 60000 / 180 / 2);
  }

  arrangement() {
    const motif = this.motifs[Math.floor(this.step / 8) % this.motifs.length];
    const note = motif[this.step % motif.length];
    this.bass(note);
    this.lead(note, motif);
    this.chaosArp(note, motif);
    this.ostinato(note, motif);
    this.drums();
    this.screams();
  }

  bass(note) {
    this.tone(note / 2, 0.09, "square", 0.22);
    if (this.step % 2 === 0) this.tone(note / 4, 0.16, "sawtooth", 0.16);
  }

  lead(note, motif) {
    this.tone(note, 0.06, "square", 0.18);
    this.tone(note * 2, 0.045, "square", 0.10);
    const answer = motif[(this.step + 3) % motif.length] * (this.step % 4 === 0 ? 2 : 1.5);
    this.wait(() => this.tone(answer, 0.055, "square", 0.12), 72);
    this.wait(() => this.tone(note * 1.06, 0.035, "square", 0.075), 126);
    if (Math.random() < 0.5) {
      const dissonant = motif[(this.step + 1) % motif.length] * 1.06;
      this.tone(dissonant, 0.035, "square", 0.09);
    }
  }

  chaosArp(note, motif) {
    const arp = [note, note * 1.06, note * 1.5, note * 2, motif[(this.step + 2) % motif.length] * 2];
    arp.forEach((n, i) => {
      this.wait(() => {
        if (this.playing) this.tone(n, 0.025, "square", 0.065);
      }, i * 24);
    });
  }

  ostinato(note, motif) {
    const pattern = [
      note / 2,
      motif[(this.step + 1) % motif.length] / 2,
      note * 1.5,
      motif[(this.step + 2) % motif.length]
    ];
    pattern.forEach((n, i) => {
      this.wait(() => {
        if (this.playing) this.tone(n, 0.03, "square", 0.055);
      }, i * 42);
    });
  }

  drums() {
    this.noise(0.035, 0.20);
    if (this.step % 2 === 0) this.tone(55 + Math.random() * 35, 0.07, "triangle", 0.17);
    if (Math.random() < 0.65) this.noise(0.07, 0.22);
    this.wait(() => this.noise(0.018, 0.11), 82);
    this.wait(() => this.tone(92, 0.035, "triangle", 0.08), 124);
  }

  screams() {
    if (Math.random() < 0.28) this.tone(850 + Math.random() * 900, 0.035, "square", 0.10);
    if (Math.random() < 0.22) this.tone(110 + Math.random() * 90, 0.35, "sawtooth", 0.12);
    if (Math.random() < 0.15) this.noise(0.16, 0.18);
  }
}

window.BloodMoonTheme8Bit = BloodMoonTheme8Bit;
