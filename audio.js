// ===== AUDIO ENGINE =====
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.analyser = null;
    this.importedBuffers = {}; // name -> AudioBuffer
    this.init();
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.compressor = this.ctx.createDynamicsCompressor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    } catch(e) {
      console.error('AudioContext failed:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  getFreqForNote(noteStr) {
    const noteMap = {
      'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
      'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11
    };
    const match = noteStr.match(/^([A-G]#?)(\d)$/);
    if (!match) return 440;
    const semi = noteMap[match[1]];
    const oct = parseInt(match[2]);
    return 440 * Math.pow(2, (semi + (oct - 4) * 12 - 9) / 12);
  }

  playKick(time, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(this.masterGain);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time); osc.stop(time + 0.5);
  }

  playSnare(time, vol = 1) {
    const ctx = this.ctx;
    // Noise burst
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 3000;
    const noiseEnv = ctx.createGain();
    noise.connect(noiseFilter); noiseFilter.connect(noiseEnv); noiseEnv.connect(this.masterGain);
    noiseEnv.gain.setValueAtTime(vol * 0.8, time);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.start(time); noise.stop(time + 0.2);
    // Tone
    const osc = ctx.createOscillator();
    const oscEnv = ctx.createGain();
    osc.connect(oscEnv); oscEnv.connect(this.masterGain);
    osc.frequency.value = 180;
    oscEnv.gain.setValueAtTime(vol * 0.5, time);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.start(time); osc.stop(time + 0.15);
  }

  playHiHatClosed(time, vol = 1) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 10000;
    const env = ctx.createGain();
    noise.connect(filter); filter.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol * 0.4, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    noise.start(time); noise.stop(time + 0.06);
  }

  playHiHatOpen(time, vol = 1) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 8000;
    const env = ctx.createGain();
    noise.connect(filter); filter.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol * 0.35, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    noise.start(time); noise.stop(time + 0.4);
  }

  playClap(time, vol = 1) {
    const ctx = this.ctx;
    [0, 0.01, 0.02].forEach(offset => {
      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.5;
      const env = ctx.createGain();
      noise.connect(filter); filter.connect(env); env.connect(this.masterGain);
      env.gain.setValueAtTime(vol * 0.6, time + offset);
      env.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.1);
      noise.start(time + offset); noise.stop(time + offset + 0.1);
    });
  }

  playTom(time, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(this.masterGain);
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.3);
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.start(time); osc.stop(time + 0.3);
  }

  playCymbal(time, vol = 1) {
    const ctx = this.ctx;
    const bufferSize = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 7000; filter.Q.value = 0.3;
    const env = ctx.createGain();
    noise.connect(filter); filter.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol * 0.5, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 1.0);
    noise.start(time); noise.stop(time + 1.0);
  }

  playBass(time, freq, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    osc2.type = 'square'; osc2.frequency.value = freq;
    const g1 = ctx.createGain(); g1.gain.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    osc.connect(g1); osc2.connect(g2);
    g1.connect(filter); g2.connect(filter);
    filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 2;
    filter.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol * 0.8, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.start(time); osc.stop(time + 0.4);
    osc2.start(time); osc2.stop(time + 0.4);
  }

  playLead(time, freq, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    osc2.type = 'sawtooth'; osc2.frequency.value = freq * 1.005; // slight detune
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    osc.connect(g1); osc2.connect(g2);
    g1.connect(env); g2.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol * 0.6, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.start(time); osc.stop(time + 0.35);
    osc2.start(time); osc2.stop(time + 0.35);
  }

  playPad(time, freq, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    osc2.type = 'sine'; osc2.frequency.value = freq * 2;
    const g1 = ctx.createGain(); g1.gain.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    osc.connect(g1); osc2.connect(g2);
    filter.type = 'lowpass'; filter.frequency.value = 1200;
    g1.connect(filter); g2.connect(filter);
    filter.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol * 0.5, time + 0.1);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
    osc.start(time); osc.stop(time + 0.8);
    osc2.start(time); osc2.stop(time + 0.8);
  }

  playPiano(time, freq, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = freq;
    osc2.type = 'sine'; osc2.frequency.value = freq * 2;
    const g1 = ctx.createGain(); g1.gain.value = 0.7;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    osc.connect(g1); osc2.connect(g2);
    g1.connect(env); g2.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol, time);
    env.gain.setValueAtTime(vol * 0.8, time + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
    osc.start(time); osc.stop(time + 0.6);
    osc2.start(time); osc2.stop(time + 0.6);
  }

  playPluck(time, freq, vol = 1) {
    const ctx = this.ctx;
    // Karplus-Strong approximation
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    osc.connect(env); env.connect(this.masterGain);
    env.gain.setValueAtTime(vol * 0.7, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.start(time); osc.stop(time + 0.3);
  }

  playImported(time, name, vol = 1) {
    if (!this.importedBuffers[name]) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.importedBuffers[name];
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = vol;
    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    source.start(time);
  }

  playInstrument(type, time, freq = 440, vol = 1, importName = null) {
    this.resume();
    if (type === 'imported' && importName) {
      this.playImported(time, importName, vol);
      return;
    }
    switch(type) {
      case 'kick': this.playKick(time, vol); break;
      case 'snare': this.playSnare(time, vol); break;
      case 'hihat_closed': this.playHiHatClosed(time, vol); break;
      case 'hihat_open': this.playHiHatOpen(time, vol); break;
      case 'clap': this.playClap(time, vol); break;
      case 'tom': this.playTom(time, vol); break;
      case 'cymbal': this.playCymbal(time, vol); break;
      case 'bass': this.playBass(time, freq, vol); break;
      case 'lead': this.playLead(time, freq, vol); break;
      case 'pad': this.playPad(time, freq, vol); break;
      case 'piano': this.playPiano(time, freq, vol); break;
      case 'pluck': this.playPluck(time, freq, vol); break;
    }
  }

  async importAudio(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = await this.ctx.decodeAudioData(e.target.result);
          this.importedBuffers[file.name] = buffer;
          resolve(file.name);
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  getAnalyserData() {
    if (!this.analyser) return new Uint8Array(128);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  async exportToMP3(channels, patterns, patternTimeline, bpm, totalBars, songName) {
    // Render to offline context
    const secondsPerBeat = 60 / bpm;
    const secondsPerBar = secondsPerBeat * 4;
    const totalSeconds = totalBars * secondsPerBar + 2;

    const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalSeconds * 44100), 44100);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(offlineCtx.destination);

    const scheduleNote = (type, startTime, freq, vol, importName) => {
      const scheduleInOffline = (t) => {
        if (type === 'imported' && importName && this.importedBuffers[importName]) {
          const source = offlineCtx.createBufferSource();
          source.buffer = this.importedBuffers[importName];
          const g = offlineCtx.createGain(); g.gain.value = vol;
          source.connect(g); g.connect(masterGain);
          source.start(t);
          return;
        }
        // Inline synths for offline rendering
        const makeOsc = (type2, freq2) => { const o = offlineCtx.createOscillator(); o.type = type2; o.frequency.value = freq2; return o; };
        const makeGain = (v) => { const g = offlineCtx.createGain(); g.gain.value = v; return g; };

        switch(type) {
          case 'kick': {
            const osc = makeOsc('sine', 150); const env = offlineCtx.createGain();
            osc.connect(env); env.connect(masterGain);
            osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.5);
            env.gain.setValueAtTime(vol, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.start(t); osc.stop(t + 0.5); break;
          }
          case 'snare': {
            const bufSz = offlineCtx.sampleRate * 0.2;
            const buf = offlineCtx.createBuffer(1, bufSz, offlineCtx.sampleRate);
            const d = buf.getChannelData(0);
            for(let i=0;i<bufSz;i++) d[i] = Math.random()*2-1;
            const n = offlineCtx.createBufferSource(); n.buffer = buf;
            const f = offlineCtx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=3000;
            const env = offlineCtx.createGain();
            n.connect(f); f.connect(env); env.connect(masterGain);
            env.gain.setValueAtTime(vol*0.8,t); env.gain.exponentialRampToValueAtTime(0.001,t+0.2);
            n.start(t); n.stop(t+0.2); break;
          }
          case 'hihat_closed': case 'hihat_open': {
            const dur = type==='hihat_closed' ? 0.06 : 0.4;
            const bufSz = offlineCtx.sampleRate*dur;
            const buf = offlineCtx.createBuffer(1,bufSz,offlineCtx.sampleRate);
            const d = buf.getChannelData(0);
            for(let i=0;i<bufSz;i++) d[i]=Math.random()*2-1;
            const n = offlineCtx.createBufferSource(); n.buffer=buf;
            const f = offlineCtx.createBiquadFilter(); f.type='highpass'; f.frequency.value=9000;
            const env = offlineCtx.createGain();
            n.connect(f); f.connect(env); env.connect(masterGain);
            env.gain.setValueAtTime(vol*0.4,t); env.gain.exponentialRampToValueAtTime(0.001,t+dur);
            n.start(t); n.stop(t+dur); break;
          }
          case 'clap': {
            [0,0.01,0.02].forEach(off => {
              const bufSz=offlineCtx.sampleRate*0.1;
              const buf=offlineCtx.createBuffer(1,bufSz,offlineCtx.sampleRate);
              const d=buf.getChannelData(0); for(let i=0;i<bufSz;i++) d[i]=Math.random()*2-1;
              const n=offlineCtx.createBufferSource(); n.buffer=buf;
              const fl=offlineCtx.createBiquadFilter(); fl.type='bandpass'; fl.frequency.value=1800;
              const env=offlineCtx.createGain();
              n.connect(fl); fl.connect(env); env.connect(masterGain);
              env.gain.setValueAtTime(vol*0.6,t+off); env.gain.exponentialRampToValueAtTime(0.001,t+off+0.1);
              n.start(t+off); n.stop(t+off+0.1);
            }); break;
          }
          case 'tom': {
            const osc=makeOsc('sine',200); const env=offlineCtx.createGain();
            osc.connect(env); env.connect(masterGain);
            osc.frequency.setValueAtTime(200,t); osc.frequency.exponentialRampToValueAtTime(60,t+0.3);
            env.gain.setValueAtTime(vol,t); env.gain.exponentialRampToValueAtTime(0.001,t+0.3);
            osc.start(t); osc.stop(t+0.3); break;
          }
          default: {
            const osc=makeOsc('sawtooth',freq); const env=offlineCtx.createGain();
            osc.connect(env); env.connect(masterGain);
            env.gain.setValueAtTime(vol*0.5,t); env.gain.exponentialRampToValueAtTime(0.001,t+0.3);
            osc.start(t); osc.stop(t+0.3);
          }
        }
      };
      scheduleInOffline(startTime);
    };

    // Schedule all events
    channels.forEach(ch => {
      const chPatterns = patternTimeline[ch.id] || {};
      Object.entries(chPatterns).forEach(([bar, patternId]) => {
        const pattern = patterns[patternId];
        if (!pattern || !pattern.steps[ch.id]) return;
        const steps = pattern.steps[ch.id];
        const stepsPerBar = steps.length;
        const stepDuration = secondsPerBar / stepsPerBar;
        steps.forEach((active, stepIdx) => {
          if (!active) return;
          const t = bar * secondsPerBar + stepIdx * stepDuration;
          const freq = ch.noteFreq || 440;
          scheduleNote(ch.type, t, freq, ch.volume || 1, ch.importName);
        });
      });
    });

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
  }
}

window.AudioEngine = AudioEngine;
