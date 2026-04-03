// ===== FL STUDIO CLONE - MAIN APP =====
let engine;
let INSTRUMENTS = [];
let NOTE_FREQS = {};
let songName = 'Untitled Song';

// State
let state = {
  bpm: 128,
  playing: false,
  currentBeat: 0,
  currentBar: 0,
  totalBars: 16,
  stepCount: 16,
  channels: [],
  patterns: {},      // id -> { name, steps: { channelId: bool[] } }
  timeline: {},      // channelId -> { barIndex: patternId }
  activePattern: null,
  selectedChannel: null,
  schedulerTimer: null,
  nextBeatTime: 0,
  lookahead: 0.1,
  scheduleAhead: 0.2,
  vuData: new Float32Array(8).fill(0),
};

let nextPatternId = 1;
function genPatternId() { return 'p' + (nextPatternId++); }
let nextChannelId = 1;
function genChannelId() { return 'ch' + (nextChannelId++); }

// ===== LOAD CONFIG =====
async function loadConfig() {
  try {
    const resp = await fetch('data/instruments.json');
    const data = await resp.json();
    INSTRUMENTS = data.instruments;
    NOTE_FREQS = data.noteFreqs;
  } catch(e) {
    // Fallback
    INSTRUMENTS = [
      { id:'kick', name:'Kick', color:'#e74c3c', category:'drums', freq:60, type:'kick' },
      { id:'snare', name:'Snare', color:'#e67e22', category:'drums', freq:200, type:'snare' },
      { id:'hihat_c', name:'Hi-Hat C', color:'#f1c40f', category:'drums', freq:8000, type:'hihat_closed' },
      { id:'hihat_o', name:'Hi-Hat O', color:'#2ecc71', category:'drums', freq:6000, type:'hihat_open' },
      { id:'clap', name:'Clap', color:'#1abc9c', category:'drums', freq:1000, type:'clap' },
      { id:'bass', name:'Bass', color:'#3498db', category:'synth', freq:80, type:'bass' },
      { id:'lead', name:'Lead', color:'#9b59b6', category:'synth', freq:440, type:'lead' },
      { id:'piano', name:'Piano', color:'#e74c3c', category:'keys', freq:261, type:'piano' },
    ];
    NOTE_FREQS = { 'C4':261.63,'D4':293.66,'E4':329.63,'F4':349.23,'G4':392,'A4':440,'B4':493.88 };
  }
}

// ===== INIT =====
async function init() {
  await loadConfig();
  engine = new AudioEngine();

  // Create default pattern
  const pid = genPatternId();
  state.patterns[pid] = { name: 'Pattern 1', steps: {} };
  state.activePattern = pid;

  // Default channels
  const defaults = ['kick','snare','hihat_c','hihat_o','clap','bass','lead'];
  defaults.forEach(instId => {
    const inst = INSTRUMENTS.find(i => i.id === instId);
    if (inst) addChannel(inst, false);
  });

  renderAll();
  startVUMeter();
  notify('FL Studio Clone loaded! 🎹', 'success');
}

// ===== CHANNEL MANAGEMENT =====
function addChannel(inst, rerender = true) {
  const id = genChannelId();
  const ch = {
    id,
    name: inst.name,
    color: inst.color,
    type: inst.type,
    noteFreq: inst.freq || 440,
    volume: 0.8,
    muted: false,
    soloed: false,
    importName: null,
  };
  state.channels.push(ch);

  // Add to all patterns
  Object.values(state.patterns).forEach(pat => {
    pat.steps[id] = new Array(state.stepCount).fill(false);
  });
  if (!state.selectedChannel) state.selectedChannel = id;
  if (rerender) renderAll();
  return ch;
}

function removeChannel(id) {
  state.channels = state.channels.filter(c => c.id !== id);
  Object.values(state.patterns).forEach(pat => { delete pat.steps[id]; });
  delete state.timeline[id];
  if (state.selectedChannel === id) state.selectedChannel = state.channels[0]?.id || null;
  renderAll();
}

