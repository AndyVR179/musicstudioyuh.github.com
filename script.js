// script.js
const bpmInput = document.getElementById('bpm');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

let isPlaying = false;
let transportId = null;

// Simple drum synths
const kick = new Tone.MembraneSynth().toDestination();
const snare = new Tone.NoiseSynth({ noise: { type: 'white' } }).toDestination();
const hihat = new Tone.MetalSynth({ frequency: 8000, envelope: { decay: 0.1 } }).toDestination();

// Sequencer data: 8 tracks x 16 steps
let sequencerData = Array(8).fill().map(() => Array(16).fill(false));

const trackNames = ["Kick", "Snare", "Clap", "HiHat", "OpenHat", "Perc 1", "Perc 2", "808"];

// Build Step Sequencer UI
const sequencerDiv = document.getElementById('sequencer');
sequencerDiv.style.gridTemplateColumns = `repeat(17, minmax(0, 1fr))`;

trackNames.forEach((name, trackIndex) => {
  // Track label
  const label = document.createElement('div');
  label.textContent = name;
  label.className = "text-xs text-right pr-2 self-center text-orange-300";
  sequencerDiv.appendChild(label);

  for (let step = 0; step < 16; step++) {
    const btn = document.createElement('div');
    btn.className = 'step';
    btn.dataset.track = trackIndex;
    btn.dataset.step = step;

    btn.addEventListener('click', () => {
      sequencerData[trackIndex][step] = !sequencerData[trackIndex][step];
      btn.classList.toggle('active', sequencerData[trackIndex][step]);
    });

    sequencerDiv.appendChild(btn);
  }
});

// Very basic Piano Roll (simplified - one octave for demo)
const pianoRollDiv = document.getElementById('pianoRoll');
pianoRollDiv.style.gridTemplateColumns = `repeat(32, 30px)`; // 32 steps

const notes = ['C4','D4','E4','F4','G4','A4','B4','C5'];
notes.forEach(note => {
  for (let i = 0; i < 32; i++) {
    const cell = document.createElement('div');
    cell.className = 'note';
    cell.dataset.note = note;
    cell.dataset.step = i;
    cell.addEventListener('click', () => cell.classList.toggle('active'));
    pianoRollDiv.appendChild(cell);
  }
});

// Simple playback loop using Tone.Transport
function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  Tone.Transport.bpm.value = parseInt(bpmInput.value) || 128;

  transportId = Tone.Transport.scheduleRepeat((time) => {
    const step = Math.floor(Tone.Transport.progress * 16) % 16;

    sequencerData.forEach((track, trackIndex) => {
      if (track[step]) {
        if (trackIndex === 0) kick.triggerAttackRelease('C2', '8n', time);
        else if (trackIndex === 1) snare.triggerAttackRelease('16n', time);
        else if (trackIndex === 2) snare.triggerAttackRelease('16n', time + 0.05);
        else hihat.triggerAttackRelease('32n', time);
      }
    });
  }, "16n");

  Tone.Transport.start();
  playBtn.textContent = "PAUSE";
}

function stopPlayback() {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  isPlaying = false;
  playBtn.textContent = "PLAY";
}

// Controls
playBtn.addEventListener('click', () => {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
});

stopBtn.addEventListener('click', stopPlayback);

bpmInput.addEventListener('change', () => {
  Tone.Transport.bpm.value = parseInt(bpmInput.value);
});

// Allow clicking anywhere to start audio context (browser policy)
document.body.addEventListener('click', () => {
  if (Tone.context.state !== 'running') Tone.context.resume();
}, { once: true });

console.log("FL Mini loaded! Click PLAY and toggle steps to make beats ♫");
