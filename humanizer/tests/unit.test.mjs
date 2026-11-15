// Unit tests for the Inkling engine. Run: node --test tests/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { humanize, detect, diffWords, VERSION } from '../engine/index.js';
import { splitSentences, countWords } from '../engine/sentences.js';
import { createStore, protect } from '../engine/protect.js';
import { createRng, mulberry32 } from '../engine/rng.js';
import { inflectPhrase } from '../engine/inflect.js';

// ------------------------------------------------------------------------------------------ fixtures
const AI_PARAGRAPH =
  "In today's fast-paced digital landscape, businesses must leverage cutting-edge tools to stay ahead of the curve. Our comprehensive platform seamlessly integrates with your existing workflow, empowering your team to create compelling campaigns that resonate with your target audience. Moreover, our robust analytics dashboard provides actionable insights that enable data-driven decision-making. Whether you're a small business or a large enterprise, our solution is designed to scale with your needs.";

const AI_BLOG =
  "In today's ever-evolving digital landscape, content marketing has become a crucial component of any successful business strategy. As consumers become increasingly discerning, brands must navigate the complexities of creating content that not only captures attention but also drives meaningful engagement. Content marketing is important because it builds trust with your audience over time. When done right, it serves as a powerful tool for establishing thought leadership, fostering brand loyalty, and ultimately driving conversions. In this article, we will delve into the key strategies that can help you elevate your content marketing game.";

const FIVE_PARAGRAPHS = `In today's fast-paced world, small businesses face a myriad of challenges. From tight budgets to fierce competition, navigating the complexities of growth can feel overwhelming. However, with the right strategies, it is possible to thrive.

Email marketing remains one of the most effective channels for reaching your audience. With an average return of $36 for every dollar spent, it offers an impressive ROI that few other channels can match. Additionally, crafting compelling subject lines can significantly improve your open rates — and that's where many brands fall short.

Social media is a testament to the power of community. Brands that foster genuine engagement see 3x more repeat purchases, according to a 2023 study by Sprout Social. It's important to note that consistency plays a crucial role in building this kind of loyalty.

Customer experience has emerged as a key differentiator in today's crowded marketplace. To deliver exceptional experiences, companies must understand their customers' needs, streamline their processes, and empower their employees to go above and beyond. This means that every touchpoint matters.

In conclusion, growth is a journey, not a destination. By leveraging these strategies, you can unlock the full potential of your business and build a rich tapestry of loyal customers. Let's dive in and get started today!`;

const HUMAN_SAMPLE =
  "Bought this for my husband's birthday and honestly I wasn't sure he'd use it. He's had it three weeks now and takes it everywhere. The zipper on the side pocket is a little stiff, which is annoying when you're trying to grab your phone fast, but the main compartment fits his laptop plus a charger with room to spare. Four stars because of the zipper. Would buy again though.";

const TONES = ['natural', 'casual', 'professional', 'marketing', 'academic'];
const STRENGTHS = ['light', 'balanced', 'aggressive'];

function sentenceLengths(text) {
  return text
    .split('\n')
    .flatMap((p) => splitSentences(p))
    .map((s) => countWords(s.text));
}
function cv(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  const v = a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length;
  return Math.sqrt(v) / m;
}
function allOutputs() {
  const out = [];
  for (const tone of TONES)
    for (const strength of STRENGTHS)
      for (const seed of [1, 2]) out.push({ tone, strength, seed, text: humanize(FIVE_PARAGRAPHS, { tone, strength, seed }).text });
  for (const seed of [1, 2, 3, 4]) {
    out.push({ seed, text: humanize(AI_PARAGRAPH, { seed }).text });
    out.push({ seed, text: humanize(AI_BLOG, { seed }).text });
  }
  return out;
}
const OUTPUTS = allOutputs();