function getChannel(id) { return state.channels.find(c => c.id === id); }

// ===== PATTERN MANAGEMENT =====
function addPattern() {
  const pid = genPatternId();
  const n = Object.keys(state.patterns).length + 1;
  state.patterns[pid] = { name: `Pattern ${n}`, steps: {} };
  state.channels.forEach(ch => {
    state.patterns[pid].steps[ch.id] = new Array(state.stepCount).fill(false);
  });
  state.activePattern = pid;
  renderAll();
  return pid;
}

function deletePattern(pid) {
  if (Object.keys(state.patterns).length <= 1) { notify('Need at least one pattern', 'warn'); return; }
  delete state.patterns[pid];
  // Remove from timeline
  Object.values(state.timeline).forEach(barMap => {
    Object.entries(barMap).forEach(([bar, p]) => { if (p === pid) delete barMap[bar]; });
  });
  if (state.activePattern === pid) {
    state.activePattern = Object.keys(state.patterns)[0];
  }
  renderAll();
}

// ===== SEQUENCER STEP TOGGLE =====
function toggleStep(channelId, stepIdx) {
  const pat = state.patterns[state.activePattern];
  if (!pat || !pat.steps[channelId]) return;
  pat.steps[channelId][stepIdx] = !pat.steps[channelId][stepIdx];
  updateStepBtn(channelId, stepIdx);
}

function updateStepBtn(channelId, stepIdx) {
  const btn = document.querySelector(`[data-channel="${channelId}"][data-step="${stepIdx}"]`);
  if (!btn) return;
  const pat = state.patterns[state.activePattern];
  const active = pat?.steps[channelId]?.[stepIdx];
  btn.classList.toggle('active', !!active);
  const ch = getChannel(channelId);
  if (ch) btn.style.setProperty('--ch-color', ch.color);
}

// ===== PLAYBACK =====
function startPlayback() {
  engine.resume();
  state.playing = true;
  state.nextBeatTime = engine.ctx.currentTime + 0.05;
  state.currentBeat = 0;
  state.currentBar = 0;
  document.querySelector('.transport-btn.play').classList.add('active');
  scheduleLoop();
}

function stopPlayback() {
  state.playing = false;
  state.currentBeat = 0;
  state.currentBar = 0;
  document.querySelector('.transport-btn.play').classList.remove('active');
  clearTimeout(state.schedulerTimer);
  updatePlayhead(0);
  clearBeatHighlights();
}

function scheduleLoop() {
  if (!state.playing) return;
  const secondsPerBeat = 60 / state.bpm;
  const secondsPerStep = secondsPerBeat / 4; // 16 steps = 4 beats = 1 bar
  const stepsPerBar = state.stepCount;

  while (state.nextBeatTime < engine.ctx.currentTime + state.scheduleAhead) {
    const stepIdx = state.currentBeat % stepsPerBar;
    const barIdx = Math.floor(state.currentBeat / stepsPerBar) % state.totalBars;

    scheduleStep(stepIdx, barIdx, state.nextBeatTime);

    const displayBeat = state.currentBeat;
    const beatTime = state.nextBeatTime;
    ((db, bt) => {
      const delay = (bt - engine.ctx.currentTime) * 1000;
      setTimeout(() => {
        if (!state.playing) return;
        highlightBeat(db % stepsPerBar);
        updatePlayhead(Math.floor(db / stepsPerBar) % state.totalBars, (db % stepsPerBar) / stepsPerBar);
      }, Math.max(0, delay));
    })(displayBeat, beatTime);

    state.nextBeatTime += secondsPerStep;
    state.currentBeat++;
    if (state.currentBeat >= stepsPerBar * state.totalBars) {
      state.currentBeat = 0;
    }
  }

  state.schedulerTimer = setTimeout(() => scheduleLoop(), state.lookahead * 1000);
}

