// Minimal English verb inflection for replacement phrases ("dig into" -> "dug into").
// Forms: 'b' base, 's' third-person singular, 'd' past / past participle, 'g' -ing.

export const IRREGULAR = {
  be: ['is', 'was', 'being'],
  have: ['has', 'had', 'having'],
  do: ['does', 'did', 'doing'],
  go: ['goes', 'went', 'going'],
  dig: ['digs', 'dug', 'digging'],
  get: ['gets', 'got', 'getting'],
  make: ['makes', 'made', 'making'],
  build: ['builds', 'built', 'building'],
  rebuild: ['rebuilds', 'rebuilt', 'rebuilding'],
  find: ['finds', 'found', 'finding'],
  put: ['puts', 'put', 'putting'],
  cut: ['cuts', 'cut', 'cutting'],
  set: ['sets', 'set', 'setting'],
  bring: ['brings', 'brought', 'bringing'],
  keep: ['keeps', 'kept', 'keeping'],
  lead: ['leads', 'led', 'leading'],
  hold: ['holds', 'held', 'holding'],
  tell: ['tells', 'told', 'telling'],
  sell: ['sells', 'sold', 'selling'],
  spend: ['spends', 'spent', 'spending'],
  stand: ['stands', 'stood', 'standing'],
  feel: ['feels', 'felt', 'feeling'],
  mean: ['means', 'meant', 'meaning'],
  pay: ['pays', 'paid', 'paying'],
  say: ['says', 'said', 'saying'],
  send: ['sends', 'sent', 'sending'],
  win: ['wins', 'won', 'winning'],
  hit: ['hits', 'hit', 'hitting'],
  cast: ['casts', 'cast', 'casting'],
  let: ['lets', 'let', 'letting'],
  shed: ['sheds', 'shed', 'shedding'],
  lay: ['lays', 'laid', 'laying'],
  run: ['runs', 'ran', 'running'],
  take: ['takes', 'took', 'taking'],
  give: ['gives', 'gave', 'giving'],
  draw: ['draws', 'drew', 'drawing'],
  drive: ['drives', 'drove', 'driving'],
  speak: ['speaks', 'spoke', 'speaking'],
  write: ['writes', 'wrote', 'writing'],
  begin: ['begins', 'began', 'beginning'],
  strike: ['strikes', 'struck', 'striking'],
  understand: ['understands', 'understood', 'understanding'],
  stick: ['sticks', 'stuck', 'sticking'],
  catch: ['catches', 'caught', 'catching'],
  think: ['thinks', 'thought', 'thinking'],
  rethink: ['rethinks', 'rethought', 'rethinking'],
  seek: ['seeks', 'sought', 'seeking'],
  show: ['shows', 'showed', 'showing'],
  see: ['sees', 'saw', 'seeing'],
  come: ['comes', 'came', 'coming'],
  break: ['breaks', 'broke', 'breaking'],
  shine: ['shines', 'shone', 'shining'],
  rise: ['rises', 'rose', 'rising'],
  grow: ['grows', 'grew', 'growing'],
  know: ['knows', 'knew', 'knowing'],
  throw: ['throws', 'threw', 'throwing'],
  shoot: ['shoots', 'shot', 'shooting'],
  ring: ['rings', 'rang', 'ringing'],
  teach: ['teaches', 'taught', 'teaching'],
  leave: ['leaves', 'left', 'leaving'],
  meet: ['meets', 'met', 'meeting'],
  hang: ['hangs', 'hung', 'hanging'],
  dive: ['dives', 'dove', 'diving'],
  strive: ['strives', 'strove', 'striving'],
  spin: ['spins', 'spun', 'spinning'],
  light: ['lights', 'lit', 'lighting'],
  lose: ['loses', 'lost', 'losing'],
  buy: ['buys', 'bought', 'buying'],
  fight: ['fights', 'fought', 'fighting'],
  sit: ['sits', 'sat', 'sitting'],
  read: ['reads', 'read', 'reading'],
  hear: ['hears', 'heard', 'hearing'],
};

