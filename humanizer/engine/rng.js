// Seeded, deterministic randomness. Same seed => same sequence, on every JS engine.
// mulberry32: tiny, fast, good-enough 32-bit PRNG (public domain, Tommy Ettinger).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit string hash, used to derive sub-seeds from text.
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mixSeeds(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'number' ? p >>> 0 : hashString(p);
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h >>>= 0;
  }
  return h >>> 0;
}

export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** integer in [0, n) */
    int(n) {
      return Math.floor(next() * n);
    },
    /** true with probability p */
    chance(p) {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    },
    /** pick with weights (array of non-negative numbers) */
    weighted(items, weights) {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) return items[0];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}