function scheduleStep(stepIdx, barIdx, time) {
  state.channels.forEach(ch => {
    if (ch.muted) return;
    // Check if any solo'd
    const hasSolo = state.channels.some(c => c.soloed);
    if (hasSolo && !ch.soloed) return;

    // Find pattern for this bar
    const chTimeline = state.timeline[ch.id] || {};
    let patternId = chTimeline[barIdx];
    // If no timeline assignment, use active pattern
    if (!patternId) patternId = state.activePattern;

    const pat = state.patterns[patternId];
    if (!pat || !pat.steps[ch.id]) return;
    if (stepIdx >= pat.steps[ch.id].length) return;
    if (!pat.steps[ch.id][stepIdx]) return;

    engine.playInstrument(ch.type, time, ch.noteFreq, ch.volume, ch.importName);
  });
}

function highlightBeat(stepIdx) {
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.classList.remove('playing');
    if (parseInt(btn.dataset.step) === stepIdx) {
      btn.classList.add('playing');
    }
  });
}

function clearBeatHighlights() {
  document.querySelectorAll('.step-btn.playing').forEach(b => b.classList.remove('playing'));
}

function updatePlayhead(barIdx, fraction = 0) {
  const ph = document.getElementById('playhead');
  if (!ph) return;
  const cellWidth = 80;
  const labelWidth = 90;
  ph.style.left = (labelWidth + barIdx * cellWidth + fraction * cellWidth) + 'px';
}

// ===== VU METER =====
function startVUMeter() {
  const bars = document.querySelectorAll('.vu-fill');
  function update() {
    const data = engine.getAnalyserData();
    bars.forEach((bar, i) => {
      const idx = Math.floor(i * data.length / bars.length);
      const val = (data[idx] / 255) * 100;
      bar.style.height = val + '%';
    });
    requestAnimationFrame(update);
  }
  update();
}

// ===== STEP COUNT CHANGE =====
function setStepCount(n) {
  state.stepCount = n;
  Object.values(state.patterns).forEach(pat => {
    state.channels.forEach(ch => {
      const old = pat.steps[ch.id] || [];
      const newSteps = new Array(n).fill(false);
      for (let i = 0; i < Math.min(old.length, n); i++) newSteps[i] = old[i];
      pat.steps[ch.id] = newSteps;
    });
  });
  renderSequencer();
  document.querySelectorAll('.step-count-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.count) === n);
  });
}

// ===== PIANO ROLL / PREVIEW NOTE =====
function previewNote(ch, noteStr) {
  engine.resume();
  const freq = NOTE_FREQS[noteStr] || 440;
  const t = engine.ctx.currentTime;
  engine.playInstrument(ch.type, t, freq, ch.volume || 0.8);
  // Assign this freq to channel
  ch.noteFreq = freq;
  notify(`${ch.name} → ${noteStr} (${freq.toFixed(1)}Hz)`, 'info');
}

// ===== IMPORT AUDIO =====
async function importAudio(file) {
  try {
    engine.resume();
    const name = await engine.importAudio(file);
    // Create a channel for it
    const ch = {
      id: genChannelId(),
      name: file.name.replace('.mp3','').replace('.wav','').slice(0,14),
      color: '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'),
      type: 'imported',
      noteFreq: 440,
      volume: 0.8,
      muted: false,
      soloed: false,
      importName: name,
    };
    state.channels.push(ch);
    Object.values(state.patterns).forEach(pat => {
      pat.steps[ch.id] = new Array(state.stepCount).fill(false);
    });
    renderAll();
    notify(`Imported: ${file.name}`, 'success');
  } catch(e) {
    notify('Failed to import audio', 'error');
  }
}

// ===== EXPORT =====
async function exportSong() {
  const modal = document.getElementById('export-modal');
  modal.classList.remove('hidden');
}