// ------------------------------------------------------------------------------------------ API shape
describe('API contract', () => {
  test('exports a version string', () => {
    assert.equal(typeof VERSION, 'string');
    assert.ok(VERSION.length > 0);
  });

  test('humanize returns text, changes and stats', () => {
    const r = humanize(AI_PARAGRAPH);
    assert.equal(typeof r.text, 'string');
    assert.equal(typeof r.changes, 'number');
    for (const k of ['inputWords', 'outputWords', 'sentencesIn', 'sentencesOut', 'ms']) assert.equal(typeof r.stats[k], 'number', k);
    assert.ok(r.changes > 0);
    assert.notEqual(r.text, AI_PARAGRAPH);
  });

  test("humanize('') returns empty text and zero changes", () => {
    const r = humanize('');
    assert.equal(r.text, '');
    assert.equal(r.changes, 0);
    assert.equal(r.stats.inputWords, 0);
  });

  test('whitespace-only input is returned unchanged', () => {
    for (const s of [' ', '\n\n', '\t \n ']) {
      const r = humanize(s);
      assert.equal(r.text, s);
      assert.equal(r.changes, 0);
    }
  });

  test('non-string input never throws', () => {
    for (const v of [undefined, null, 42, {}, [], true]) {
      assert.doesNotThrow(() => humanize(v));
      assert.doesNotThrow(() => detect(v));
      assert.doesNotThrow(() => diffWords(v, v));
    }
    assert.doesNotThrow(() => humanize('Hello there.', { tone: 'nope', strength: 'max', seed: NaN, spelling: 'fr' }));
  });

  test('detect returns score, label, signals and sentences', () => {
    const d = detect(AI_PARAGRAPH);
    assert.ok(d.score >= 0 && d.score <= 100);
    assert.ok(['Likely human', 'Mixed', 'Likely AI'].includes(d.label));
    assert.ok(d.signals.length >= 8);
    for (const s of d.signals) {
      assert.equal(typeof s.id, 'string');
      assert.equal(typeof s.name, 'string');
      assert.equal(typeof s.value, 'number');
      assert.ok(['human', 'neutral', 'ai'].includes(s.verdict));
      assert.equal(typeof s.detail, 'string');
    }
    assert.ok(d.sentences.length >= 4);
    for (const s of d.sentences) {
      assert.equal(AI_PARAGRAPH.slice(s.start, s.end), s.text);
      assert.ok(s.ai >= 0 && s.ai <= 1);
    }
  });
});

// ------------------------------------------------------------------------------------------ determinism
describe('determinism', () => {
  test('same text + options + seed => identical output', () => {
    for (const tone of TONES) {
      const a = humanize(FIVE_PARAGRAPHS, { tone, seed: 7 });
      const b = humanize(FIVE_PARAGRAPHS, { tone, seed: 7 });
      assert.equal(a.text, b.text);
      assert.equal(a.changes, b.changes);
    }
  });

  test('default seed is deterministic too', () => {
    assert.equal(humanize(AI_BLOG).text, humanize(AI_BLOG).text);
  });

  test('different seeds give different variants', () => {
    const outs = new Set([1, 2, 3, 4, 5].map((seed) => humanize(FIVE_PARAGRAPHS, { seed }).text));
    assert.ok(outs.size >= 4, `only ${outs.size} distinct variants`);
  });

  test('mulberry32 is a fixed sequence', () => {
    const r = mulberry32(12345);
    const seq = [r(), r(), r()].map((x) => x.toFixed(8));
    const r2 = mulberry32(12345);
    assert.deepEqual([r2(), r2(), r2()].map((x) => x.toFixed(8)), seq);
    const rng = createRng(1);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.deepEqual(createRng(1).shuffle(arr), rng.shuffle(arr));
    assert.equal(arr.join(), '1,2,3,4,5,6,7,8', 'shuffle must not mutate');
  });
});

