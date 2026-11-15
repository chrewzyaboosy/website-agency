// Word-level diff for UI highlighting. Whitespace is preserved, so
//   join(same + add) === b   and   join(same + del) === a.
// Exact LCS (common prefix/suffix trimmed, Uint16/Uint32 DP table) when the changed middle is small enough;
// for very long inputs (> 6000 tokens) or huge middles it aligns paragraph by paragraph and falls back to
// "del whole chunk + add whole chunk" for any pair that is still too big, so the UI never freezes.

const TOKEN_RE = /\s+|[\p{L}\p{N}\p{M}_'’\-]+|[^\s\p{L}\p{N}\p{M}_'’\-]/gu;
const MAX_CELLS = 4_000_000;
const LONG_TOKENS = 6000;

export function tokenize(s) {
  return String(s).match(TOKEN_RE) || [];
}

function push(out, type, text) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

function lcsDiff(a, b, out) {
  const n = a.length;
  const m = b.length;
  if (n === 0) {
    for (const t of b) push(out, 'add', t);
    return;
  }
  if (m === 0) {
    for (const t of a) push(out, 'del', t);
    return;
  }
  const W = m + 1;
  const big = n > 65000 || m > 65000;
  const dp = big ? new Uint32Array((n + 1) * W) : new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    const ai = a[i];
    const row = i * W;
    const next = (i + 1) * W;
    for (let j = m - 1; j >= 0; j--) {
      dp[row + j] = ai === b[j] ? dp[next + j + 1] + 1 : Math.max(dp[next + j], dp[row + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(out, 'same', a[i]);
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) {
      push(out, 'del', a[i]);
      i++;
    } else {
      push(out, 'add', b[j]);
      j++;
    }
  }
  while (i < n) push(out, 'del', a[i++]);
  while (j < m) push(out, 'add', b[j++]);
}

function diffTokens(a, b, out) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  for (let k = 0; k < start; k++) push(out, 'same', a[k]);
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if ((midA.length + 1) * (midB.length + 1) <= MAX_CELLS) lcsDiff(midA, midB, out);
  else {
    push(out, 'del', midA.join(''));
    push(out, 'add', midB.join(''));
  }
  for (let k = endA; k < a.length; k++) push(out, 'same', a[k]);
}

function splitParas(s) {
  // keep separators attached so the pieces join back exactly
  return String(s).split(/(?<=\n)/);
}

/** Make the diff easier to read: whitespace-only "same" runs between two changes join the change. */
function tidy(segs) {
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const prev = out[out.length - 1];
    const next = segs[i + 1];
    if (s.type === 'same' && /^[ \t]+$/.test(s.text) && prev && prev.type !== 'same' && next && next.type !== 'same') {
      // attach to both sides: del gets it, add gets it (round-trip preserved)
      let delSeg = null;
      let addSeg = null;
      for (let k = out.length - 1; k >= 0 && out[k].type !== 'same'; k--) {
        if (out[k].type === 'del' && !delSeg) delSeg = out[k];
        if (out[k].type === 'add' && !addSeg) addSeg = out[k];
      }
      if (delSeg && addSeg) {
        delSeg.text += s.text;
        addSeg.text += s.text;
        continue;
      }
    }
    if (prev && prev.type === s.type) prev.text += s.text;
    else out.push({ type: s.type, text: s.text });
  }
  // order within a change block: dels before adds
  const res = [];
  let block = [];
  const flush = () => {
    const d = block.filter((x) => x.type === 'del').map((x) => x.text).join('');
    const a = block.filter((x) => x.type === 'add').map((x) => x.text).join('');
    if (d) res.push({ type: 'del', text: d });
    if (a) res.push({ type: 'add', text: a });
    block = [];
  };
  for (const s of out) {
    if (s.type === 'same') {
      flush();
      res.push(s);
    } else block.push(s);
  }
  flush();
  return res;
}

/**
 * @param {string} a original
 * @param {string} b revised
 * @returns {Array<{type:'same'|'add'|'del', text:string}>}
 */
export function diffWords(a, b) {
  const A = typeof a === 'string' ? a : String(a ?? '');
  const B = typeof b === 'string' ? b : String(b ?? '');
  const out = [];
  if (A === B) {
    if (A) out.push({ type: 'same', text: A });
    return out;
  }
  const ta = tokenize(A);
  const tb = tokenize(B);
  if (ta.length + tb.length <= 2 * LONG_TOKENS) {
    diffTokens(ta, tb, out);
    return tidy(out);
  }
  // Long input: align line by line (the humanizer preserves line structure), diff each pair.
  const pa = splitParas(A);
  const pb = splitParas(B);
  if (pa.length === pb.length) {
    for (let i = 0; i < pa.length; i++) diffTokens(tokenize(pa[i]), tokenize(pb[i]), out);
  } else {
    diffTokens(ta, tb, out);
  }
  return tidy(out);
}