async function doExport() {
  const modal = document.getElementById('export-modal');
  modal.classList.add('hidden');
  const progressModal = document.getElementById('progress-modal');
  progressModal.classList.remove('hidden');
  const progressBar = progressModal.querySelector('.progress-bar-inner');
  const progressText = progressModal.querySelector('.progress-text');

  try {
    progressText.textContent = 'Rendering audio...';
    progressBar.style.width = '20%';

    // Build full timeline
    const fullTimeline = {};
    state.channels.forEach(ch => {
      fullTimeline[ch.id] = {};
      for (let bar = 0; bar < state.totalBars; bar++) {
        const assigned = state.timeline[ch.id]?.[bar];
        fullTimeline[ch.id][bar] = assigned || state.activePattern;
      }
    });

    progressBar.style.width = '40%';
    progressText.textContent = 'Mixing down...';

    const audioBuffer = await engine.exportToMP3(
      state.channels, state.patterns, fullTimeline, state.bpm, state.totalBars, songName
    );

    progressBar.style.width = '80%';
    progressText.textContent = 'Encoding WAV...';

    await new Promise(r => setTimeout(r, 200));
    exportWAV(audioBuffer, songName);

    progressBar.style.width = '100%';
    progressText.textContent = 'Done!';
    await new Promise(r => setTimeout(r, 800));
    progressModal.classList.add('hidden');
    notify(`"${songName}" exported as WAV!`, 'success');
  } catch(e) {
    progressModal.classList.add('hidden');
    notify('Export failed: ' + e.message, 'error');
  }
}

// ===== SAVE/LOAD PROJECT =====
function saveProject() {
  const data = {
    songName,
    bpm: state.bpm,
    totalBars: state.totalBars,
    stepCount: state.stepCount,
    channels: state.channels,
    patterns: state.patterns,
    timeline: state.timeline,
    activePattern: state.activePattern,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = songName + '.daw.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notify('Project saved!', 'success');
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      songName = data.songName || 'Untitled';
      state.bpm = data.bpm || 128;
      state.totalBars = data.totalBars || 16;
      state.stepCount = data.stepCount || 16;
      state.channels = data.channels || [];
      state.patterns = data.patterns || {};
      state.timeline = data.timeline || {};
      state.activePattern = data.activePattern;
      nextChannelId = Math.max(...state.channels.map(c => parseInt(c.id.replace('ch','')) || 0)) + 1;
      nextPatternId = Math.max(...Object.keys(state.patterns).map(p => parseInt(p.replace('p','')) || 0)) + 1;
      document.getElementById('song-name').textContent = songName;
      renderAll();
      notify('Project loaded: ' + songName, 'success');
    } catch(e2) {
      notify('Failed to load project', 'error');
    }
  };
  reader.readAsText(file);
}