// ------------------------------------------------------------------------------------------ robustness
describe('robustness', () => {
  test('emoji and unicode survive', () => {
    const t = "We're thrilled 🎉 to announce our café's new menu — crème brûlée, jalapeño poppers, and 寿司! Moreover, it's a game-changer. Ünïcödé façade naïve résumé.";
    const r = humanize(t, { seed: 3 });
    for (const s of ['🎉', 'café', 'crème brûlée', 'jalapeño', '寿司', 'Ünïcödé', 'façade', 'naïve', 'résumé']) assert.ok(r.text.includes(s), s);
    assert.ok(!r.text.includes(''), 'no placeholder leaks');
  });

  test('odd inputs do not throw and leak no placeholders', () => {
    const odd = [
      'a', '.', '...', '?!', '—', '— — —', '""', '"unclosed quote', '((((', '**bold** _it_', '# ', '- ', '1.',
      ' private use', 'x'.repeat(5000), 'word '.repeat(3000), '🎉'.repeat(200),
      'e.g. i.e. U.S. Dr. Mr. vs. etc.', '```\ncode\n```', '`a` `b`', 'http://x.y/z?q=1&r=2#h', '\r\nWindows\r\nlines\r\n',
      'ALL CAPS SHOUTING TEXT HERE. MORE OF IT.', '1,2,3,4,5', '$$$ %%% ###', 'Ü'.repeat(100),
    ];
    for (const t of odd) {
      for (const strength of STRENGTHS) {
        const r = humanize(t, { strength, seed: 1 });
        assert.equal(typeof r.text, 'string');
        assert.ok(!/[-]/.test(r.text) || /[-]/.test(t), `placeholder leak for ${JSON.stringify(t.slice(0, 20))}`);
        assert.equal(r.error, undefined, `internal error for ${JSON.stringify(t.slice(0, 20))}: ${r.error}`);
      }
    }
  });

  test('private-use characters in the input are preserved', () => {
    const t = 'Keep  and  exactly. Moreover, delve into it.';
    const r = humanize(t, { seed: 2 });
    assert.ok(r.text.includes(''));
    assert.ok(r.text.includes(''));
  });

  test('CRLF line endings are preserved', () => {
    const t = 'Moreover, this is a robust tool.\r\n\r\nFurthermore, it is seamless.';
    const r = humanize(t, { seed: 1 });
    assert.ok(r.text.includes('\r\n\r\n'));
    assert.ok(!/[^\r]\n/.test(r.text));
  });

  test('100k-character input is processed in under 1500ms', () => {
    let big = '';
    while (big.length < 100000) big += FIVE_PARAGRAPHS + '\n\n';
    big = big.slice(0, 100000);
    const t0 = performance.now();
    const r = humanize(big, { seed: 9 });
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `took ${Math.round(ms)}ms`);
    assert.ok(r.text.length > 50000);
    const one = big.replace(/\n+/g, ' ');
    const t1 = performance.now();
    humanize(one, { seed: 9 });
    assert.ok(performance.now() - t1 < 1500, 'single-line 100k too slow');
  });
});

