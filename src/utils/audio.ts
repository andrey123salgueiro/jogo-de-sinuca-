/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let audioCtx: AudioContext | null = null;
let masterVolume = 0.5;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    // Lazy-initialize context on first interaction
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const setSoundVolume = (volume: number) => {
  masterVolume = Math.max(0, Math.min(1, volume));
};

export const playStrikeSound = (powerRatio: number) => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Low frequency thud growing to strike pop
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

  gainNode.gain.setValueAtTime(0.4 * powerRatio * masterVolume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

  // Soft bandpass filter to make it sound like a wooden billiard-cue strike
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(450, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.2);
};

export const playBallCollisionSound = (velocity: number) => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  // Map velocity (typical values 0 to 15) to sound amplitude
  const cappedVel = Math.min(15, Math.max(0.5, velocity));
  const intensity = cappedVel / 15;
  const volume = 0.5 * intensity * masterVolume;

  const now = ctx.currentTime;
  
  // Sharp clack consists of two oscillators: one high-frequency sine, one triangle
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(2000, now);
  osc1.frequency.exponentialRampToValueAtTime(900, now + 0.03);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(800, now);
  osc2.frequency.exponentialRampToValueAtTime(300, now + 0.05);

  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.06);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now + 0.06);
  osc1.stop(now + 0.06);
  osc2.stop(now + 0.06);
};

export const playWallBounceSound = (velocity: number) => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  const cappedVel = Math.min(12, Math.max(0.5, velocity));
  const intensity = cappedVel / 12;
  const volume = 0.3 * intensity * masterVolume;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Dull heavy thud (low-pass triangle)
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);

  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(150, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.16);
};

export const playPocketDropSound = () => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Heavy "plop" with falling pitch
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);

  gainNode.gain.setValueAtTime(0.35 * masterVolume, now);
  gainNode.gain.setValueAtTime(0.35 * masterVolume, now + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(250, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);
};

export const playFoulSound = () => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Dissonant sound (major 7th downward) for warnings
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(330, now); // E4
  osc1.frequency.setValueAtTime(293.66, now + 0.12); // D4

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(311.13, now); // D#4
  osc2.frequency.setValueAtTime(277.18, now + 0.12); // C#4

  gainNode.gain.setValueAtTime(0.18 * masterVolume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.35);

  osc1.connect(gainNode);
  osc2.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.4);
  osc2.stop(now + 0.4);
};

export const playVictorySound = () => {
  const ctx = getAudioContext();
  if (!ctx || masterVolume === 0) return;

  const now = ctx.currentTime;
  const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
  
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.1);
    
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.12 * masterVolume, now + idx * 0.1 + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.003, now + idx * 0.1 + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start(now + idx * 0.1);
    osc.stop(now + idx * 0.1 + 0.6);
  });
};