// ===== NOTIFICATIONS =====
function notify(msg, type = 'info') {
  const container = document.getElementById('notifications');
  const el = document.createElement('div');
  el.className = 'notif ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ===== BPM CONTROL =====
function setBPM(val) {
  state.bpm = Math.max(40, Math.min(300, val));
  document.getElementById('bpm-value').textContent = state.bpm;
}

// ===== TIMELINE TOGGLE =====
function toggleTimelineCell(channelId, barIdx) {
  if (!state.timeline[channelId]) state.timeline[channelId] = {};
  const current = state.timeline[channelId][barIdx];
  if (current) {
    delete state.timeline[channelId][barIdx];
  } else {
    state.timeline[channelId][barIdx] = state.activePattern;
  }
  renderTimeline();
}

// ===== RENDER =====
function renderAll() {
  renderChannelList();
  renderPatternTabs();
  renderSequencer();
  renderPianoKeys();
  renderTimeline();
}

function renderChannelList() {
  const list = document.getElementById('channel-list');
  list.innerHTML = '';
  state.channels.forEach(ch => {
    const div = document.createElement('div');
    div.className = 'channel-item' + (state.selectedChannel === ch.id ? ' selected' : '');
    div.onclick = () => { state.selectedChannel = ch.id; renderChannelList(); renderPianoKeys(); };
    div.innerHTML = `
      <div class="ch-color" style="background:${ch.color}"></div>
      <div class="ch-name" title="${ch.name}">${ch.name}</div>
      <div class="ch-mute ${ch.muted ? 'active' : ''}" title="Mute" onclick="event.stopPropagation();ch_mute('${ch.id}')">M</div>
      <div class="ch-solo ${ch.soloed ? 'active' : ''}" title="Solo" onclick="event.stopPropagation();ch_solo('${ch.id}')">S</div>
      <div class="ch-vol" title="Volume" onclick="event.stopPropagation()">
        <div class="ch-vol-fill" style="width:${ch.volume*100}%;background:${ch.color}"></div>
      </div>
    `;
    // Volume drag
    const volEl = div.querySelector('.ch-vol');
    let dragging = false;
    volEl.addEventListener('mousedown', (e) => {
      dragging = true;
      updateVol(e, ch, volEl);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => { if (dragging) updateVol(e, ch, volEl); });
    document.addEventListener('mouseup', () => { dragging = false; });
    function updateVol(e, ch, el) {
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      ch.volume = pct;
      el.querySelector('.ch-vol-fill').style.width = (pct * 100) + '%';
    }
    list.appendChild(div);
  });
}

window.ch_mute = (id) => {
  const ch = getChannel(id); if (!ch) return;
  ch.muted = !ch.muted;
  renderChannelList();
};
window.ch_solo = (id) => {
  const ch = getChannel(id); if (!ch) return;
  ch.soloed = !ch.soloed;
  renderChannelList();
};

function renderPatternTabs() {
  const tabs = document.getElementById('pattern-tabs');
  tabs.innerHTML = '';
  Object.entries(state.patterns).forEach(([pid, pat]) => {
    const tab = document.createElement('div');
    tab.className = 'pattern-tab' + (pid === state.activePattern ? ' active' : '');
    tab.innerHTML = `${pat.name} <span class="tab-x" data-pid="${pid}" onclick="event.stopPropagation();deletePattern('${pid}')">✕</span>`;
    tab.onclick = () => { state.activePattern = pid; renderAll(); };
    tabs.appendChild(tab);
  });
  const addBtn = document.createElement('button');
  addBtn.id = 'new-pattern-btn';
  addBtn.textContent = '+';
  addBtn.onclick = addPattern;
  tabs.appendChild(addBtn);
}

function renderSequencer() {
  const grid = document.getElementById('seq-grid');
  grid.innerHTML = '';
  const pat = state.patterns[state.activePattern];
  if (!pat) return;
  const n = state.stepCount;

  // Header
  const header = document.createElement('div');
  header.className = 'seq-header';
  const hLabel = document.createElement('div');
  hLabel.className = 'seq-header-label';
  header.appendChild(hLabel);
  for (let g = 0; g < n / 4; g++) {
    const grp = document.createElement('div');
    grp.className = 'step-group-num';
    for (let s = 0; s < 4; s++) {
      const num = document.createElement('div');
      num.className = 'step-num';
      num.textContent = g * 4 + s + 1;
      grp.appendChild(num);
    }
    header.appendChild(grp);
  }
  grid.appendChild(header);

  // Rows
  state.channels.forEach(ch => {
    const row = document.createElement('div');
    row.className = 'seq-row';
    const label = document.createElement('div');
    label.className = 'seq-row-label';
    label.innerHTML = `<span class="row-color" style="background:${ch.color}"></span>${ch.name}`;
    row.appendChild(label);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'seq-steps';

    for (let g = 0; g < n / 4; g++) {
      const grp = document.createElement('div');
      grp.className = 'seq-group';
      for (let s = 0; s < 4; s++) {
        const idx = g * 4 + s;
        const btn = document.createElement('div');
        btn.className = 'step-btn' + (pat.steps[ch.id]?.[idx] ? ' active' : '');
        btn.dataset.channel = ch.id;
        btn.dataset.step = idx;
        btn.style.setProperty('--ch-color', ch.color);

        let mousedown = false;
        let toggleVal = null;
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          engine.resume();
          mousedown = true;
          toggleVal = !pat.steps[ch.id]?.[idx];
          toggleStep(ch.id, idx);
          if (toggleVal) engine.playInstrument(ch.type, engine.ctx.currentTime, ch.noteFreq, ch.volume * 0.7, ch.importName);
        });
        btn.addEventListener('mouseenter', () => {
          if (mousedown && toggleVal !== null) {
            pat.steps[ch.id][idx] = toggleVal;
            updateStepBtn(ch.id, idx);
          }
        });
        document.addEventListener('mouseup', () => { mousedown = false; toggleVal = null; });

        grp.appendChild(btn);
      }
      stepsContainer.appendChild(grp);
    }
    row.appendChild(stepsContainer);
    grid.appendChild(row);
  });
}

