/**
 * Sound Manager - Singleton for chess game sound effects
 * Uses Web Audio API to generate sounds (no external files needed)
 */

type SoundType = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'game-start' | 'game-end';

class SoundManager {
  private static instance: SoundManager;
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;

  private constructor() {}

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', gainValue?: number) {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime((gainValue ?? this.volume) * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  private playNoise(duration: number, filterFreq: number) {
    const ctx = this.getContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    filter.Q.setValueAtTime(1, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  }

  play(sound: SoundType): void {
    if (!this.enabled) return;

    try {
      switch (sound) {
        case 'move':
          // Soft wooden "click" - short noise burst + tone
          this.playNoise(0.08, 3000);
          this.playTone(800, 0.06, 'sine');
          break;

        case 'capture':
          // Aggressive thud - lower frequency, longer
          this.playNoise(0.15, 1500);
          this.playTone(300, 0.12, 'triangle');
          this.playTone(150, 0.15, 'sine');
          break;

        case 'check':
          // Alert tone - two ascending notes
          this.playTone(660, 0.1, 'square', this.volume * 0.7);
          setTimeout(() => {
            this.playTone(880, 0.15, 'square', this.volume * 0.7);
          }, 100);
          break;

        case 'castle':
          // Two-step slide sound
          this.playNoise(0.06, 2500);
          setTimeout(() => {
            this.playNoise(0.08, 3500);
            this.playTone(600, 0.08, 'sine');
          }, 80);
          break;

        case 'promote':
          // Ascending arpeggio
          this.playTone(523, 0.1, 'triangle');
          setTimeout(() => this.playTone(659, 0.1, 'triangle'), 80);
          setTimeout(() => this.playTone(784, 0.1, 'triangle'), 160);
          setTimeout(() => this.playTone(1047, 0.15, 'triangle'), 240);
          break;

        case 'game-start':
          // Pleasant chord
          this.playTone(523, 0.3, 'sine');
          this.playTone(659, 0.3, 'sine');
          this.playTone(784, 0.3, 'sine');
          break;

        case 'game-end':
          // Resolving chord
          this.playTone(392, 0.4, 'sine');
          setTimeout(() => {
            this.playTone(523, 0.4, 'sine');
            this.playTone(659, 0.4, 'sine');
          }, 200);
          break;
      }
    } catch (e) {
      // Silently ignore audio errors (user hasn't interacted with page yet, etc.)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }
}

export const soundManager = SoundManager.getInstance();
export type { SoundType };
