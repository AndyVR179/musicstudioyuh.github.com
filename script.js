// script.js
const piano = new Tone.Sampler({
  urls: {
    "C3": "C3.mp3", "C#3": "Cs3.mp3", "D3": "D3.mp3", "D#3": "Ds3.mp3",
    "E3": "E3.mp3", "F3": "F3.mp3", "F#3": "Fs3.mp3", "G3": "G3.mp3",
    "G#3": "Gs3.mp3", "A3": "A3.mp3", "A#3": "As3.mp3", "B3": "B3.mp3",
    "C4": "C4.mp3", "C#4": "Cs4.mp3", "D4": "D4.mp3", "D#4": "Ds4.mp3",
    "E4": "E4.mp3", "F4": "F4.mp3", "F#4": "Fs4.mp3", "G4": "G4.mp3",
  },
  baseUrl: "https://tonejs.github.io/audio/salamander/",
  release: 1.5,
}).toDestination();

let isPlaying = false;
let isRecording = false;
let recorder = new Tone.Recorder();
let recordedBlob = null;

piano.connect(recorder);

// Notes for keyboard (3 octaves)
const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const notes = [];
for (let octave = 3; octave <= 5; octave++) {
  whiteKeys.forEach(note => notes.push(note + octave));
  if (octave < 5) ['C#','D#','F#','G#','A#'].forEach(s => notes.push(s + octave));
}

// Build Virtual Keyboard
const keyboardDiv = document.getElementById('keyboard');
notes.forEach(note => {
  const key = document.createElement('div');
  key.className = `key flex-shrink-0 ${note.includes('#') ? 'black' : 'white'}`;
  key.textContent = note;
  key.dataset.note = note;

  key.addEventListener('mousedown', () => playNote(note, key));
  key.addEventListener('mouseup', () => releaseNote(key));
  key.addEventListener('mouseleave', () => releaseNote(key));

  keyboardDiv.appendChild(key);
});

function playNote(note, element = null) {
  piano.triggerAttack(note);
  if (element) element.classList.add('active');
}

function releaseNote(element = null) {
  piano.releaseAll();
  if (element) element.classList.remove('active');
}

// Keyboard input (computer keys)
const keyMap = {
  'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4',
  'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4',
  'u': 'A#4', 'j': 'B4', 'k': 'C5'
};

document.addEventListener('keydown', e => {
  if (keyMap[e.key.toLowerCase()]) {
    const note = keyMap[e.key.toLowerCase()];
    playNote(note);
  }
});

document.addEventListener('keyup', () => piano.releaseAll());

// Simple Piano Roll (scrollable, "infinite" by making it very wide)
const pianoRoll = document.getElementById('pianoRoll');
pianoRoll.style.gridTemplateColumns = 'repeat(128, 50px)'; // 128 steps = very long song

const rollNotes = ['C5','B4','A4','G4','F4','E4','D4','C4']; // visible rows

rollNotes.forEach(note => {
  for (let step = 0; step < 128; step++) {
    const cell = document.createElement('div');
    cell.className = 'note-cell';
    cell.dataset.note = note;
    cell.dataset.step = step;
    cell.addEventListener('click', () => cell.classList.toggle('active'));
    pianoRoll.appendChild(cell);
  }
});

// Transport & Recording
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const recordBtn = document.getElementById('recordBtn');
const downloadBtn = document.getElementById('downloadBtn');
const bpmInput = document.getElementById('bpm');

Tone.Transport.bpm.value = 120;

playBtn.addEventListener('click', () => {
  if (isPlaying) {
    Tone.Transport.pause();
    playBtn.textContent = 'PLAY';
  } else {
    Tone.Transport.start();
    playBtn.textContent = 'PAUSE';
  }
  isPlaying = !isPlaying;
});

stopBtn.addEventListener('click', () => {
  Tone.Transport.stop();
  piano.releaseAll();
  isPlaying = false;
  playBtn.textContent = 'PLAY';
});

recordBtn.addEventListener('click', async () => {
  if (!isRecording) {
    await recorder.start();
    isRecording = true;
    recordBtn.textContent = 'STOP RECORD';
    recordBtn.classList.add('!bg-red-700');
  } else {
    recordedBlob = await recorder.stop();
    isRecording = false;
    recordBtn.textContent = 'RECORD';
    recordBtn.classList.remove('!bg-red-700');
    alert('Recording finished! Click DOWNLOAD MP3 to save it.');
  }
});

downloadBtn.addEventListener('click', () => {
  if (!recordedBlob) {
    alert("Record something first!");
    return;
  }
  const url = URL.createObjectURL(recordedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my-piano-song-${Date.now()}.webm`;   // Browser records as WebM (best quality)
  a.click();
  alert("Downloaded as .webm\n\nTo convert to MP3:\n1. Go to https://audio.online-convert.com/convert-to-mp3\n2. Upload the file\n3. Convert & download");
});

// Auto-update BPM
bpmInput.addEventListener('input', () => {
  Tone.Transport.bpm.value = parseInt(bpmInput.value) || 120;
});

// Start audio context on first interaction
document.body.addEventListener('click', () => Tone.context.resume(), { once: true });

console.log("🎹 Piano Studio ready! Make infinite music and export it.");