// ------------------------------------------------------------------------------------------ preservation
describe('protected spans are preserved exactly', () => {
  const RICH =
    'Moreover, visit https://inkling.app/pricing?plan=pro&ref=abc or email hello@inkling.app today. ' +
    'Our robust plan costs $49.99/mo, saves 37.5% on average, and shipped v2.4.1 on 12/05/2024 at 10:30am. ' +
    'Follow @inklingHQ and use #AIwriting for updates. Run `npm run build` to delve into the code. ' +
    'As one customer put it, "This tool is a game-changer — seriously." It is a testament to the team.';

  test('URLs, emails, numbers, prices, percentages, versions, dates, handles, tags, inline code, quotes', () => {
    for (const strength of STRENGTHS) {
      for (const tone of TONES) {
        const out = humanize(RICH, { tone, strength, seed: 4 }).text;
        for (const s of [
          'https://inkling.app/pricing?plan=pro&ref=abc', 'hello@inkling.app', '$49.99', '37.5%', 'v2.4.1', '12/05/2024',
          '10:30am', '@inklingHQ', '#AIwriting', '`npm run build`', '"This tool is a game-changer — seriously."',
        ]) {
          assert.ok(out.includes(s), `${tone}/${strength} lost ${s}\n${out}`);
        }
      }
    }
  });

  test('fenced code blocks are untouched', () => {
    const md = 'Moreover, here is the robust snippet:\n\n```js\n// Moreover, delve into this — seamless\nconst x = leverage(1);  // utilize\n```\n\nFurthermore, it is seamless.';
    const out = humanize(md, { seed: 1, strength: 'aggressive' }).text;
    assert.ok(out.includes('```js\n// Moreover, delve into this — seamless\nconst x = leverage(1);  // utilize\n```'));
  });

  test('proper nouns and acronyms are never synonym-swapped', () => {
    const t = 'We partnered with Bright Horizons and the NASA team. The partnership was huge, and HubSpot noticed quickly.';
    for (let seed = 1; seed <= 6; seed++) {
      const out = humanize(t, { seed, strength: 'aggressive' }).text;
      for (const s of ['Bright Horizons', 'NASA', 'HubSpot']) assert.ok(out.includes(s), `${s} missing: ${out}`);
    }
  });

  test('markdown headings, lists, blockquotes and paragraph breaks are preserved', () => {
    const md = `# The Ultimate Guide to Email Marketing

## Why it matters

Email marketing remains one of the most effective channels. Moreover, it is a robust way to delve into customer needs.

- Leverage segmentation to boost open rates
- Utilize A/B testing
* Craft compelling subject lines

1. Build your list
2. Send consistently

> It is important to note that results vary.

In conclusion, email is a game-changer.`;
    for (const strength of STRENGTHS) {
      const out = humanize(md, { strength, seed: 5 }).text;
      const lines = out.split('\n');
      const inLines = md.split('\n');
      assert.equal(lines.length, inLines.length, 'line count changed');
      for (let i = 0; i < inLines.length; i++) {
        const prefix = (inLines[i].match(/^(#{1,6} |- |\* |\d+\. |> )/) || [''])[0];
        assert.ok(lines[i].startsWith(prefix), `line ${i} lost prefix "${prefix}": ${lines[i]}`);
        assert.equal(lines[i] === '', inLines[i] === '', `blank line ${i} changed`);
      }
      assert.equal(lines[0], '# The Ultimate Guide to Email Marketing');
    }
  });
});

// ------------------------------------------------------------------------------------------ output quality
describe('output hygiene', () => {
  test('no em dashes in output', () => {
    for (const o of OUTPUTS) assert.ok(!/—/.test(o.text), `em dash in ${o.tone}/${o.strength}: ${o.text}`);
  });

  test('no double spaces', () => {
    for (const o of OUTPUTS) assert.ok(!/[^\s] {2,}[^\s]/.test(o.text), `double space: ${o.text.match(/.{20} {2,}.{20}/)}`);
  });

  test('every sentence starts with a capital letter', () => {
    for (const o of OUTPUTS) {
      for (const line of o.text.split('\n')) {
        for (const s of splitSentences(line)) {
          const m = s.text.match(/^[\s*_"“'‘(\[#>\-0-9.]*(\p{L})/u);
          if (!m) continue;
          assert.ok(m[1] === m[1].toUpperCase(), `lowercase start "${s.text.slice(0, 40)}" in ${o.tone}/${o.strength}`);
        }
      }
    }
  });

  test('a/an agreement', () => {
    const bad = /\b(a)\s+(?:apple|banana-no)\b|\ba\s+(?:[aeio][a-z]+)\b|\ban\s+(?:[bcdfgjklmnpqrstvwxz][a-z]+)\b/gi;
    for (const o of OUTPUTS) {
      const hits = (o.text.match(bad) || []).filter((h) => !/\ban\s+(?:hour|honest|honou?r|heir|herb)/i.test(h) && !/\ba\s+(?:one|once|eu|uni|use|usu|uti)/i.test(h));
      assert.deepEqual(hits, [], `article errors in ${o.tone}/${o.strength}: ${hits}`);
    }
    const r = humanize('She ate a apple and an banana. It was a honest mistake, an useful one.', { seed: 1 }).text;
    assert.ok(!/\ba apple\b|\ban banana\b/i.test(r), r);
  });

  test('no doubled words', () => {
    for (const o of OUTPUTS) {
      const m = o.text.match(/\b(\w+)\s+\1\b/gi) || [];
      const bad = m.filter((x) => !/^(that that|had had)$/i.test(x));
      assert.deepEqual(bad, [], `doubled words: ${bad}`);
    }
  });

  test('no orphan or doubled punctuation', () => {
    for (const o of OUTPUTS) {
      assert.ok(!/,\s*[,.!?;:]/.test(o.text), `bad punctuation run: ${o.text.match(/.{15},\s*[,.!?;:].{5}/)}`);
      assert.ok(!/(?<!\.)\.\.(?!\.)/.test(o.text), 'double period');
      assert.ok(!/ [,.;:!?]/.test(o.text), 'space before punctuation');
    }
  });

  test('typical AI clichés are removed', () => {
    const t =
      "In today's fast-paced world, we delve into a rich tapestry of ideas. Let's delve deeper into the landscape. " +
      'It is a testament to our robust, seamless, cutting-edge platform. Moreover, it plays a pivotal role in our journey.';
    for (const strength of ['balanced', 'aggressive']) {
      for (let seed = 1; seed <= 5; seed++) {
        const out = humanize(t, { strength, seed }).text;
        for (const re of [/\bdelve\b/i, /tapestry/i, /in today's fast-paced world/i, /\btestament\b/i, /\bmoreover\b/i, /seamless/i, /cutting-edge/i, /pivotal/i]) {
          assert.ok(!re.test(out), `${re} survived (${strength}, seed ${seed}): ${out}`);
        }
      }
    }
    const light = humanize("In today's fast-paced world, we delve into a rich tapestry of ideas.", { strength: 'light', seed: 1 }).text;
    assert.ok(!/delve|tapestry/i.test(light), light);
  });

  test('burstiness: sentence-length CV rises for a typical AI paragraph', () => {
    const inCV = cv(sentenceLengths(AI_BLOG));
    let better = 0;
    const seeds = [1, 2, 3, 4, 5, 6];
    for (const seed of seeds) {
      const out = humanize(AI_BLOG, { seed }).text;
      if (cv(sentenceLengths(out)) > inCV) better++;
    }
    assert.ok(better >= 5, `CV improved for only ${better}/${seeds.length} seeds`);
    const multi = humanize(FIVE_PARAGRAPHS, { seed: 1, strength: 'aggressive' }).text;
    assert.ok(cv(sentenceLengths(multi)) > cv(sentenceLengths(FIVE_PARAGRAPHS)));
  });

  test('meaning-bearing tokens survive (numbers, names, negations)', () => {
    const t = 'Revenue did not grow in 2023. Acme Corp cut prices by 15%, but churn rose to 8%. We cannot ignore that.';
    for (let seed = 1; seed <= 5; seed++) {
      const out = humanize(t, { seed, strength: 'aggressive' }).text;
      for (const s of ['2023', 'Acme Corp', '15%', '8%']) assert.ok(out.includes(s), s);
      assert.ok(/\b(not|n't)\b|n't/.test(out), `negation lost: ${out}`);
    }
  });

  test('academic tone avoids contractions and slang', () => {
    const t = 'It is important to note that we do not know. They are testing it. You will see that it is not simple, and it is a game-changer.';
    const out = humanize(t, { tone: 'academic', seed: 2 }).text;
    assert.ok(!/\b(don't|they're|you'll|it's|isn't)\b/i.test(out), out);
    assert.ok(!/\b(honestly|look,|a ton of|ditch)\b/i.test(out), out);
  });

  test('casual tone contracts freely', () => {
    const t = 'I am sure you will like it. It is not hard, and they are ready. We do not need more.';
    const out = humanize(t, { tone: 'casual', seed: 1 }).text;
    assert.ok((out.match(/['’](m|ll|s|re|t)\b/g) || []).length >= 3, out);
  });

  test('never contracts at the end of a clause', () => {
    const out = humanize("That is what it is. I know who they are. Here it is.", { tone: 'casual', seed: 1, strength: 'aggressive' }).text;
    assert.ok(/what it is\./.test(out) && /who they are\./.test(out), out);
  });

  test('UK and US spelling options', () => {
    const t = 'Our color palette helps you organize and optimize your favorite center of gravity.';
    const uk = humanize(t, { spelling: 'uk', seed: 1, strength: 'light' }).text;
    assert.ok(/colour/.test(uk) && /organis/.test(uk) && /favourite/.test(uk) && /centre/.test(uk), uk);
    const us = humanize('The colour of the organisation’s favourite centre.', { spelling: 'us', seed: 1, strength: 'light' }).text;
    assert.ok(/color/.test(us) && /organization/.test(us) && /favorite/.test(us) && /center/.test(us), us);
  });

  test('all tones x strengths run on a 5-paragraph sample', () => {
    for (const tone of TONES) {
      for (const strength of STRENGTHS) {
        const r = humanize(FIVE_PARAGRAPHS, { tone, strength, seed: 11 });
        assert.equal(r.error, undefined, `${tone}/${strength}: ${r.error}`);
        assert.equal(r.text.split('\n\n').length, 5, `${tone}/${strength} paragraph count`);
        assert.ok(r.changes > 3, `${tone}/${strength} made only ${r.changes} changes`);
        assert.ok(r.stats.outputWords > r.stats.inputWords * 0.7, 'too much text removed');
      }
    }
  });
});

// ------------------------------------------------------------------------------------------ detector
describe('detect()', () => {
  test('scores a typical AI paragraph higher than its humanized version', () => {
    for (const text of [AI_PARAGRAPH, AI_BLOG, FIVE_PARAGRAPHS]) {
      const ai = detect(text).score;
      for (const seed of [1, 2, 3]) {
        const hz = detect(humanize(text, { seed }).text).score;
        assert.ok(ai > hz, `AI ${ai} <= humanized ${hz}`);
      }
    }
  });

  test('scores AI text higher than a human sample', () => {
    assert.ok(detect(AI_PARAGRAPH).score > detect(HUMAN_SAMPLE).score);
    assert.ok(detect(AI_PARAGRAPH).score >= 70);
    assert.ok(detect(HUMAN_SAMPLE).score < 35);
  });

  test('empty / tiny input', () => {
    assert.equal(detect('').score, 0);
    assert.equal(detect('Hi').label, 'Likely human');
  });

  test('per-sentence scores highlight the clichéd sentence', () => {
    const t = 'I fed the cat at six. Moreover, our robust platform seamlessly empowers teams to unlock their full potential. Then I went to bed.';
    const d = detect(t);
    const sorted = d.sentences.slice().sort((a, b) => b.ai - a.ai);
    assert.ok(/robust platform/.test(sorted[0].text));
  });
});

// ------------------------------------------------------------------------------------------ diff
describe('diffWords()', () => {
  const pairs = [
    ['', ''],
    ['same text', 'same text'],
    ['', 'added'],
    ['removed', ''],
    ['The quick brown fox jumps.', 'The fast brown fox leaps over.'],
    [AI_BLOG, humanize(AI_BLOG, { seed: 1 }).text],
    [FIVE_PARAGRAPHS, humanize(FIVE_PARAGRAPHS, { seed: 2, strength: 'aggressive' }).text],
    ['a  b\n\nc\td', 'a b\nc d e'],
  ];
  test('round-trips: same+add == b and same+del == a', () => {
    for (const [a, b] of pairs) {
      const d = diffWords(a, b);
      assert.equal(d.filter((x) => x.type !== 'del').map((x) => x.text).join(''), b);
      assert.equal(d.filter((x) => x.type !== 'add').map((x) => x.text).join(''), a);
      for (const seg of d) assert.ok(['same', 'add', 'del'].includes(seg.type) && seg.text.length > 0);
    }
  });

  test('long inputs (> 6000 tokens) stay fast and still round-trip', () => {
    let a = '';
    while (a.length < 120000) a += FIVE_PARAGRAPHS + '\n\n';
    const b = humanize(a, { seed: 3 }).text;
    const t0 = performance.now();
    const d = diffWords(a, b);
    assert.ok(performance.now() - t0 < 1500);
    assert.equal(d.filter((x) => x.type !== 'del').map((x) => x.text).join(''), b);
    assert.equal(d.filter((x) => x.type !== 'add').map((x) => x.text).join(''), a);
  });

  test('marks changed words', () => {
    const d = diffWords('We leverage data.', 'We use data.');
    assert.ok(d.some((x) => x.type === 'del' && /leverage/.test(x.text)));
    assert.ok(d.some((x) => x.type === 'add' && /use/.test(x.text)));
  });
});

// ------------------------------------------------------------------------------------------ building blocks
describe('sentence segmentation', () => {
  const cases = [
    ['Dr. Smith arrived at 3 p.m. on Monday. He left early.', 2],
    ['We use tools, e.g. Figma and Notion. They help.', 2],
    ['The U.S. market grew 3.5% last year. Europe lagged.', 2],
    ['Wait... what happened? Nobody knows!', 2],
    ['He said "Stop." Then he left.', 2],
    ['Is it real?! Yes. It is.', 3],
    ['Prices rose (again). Customers left.', 2],
    ['Apple vs. Samsung is old news. Still, people care.', 2],
    ['Visit inkling.app for more. Thanks!', 2],
    ['Line one\nLine two', 2],
    ['J. K. Rowling wrote it. Everyone read it.', 2],
  ];
  for (const [t, n] of cases) {
    test(`${JSON.stringify(t)} -> ${n}`, () => assert.equal(splitSentences(t).length, n, JSON.stringify(splitSentences(t).map((s) => s.text))));
  }
  test('offsets map back to the source', () => {
    const t = '  First one.  Second one?\nThird!  ';
    for (const s of splitSentences(t)) assert.equal(t.slice(s.start, s.end), s.text);
  });
});

describe('protect()', () => {
  test('masks and restores byte-for-byte', () => {
    const store = createStore();
    const t = 'Email me@x.io, see https://a.b/c?d=1, pay $5.00 (12%) on 2024-01-02, ask @bob #tag `code` "quoted text" NASA and Google today.';
    const masked = protect(t, store);
    assert.ok(!masked.includes('me@x.io') && !masked.includes('https://') && !masked.includes('Google'));
    assert.equal(store.unmask(masked), t);
  });
});

describe('inflection', () => {
  test('inflects head verbs of replacement phrases', () => {
    assert.equal(inflectPhrase('dig into', 'd'), 'dug into');
    assert.equal(inflectPhrase('tap into', 'g'), 'tapping into');
    assert.equal(inflectPhrase('fine-tune', 'd'), 'fine-tuned');
    assert.equal(inflectPhrase('simplify', 's'), 'simplifies');
    assert.equal(inflectPhrase('make use of', 's'), 'makes use of');
  });
  test('verb clichés keep their tense', () => {
    const out = humanize('The team delved into the data. She leverages AI daily. They are utilizing every tool.', { seed: 1 }).text;
    assert.ok(!/delve|leverag|utiliz/i.test(out), out);
    assert.ok(/\b(dug|looked|explored)\b/.test(out), out);
  });
});
