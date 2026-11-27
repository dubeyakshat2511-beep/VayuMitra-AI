/**
 * Raw 16-bit little-endian PCM encoding/decoding helpers for the Gemini Live API.
 *
 * Audio format rules:
 * - Microphone input to Gemini Live: 16 kHz, mono, 16-bit signed PCM little-endian
 * - Model audio output from Gemini Live: 24 kHz, mono, 16-bit signed PCM little-endian
 */

export const LIVE_INPUT_SAMPLE_RATE = 16000;
export const LIVE_OUTPUT_SAMPLE_RATE = 24000;

/**
 * Downsample a Float32Array audio buffer from `sourceSampleRate` to `targetSampleRate`
 * using simple linear averaging per output bucket to avoid aliasing artifacts.
 */
export function downsampleFloat32(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = LIVE_INPUT_SAMPLE_RATE
): Float32Array {
  if (
    !Number.isFinite(sourceSampleRate) ||
    !Number.isFinite(targetSampleRate) ||
    sourceSampleRate <= 0 ||
    targetSampleRate <= 0 ||
    sourceSampleRate === targetSampleRate
  ) {
    return input;
  }

  if (sourceSampleRate < targetSampleRate) {
    // Linear interpolation upsampling fallback
    const ratio = sourceSampleRate / targetSampleRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = input[idx] ?? 0;
      const s1 = input[Math.min(idx + 1, input.length - 1)] ?? s0;
      output[i] = s0 + (s1 - s0) * frac;
    }
    return output;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  let offsetBuffer = 0;
  for (let i = 0; i < outputLength; i++) {
    const nextOffsetBuffer = Math.min(Math.round((i + 1) * ratio), input.length);
    let accum = 0;
    let count = 0;
    for (let j = offsetBuffer; j < nextOffsetBuffer; j++) {
      accum += input[j];
      count++;
    }
    output[i] = count > 0 ? accum / count : 0;
    offsetBuffer = nextOffsetBuffer;
  }

  return output;
}

/**
 * Encode a Uint8Array into a base64 string without exceeding call-stack limits.
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string into a Uint8Array in both browser and Node/Vitest runtimes.
 */
function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Float32 PCM samples (-1..1) into Base64-encoded 16-bit signed little-endian PCM.
 */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }
  return bytesToBase64(new Uint8Array(buffer));
}

/**
 * Decode Base64-encoded 16-bit signed little-endian PCM into Float32 samples (-1..1).
 */
export function pcm16Base64ToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }

  return float32;
}

/**
 * Compute normalized RMS volume level (0..1) from Float32 audio samples for UI visualizers.
 */
export function computeAudioLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.min(1, Number((rms * 4.5).toFixed(3)));
}
