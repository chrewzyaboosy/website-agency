import re, json, sys
from wordfreq import top_n_list, zipf_frequency
words = top_n_list('en', 16000)
out = {}
seen = set()
n = 0
for w in words:
    if not re.fullmatch(r"[a-z]+(?:'[a-z]+)?", w): continue
    if w in seen: continue
    if len(w) == 1 and w not in ('a','i'): continue
    seen.add(w)
    z = zipf_frequency(w, 'en')
    k = int(round(z*10))
    out.setdefault(k, []).append(w)
    n += 1
    if n >= 12000: break
keys = sorted(out.keys(), reverse=True)
lines = []
lines.append("// AUTO-GENERATED from the `wordfreq` Python package (Robyn Speer et al., CC-BY-SA 4.0 data).")
lines.append("// Top %d English words, grouped by Zipf frequency (key = Zipf * 10)." % n)
lines.append("// Zipf scale: 7 = extremely common ('the'), 3 = ~1 per million words. Regenerate: python engine/tools/gen_freq.py engine/freq-data.js (needs `pip install wordfreq`).")
lines.append("export const FREQ_BUCKETS = {")
for k in keys:
    lines.append("  %d: %s," % (k, json.dumps(' '.join(out[k]))))
lines.append("};")
lines.append("export const FREQ_WORD_COUNT = %d;" % n)
open(sys.argv[1], 'w').write('\n'.join(lines) + '\n')
print(n, min(keys), max(keys))
