// Word-frequency lookups (Zipf scale) backed by the generated table in freq-data.js.
import { FREQ_BUCKETS } from './freq-data.js';

let MAP = null;

export function freqMap() {
  if (MAP) return MAP;
  MAP = new Map();
  for (const key of Object.keys(FREQ_BUCKETS)) {
    const z = Number(key) / 10;
    for (const w of FREQ_BUCKETS[key].split(' ')) if (w && !MAP.has(w)) MAP.set(w, z);
  }
  return MAP;
}

/** Zipf frequency of a word (0 if not among the ~12k most common English words). */
export function zipf(word) {
  const w = String(word).toLowerCase().replace(/’/g, "'");
  const m = freqMap();
  const z = m.get(w);
  if (z !== undefined) return z;
  // light normalisation for inflected forms
  if (w.endsWith("'s")) return m.get(w.slice(0, -2)) ?? 0;
  return 0;
}