// Verbs whose past participle differs from the simple past: never used to render an ambiguous
// '-ed' source form ("has delved" vs "delved"), because "has took" would be wrong.
export const PARTICIPLE_DIFFERS = new Set([
  'be', 'go', 'take', 'give', 'draw', 'drive', 'speak', 'write', 'begin', 'run', 'show', 'see', 'come', 'break',
  'rise', 'grow', 'know', 'throw', 'ring', 'strike', 'do', 'dive', 'strive', 'shine', 'get',
]);

// Consonant doubling before -ed/-ing.
const DOUBLE = new Set(
  (
    'stop plan ship drop map tap step grab trim scan chat pin spot swap prep skip slip shop top zip jam tag flag plug ' +
    'hug nab dip rub sum fit admit commit refer prefer occur control patrol equip regret upset permit submit omit ' +
    'emit transfer compel propel format dim slim stir blur star bar ban wrap strap snap clap flip trip grip strip ' +
    'drip chop mop pop hop sip rip tip nip whip dub scrub club stab rob beg jog log blog vet net bet pet pad nod plod ' +
    'prod shred plot jot slot trot fan tan pan underpin unplug outstrip worship'
  ).split(' ')
);

export function inflectVerb(v, form) {
  if (form === 'b' || !form) return v;
  const lower = v.toLowerCase();
  const irr = IRREGULAR[lower];
  if (irr) return irr[{ s: 0, d: 1, g: 2 }[form]];
  if (form === 's') {
    if (/(s|x|z|ch|sh|o)$/.test(lower)) return v + 'es';
    if (/[^aeiou]y$/.test(lower)) return v.slice(0, -1) + 'ies';
    return v + 's';
  }
  if (form === 'd') {
    if (/e$/.test(lower)) return v + 'd';
    if (/[^aeiou]y$/.test(lower)) return v.slice(0, -1) + 'ied';
    if (DOUBLE.has(lower)) return v + v.slice(-1) + 'ed';
    return v + 'ed';
  }
  if (form === 'g') {
    if (/ie$/.test(lower)) return v.slice(0, -2) + 'ying';
    if (/[^aeiouy]e$/.test(lower) && !/(ee|ye|oe)$/.test(lower)) return v.slice(0, -1) + 'ing';
    if (DOUBLE.has(lower)) return v + v.slice(-1) + 'ing';
    return v + 'ing';
  }
  return v;
}

/** Inflect the head verb of a phrase; hyphenated heads inflect their last part ("fine-tune" -> "fine-tuned"). */
export function inflectPhrase(phrase, form) {
  if (form === 'b' || !form || !phrase) return phrase;
  const i = phrase.indexOf(' ');
  const head = i < 0 ? phrase : phrase.slice(0, i);
  const rest = i < 0 ? '' : phrase.slice(i);
  const dash = head.lastIndexOf('-');
  if (dash > 0) return head.slice(0, dash + 1) + inflectVerb(head.slice(dash + 1), form) + rest;
  return inflectVerb(head, form) + rest;
}

export function headVerb(phrase) {
  const h = phrase.split(' ')[0];
  const dash = h.lastIndexOf('-');
  return (dash > 0 ? h.slice(dash + 1) : h).toLowerCase();
}

/** All surface forms of a source lemma, keyed by form. */
export function verbForms(lemma, custom) {
  const f = {
    b: [lemma],
    s: [inflectVerb(lemma, 's')],
    d: [inflectVerb(lemma, 'd')],
    g: [inflectVerb(lemma, 'g')],
  };
  if (custom) for (const k of Object.keys(custom)) f[k] = [].concat(custom[k]);
  // British -ise / -yse variants
  for (const k of Object.keys(f)) {
    const extra = [];
    for (const w of f[k]) {
      if (/iz/.test(w)) extra.push(w.replace(/iz/, 'is'));
      if (/yz/.test(w)) extra.push(w.replace(/yz/, 'ys'));
    }
    f[k] = [...new Set([...f[k], ...extra])];
  }
  return f;
}
