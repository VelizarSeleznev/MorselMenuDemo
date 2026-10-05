class MorselCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.n = 0;
    this.chunk = new Int16Array(640);
    this.index = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const ratio = sampleRate / 16000;
    for (const sample of channel) {
      this.sum += sample;
      this.n++;
      this.phase++;
      if (this.phase >= ratio) {
        const value = Math.max(-1, Math.min(1, this.sum / this.n));
        this.chunk[this.index++] = value < 0 ? value * 32768 : value * 32767;
        this.phase -= ratio;
        this.sum = 0;
        this.n = 0;
        if (this.index === 640) {
          this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
          this.chunk = new Int16Array(640);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('morsel-capture', MorselCapture);
