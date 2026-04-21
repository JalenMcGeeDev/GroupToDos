/**
 * Generate a celebration fanfare WAV sound file.
 * Creates ascending arpeggio notes (C5 → E5 → G5 → C6) followed by a short chord.
 * Run: node scripts/generate-fanfare.js
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

// Musical notes (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.50;

function generateSineWave(freq, duration, sampleRate, amplitude = 0.5) {
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return samples;
}

function applyEnvelope(samples, attackTime, decayTime, sampleRate) {
  const attackSamples = Math.floor(sampleRate * attackTime);
  const decaySamples = Math.floor(sampleRate * decayTime);
  const sustainEnd = samples.length - decaySamples;

  for (let i = 0; i < samples.length; i++) {
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i > sustainEnd) {
      env = (samples.length - i) / decaySamples;
    }
    samples[i] *= env;
  }
  return samples;
}

function mixSamples(...arrays) {
  const maxLen = Math.max(...arrays.map(a => a.length));
  const result = new Float32Array(maxLen);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      result[i] += arr[i];
    }
  }
  // Normalize if clipping
  let maxVal = 0;
  for (let i = 0; i < result.length; i++) {
    maxVal = Math.max(maxVal, Math.abs(result[i]));
  }
  if (maxVal > 1.0) {
    for (let i = 0; i < result.length; i++) {
      result[i] /= maxVal;
    }
  }
  return result;
}

function concatSamples(...arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function addHarmonics(freq, duration, sampleRate) {
  // Fundamental + 2nd harmonic (softer) + 3rd harmonic (very soft) for richer sound
  const fundamental = generateSineWave(freq, duration, sampleRate, 0.45);
  const second = generateSineWave(freq * 2, duration, sampleRate, 0.15);
  const third = generateSineWave(freq * 3, duration, sampleRate, 0.05);
  return mixSamples(fundamental, second, third);
}

function makeNote(freq, duration) {
  const samples = addHarmonics(freq, duration, SAMPLE_RATE);
  return applyEnvelope(samples, 0.01, duration * 0.4, SAMPLE_RATE);
}

function makeChord(freqs, duration) {
  const waves = freqs.map(f => {
    const s = addHarmonics(f, duration, SAMPLE_RATE);
    return applyEnvelope(s, 0.01, duration * 0.6, SAMPLE_RATE);
  });
  return mixSamples(...waves);
}

function generateFanfare() {
  // Ascending arpeggio
  const noteDuration = 0.15;
  const note1 = makeNote(C5, noteDuration);
  const note2 = makeNote(E5, noteDuration);
  const note3 = makeNote(G5, noteDuration);
  const note4 = makeNote(C6, noteDuration);

  // Short pause
  const pause = new Float32Array(Math.floor(SAMPLE_RATE * 0.05));

  // Triumphant chord
  const chord = makeChord([C5, E5, G5, C6], 0.8);

  // Concat: arpeggio → pause → chord
  return concatSamples(note1, note2, note3, note4, pause, chord);
}

function floatToInt16(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    const int16 = val < 0 ? val * 32768 : val * 32767;
    buffer.writeInt16LE(Math.round(int16), i * 2);
  }
  return buffer;
}

function writeWav(filePath, samples) {
  const dataBuffer = floatToInt16(samples);
  const byteRate = SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8;
  const blockAlign = NUM_CHANNELS * BITS_PER_SAMPLE / 8;
  const dataSize = dataBuffer.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // chunk size
  header.writeUInt16LE(1, 20);           // PCM format
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, dataBuffer]));

  const duration = samples.length / SAMPLE_RATE;
  const sizeKB = (fileSize / 1024).toFixed(1);
  console.log(`✓ ${path.relative(process.cwd(), filePath)} (${duration.toFixed(2)}s, ${sizeKB} KB)`);
}

// Generate and write
const samples = generateFanfare();
const outPath = path.join(__dirname, '..', 'assets', 'sounds', 'celebration-fanfare.wav');
writeWav(outPath, samples);
console.log('Done!');
