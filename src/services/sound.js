// Synthesized move/capture clicks via Web Audio — no audio asset to ship or
// load. The AudioContext is created lazily and resumed on first use (the first
// move is always a user gesture, which satisfies autoplay policies).
let audioContext = null;

function getContext() {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    audioContext = new AudioCtor();
  }
  return audioContext;
}

export function playMoveSound(kind = 'move') {
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const baseFreq = kind === 'capture' ? 200 : 340;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(baseFreq, now);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.08);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'capture' ? 0.18 : 0.12, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}
