import { Injectable } from '@angular/core';

/**
 * AudioService — centralized, file-free sound effects via the Web Audio API.
 *
 * Why Web Audio (oscillators) instead of <audio src="*.mp3">?
 *  - No binary assets to ship / cache-bust.
 *  - Instant playback (no network fetch, no decode latency).
 *  - Works the same in every theme / build.
 *
 * Browsers block audio until the user interacts with the page (autoplay
 * policy). Call `unlock()` from the first user gesture (login click, etc.)
 * so the shared AudioContext is resumed and later sounds are audible.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private ctx: AudioContext | null = null;
  private ringTimer: any = null;
  private muted = false;

  constructor() {
    // Auto-unlock on the very first user gesture anywhere in the app so that
    // later notification sounds (message ding, ringtone) are audible without
    // requiring a specific button to have been clicked first.
    if (typeof window !== 'undefined') {
      const unlockOnce = () => {
        this.unlock();
        window.removeEventListener('pointerdown', unlockOnce);
        window.removeEventListener('keydown', unlockOnce);
      };
      window.addEventListener('pointerdown', unlockOnce, { once: false });
      window.addEventListener('keydown', unlockOnce, { once: false });
    }
  }

  /** Lazily create (and resume) the shared AudioContext. */
  private ensureCtx(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      }
      if (this.ctx!.state === 'suspended') this.ctx!.resume().catch(() => {});
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** Resume audio after a user gesture (call once on first interaction). */
  unlock(): void { this.ensureCtx(); }

  /** Globally mute/unmute all sounds (e.g. a user preference toggle). */
  setMuted(m: boolean): void { this.muted = m; if (m) this.stopRingtone(); }
  isMuted(): boolean { return this.muted; }

  // ── Primitive tone ─────────────────────────────────────────
  private tone(freq: number, startOffset: number, duration: number, peak = 0.2): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // ── Ringtone (looping two-tone phone ring) ─────────────────
  startRingtone(): void {
    this.stopRingtone();
    if (this.muted) return;
    const ring = () => { this.tone(480, 0, 0.7, 0.25); this.tone(440, 0.05, 0.7, 0.25); };
    ring();
    this.ringTimer = setInterval(ring, 2200);
  }

  stopRingtone(): void {
    if (this.ringTimer) { clearInterval(this.ringTimer); this.ringTimer = null; }
  }

  // ── One-shot notification sounds ───────────────────────────
  /** Soft two-note "ding" for an incoming chat message. */
  playMessage(): void { this.tone(660, 0, 0.16, 0.15); this.tone(880, 0.12, 0.18, 0.15); }

  /** Generic single-note chime for a system notification. */
  playNotification(): void { this.tone(784, 0, 0.22, 0.16); }

  /** Short rising blip used when a call is successfully connected. */
  playCallConnected(): void { this.tone(523, 0, 0.12, 0.18); this.tone(784, 0.1, 0.18, 0.18); }

  /** Descending tone used when a call ends. */
  playCallEnded(): void { this.tone(440, 0, 0.18, 0.16); this.tone(330, 0.14, 0.22, 0.16); }
}
