export class TennisSoundEngine {
  private context: AudioContext | null = null;

  unlock(): void {
    const context = this.getContext();
    if (context?.state === "suspended") void context.resume();
  }

  playRacketHit(speed: number): void {
    const context = this.readyContext();
    if (!context) return;
    const now = context.currentTime;
    const strength = clamp(speed / 28, 0.45, 1);
    this.noiseBurst(context, now, 0.075, 1250, 3500, 0.13 * strength);
    this.tone(context, now, 155 + strength * 45, 92, 0.085, 0.11 * strength, "triangle");
    this.tone(context, now, 720 + strength * 170, 510, 0.045, 0.045 * strength, "sine");
  }

  playCourtBounce(speed: number): void {
    const context = this.readyContext();
    if (!context) return;
    const now = context.currentTime;
    const strength = clamp(speed / 16, 0.3, 0.9);
    this.noiseBurst(context, now, 0.055, 280, 1250, 0.075 * strength);
    this.tone(context, now, 118 + strength * 24, 68, 0.07, 0.085 * strength, "sine");
  }

  playConeFall(): void {
    const context = this.readyContext();
    if (!context) return;
    const now = context.currentTime;
    // Hollow polyethylene impact, followed by the wider clatter as the group reaches the court.
    this.noiseBurst(context, now, 0.065, 520, 3200, 0.11);
    this.tone(context, now, 460, 235, 0.09, 0.075, "triangle");
    this.noiseBurst(context, now + 0.13, 0.12, 180, 1900, 0.095);
    this.tone(context, now + 0.13, 235, 105, 0.14, 0.065, "triangle");
  }

  private getContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof AudioContext === "undefined") return null;
    this.context = new AudioContext({ latencyHint: "interactive" });
    return this.context;
  }

  private readyContext(): AudioContext | null {
    const context = this.getContext();
    return context?.state === "running" ? context : null;
  }

  private noiseBurst(context: AudioContext, at: number, duration: number, low: number, high: number, volume: number): void {
    const frameCount = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = Math.pow(1 - index / frameCount, 2.3);
      channel[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const gain = context.createGain();
    highPass.type = "highpass";
    highPass.frequency.value = low;
    lowPass.type = "lowpass";
    lowPass.frequency.value = high;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.buffer = buffer;
    source.connect(highPass).connect(lowPass).connect(gain).connect(context.destination);
    source.start(at);
    source.stop(at + duration);
  }

  private tone(context: AudioContext, at: number, startHz: number, endHz: number, duration: number,
    volume: number, type: OscillatorType): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, at);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