function renderPianoKeys() {
  const container = document.getElementById('piano-keys');
  container.innerHTML = '';
  const ch = getChannel(state.selectedChannel);
  if (!ch || ['kick','snare','hihat_closed','hihat_open','clap','tom','cymbal'].includes(ch.type)) {
    container.innerHTML = '<div style="padding:16px;font-size:11px;color:var(--text-dim);text-align:center">Select a melodic<br>instrument to use<br>the piano roll</div>';
    return;
  }

  const octaves = [3,4,5];
  const notes = ['B','A#','A','G#','G','F#','F','E','D#','D','C#','C'];
  octaves.forEach(oct => {
    notes.forEach(note => {
      const noteStr = note + oct;
      const isBlack = note.includes('#');
      const row = document.createElement('div');
      row.className = 'piano-key-row';
      const key = document.createElement('div');
      key.className = 'piano-key ' + (isBlack ? 'black-key' : 'white-key');
      key.innerHTML = `<span>${noteStr}</span>`;
      key.addEventListener('mousedown', () => {
        key.classList.add('pressed');
        previewNote(ch, noteStr);
      });
      key.addEventListener('mouseup', () => key.classList.remove('pressed'));
      key.addEventListener('mouseleave', () => key.classList.remove('pressed'));
      row.appendChild(key);
      container.appendChild(row);
    });
  });
}

function renderTimeline() {
  const rows = document.getElementById('timeline-rows');
  const ruler = document.getElementById('timeline-ruler');
  rows.innerHTML = '';
  ruler.innerHTML = '';

  // Ruler
  for (let bar = 0; bar < state.totalBars; bar++) {
    const mark = document.createElement('div');
    mark.className = 'ruler-mark';
    mark.textContent = 'BAR ' + (bar + 1);
    ruler.appendChild(mark);
  }

  state.channels.forEach(ch => {
    const row = document.createElement('div');
    row.className = 'timeline-row';
    const label = document.createElement('div');
    label.className = 'timeline-label';
    label.title = ch.name;
    label.innerHTML = `<span style="color:${ch.color}">▋</span> ${ch.name}`;
    row.appendChild(label);

    for (let bar = 0; bar < state.totalBars; bar++) {
      const cell = document.createElement('div');
      cell.className = 'timeline-cell';
      const isOn = state.timeline[ch.id]?.[bar];
      if (isOn) {
        cell.classList.add('filled');
        cell.style.setProperty('--ch-color', ch.color);
        cell.textContent = '▬';
      }
      cell.onclick = () => toggleTimelineCell(ch.id, bar);
      row.appendChild(cell);
    }
    rows.appendChild(row);
  });
}

// ===== EXPAND BARS =====
function addBars(n) {
  state.totalBars = Math.min(256, state.totalBars + n);
  renderTimeline();
  notify(`Song length: ${state.totalBars} bars`, 'info');
}

// ===== DOM READY =====
document.addEventListener('DOMContentLoaded', () => {
  init().then(() => {
    // Transport
    document.querySelector('.transport-btn.play').onclick = () => {
      if (state.playing) stopPlayback(); else startPlayback();
    };
    document.querySelector('.transport-btn.stop').onclick = stopPlayback;

    // BPM
    document.getElementById('bpm-up').onclick = () => setBPM(state.bpm + 1);
    document.getElementById('bpm-down').onclick = () => setBPM(state.bpm - 1);
    document.getElementById('bpm-value').addEventListener('dblclick', () => {
      const v = prompt('Enter BPM:', state.bpm);
      if (v) setBPM(parseInt(v));
    });

    // Step count
    document.querySelectorAll('.step-count-btn').forEach(btn => {
      btn.onclick = () => setStepCount(parseInt(btn.dataset.count));
    });

    // Add channel btn
    document.getElementById('add-channel-btn').onclick = () => {
      document.getElementById('add-channel-modal').classList.remove('hidden');
      renderInstrumentPicker();
    };

    // Import audio
    document.getElementById('import-btn').onclick = () => {
      document.getElementById('import-modal').classList.remove('hidden');
    };

    // Save / Load
    document.getElementById('save-btn').onclick = saveProject;
    document.getElementById('load-btn').onclick = () => document.getElementById('load-input').click();
    document.getElementById('load-input').onchange = (e) => {
      if (e.target.files[0]) loadProject(e.target.files[0]);
      e.target.value = '';
    };

    // Export
    document.getElementById('export-btn').onclick = exportSong;
    document.getElementById('confirm-export').onclick = doExport;
    document.getElementById('cancel-export').onclick = () => document.getElementById('export-modal').classList.add('hidden');

    // Add bar
    document.getElementById('add-bar-btn').onclick = () => addBars(4);

    // Song name
    document.getElementById('song-name').addEventListener('dblclick', () => {
      const n = prompt('Song name:', songName);
      if (n) { songName = n; document.getElementById('song-name').textContent = n; }
    });

    // Close modals
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('mousedown', (e) => {
        if (e.target === m) m.classList.add('hidden');
      });
    });

    // Add channel confirm
    document.getElementById('confirm-add-channel').onclick = () => {
      const selected = document.querySelector('.inst-option.selected');
      if (!selected) { notify('Select an instrument', 'warn'); return; }
      const instId = selected.dataset.id;
      const inst = INSTRUMENTS.find(i => i.id === instId) || { id:instId, name:instId, color:'#3498db', type:'lead', freq:440 };
      addChannel(inst);
      document.getElementById('add-channel-modal').classList.add('hidden');
    };
    document.getElementById('cancel-add-channel').onclick = () => {
      document.getElementById('add-channel-modal').classList.add('hidden');
    };

    // Import confirm
    document.getElementById('confirm-import').onclick = async () => {
      const fileInput = document.getElementById('import-file-input');
      if (!fileInput.files.length) { notify('Select a file first', 'warn'); return; }
      await importAudio(fileInput.files[0]);
      fileInput.value = '';
      document.getElementById('import-modal').classList.add('hidden');
    };
    document.getElementById('cancel-import').onclick = () => {
      document.getElementById('import-modal').classList.add('hidden');
    };
    document.getElementById('import-drop').onclick = () => document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = (e) => {
      if (e.target.files[0]) {
        document.getElementById('import-drop').textContent = '📁 ' + e.target.files[0].name;
      }
    };

    // Export name
    document.getElementById('export-name-input').value = songName;

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); if (state.playing) stopPlayback(); else startPlayback(); }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (e.shiftKey && state.selectedChannel) {
          if (confirm('Remove channel?')) removeChannel(state.selectedChannel);
        }
      }
    });
  });
});

function renderInstrumentPicker() {
  const grid = document.getElementById('instrument-picker-grid');
  grid.innerHTML = '';
  INSTRUMENTS.forEach(inst => {
    const div = document.createElement('div');
    div.className = 'inst-option';
    div.dataset.id = inst.id;
    div.innerHTML = `<div class="inst-dot" style="background:${inst.color}"></div><div class="inst-name">${inst.name}</div>`;
    div.onclick = () => {
      grid.querySelectorAll('.inst-option').forEach(d => d.classList.remove('selected'));
      div.classList.add('selected');
    };
    grid.appendChild(div);
  });
}
