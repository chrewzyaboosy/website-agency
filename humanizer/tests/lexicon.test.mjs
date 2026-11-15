// Integrity checks for engine/lexicon.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getClicheRules, CLICHE_DATA, SYNONYMS, CONTRACTIONS, TONE_PACKS, OPENER_CUES, US_TO_UK, UK_TO_US } from '../engine/lexicon.js';
import { humanize } from '../engine/index.js';

const rules = getClicheRules();
const strip = (a) => a.replace(/^[~^]/, '').replace(/\|[bsdg]+$/, '').replace(/\{\d\}/g, 'thing');

test('lexicon sizes meet the bar', () => {
  assert.ok(CLICHE_DATA.length >= 200, `${CLICHE_DATA.length} cliché patterns`);
  assert.ok(SYNONYMS.size >= 400, `${SYNONYMS.size} synonym headwords`);
  assert.ok(US_TO_UK.size >= 150, `${US_TO_UK.size} spelling pairs`);
  assert.ok(CONTRACTIONS.length >= 30);
  for (const tone of ['natural', 'casual', 'professional', 'marketing', 'academic']) assert.ok(TONE_PACKS[tone], tone);
});

test('every cliché regex compiles, is global + case-insensitive, and has a usable alternative', () => {
  for (const r of rules) {
    assert.ok(r.re instanceof RegExp && r.re.flags.includes('g') && r.re.flags.includes('i'), String(r.re));
    assert.ok(r.alts.length > 0, String(r.re));
    // at least one alternative must work for every tone (no tone-flag)
    assert.ok(r.alts.some((a) => !/^[~^]/.test(a)), `no tone-neutral alternative for ${r.re}`);
  }
});

test('cliché patterns do not match inside other words', () => {
  const probe = 'unleveraged prerobust seamlessness delvesome utilizationist realmish';
  const hits = rules.filter((r) => {
    r.re.lastIndex = 0;
    return r.re.test(probe);
  });
  assert.deepEqual(hits.map((r) => String(r.re).slice(0, 60)), []);
});

test('replacements never re-introduce a cliché (no ping-pong)', () => {
  const offenders = [];
  for (const r of rules) {
    for (const a of r.alts) {
      const alt = strip(a);
      if (!alt) continue;
      for (const other of rules) {
        other.re.lastIndex = 0;
        if (other.tier <= 2 && other.re.test(` ${alt} `)) offenders.push(`${alt}  <=  ${String(other.re).slice(0, 50)}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('synonym alternatives are not AI clichés themselves', () => {
  const offenders = [];
  for (const [head, e] of SYNONYMS) {
    assert.ok(e.alts.length > 0, head);
    for (const a of e.alts) {
      const alt = strip(a);
      assert.notEqual(alt.toLowerCase(), head, `${head} maps to itself`);
      for (const r of rules) {
        r.re.lastIndex = 0;
        if (r.tier <= 2 && r.re.test(` ${alt} `)) offenders.push(`${head} -> ${alt}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('tone-pack phrases are not counted as AI phrases', () => {
  const all = Object.values(TONE_PACKS).flatMap((p) => [...p.openers, ...p.fragments, ...p.endTags]);
  for (const phrase of all) {
    for (const r of rules) {
      r.re.lastIndex = 0;
      assert.ok(!r.re.test(phrase), `${phrase} matches ${r.re}`);
    }
  }
  for (const o of Object.values(TONE_PACKS).flatMap((p) => p.openers)) assert.ok(OPENER_CUES[o], `missing cue for ${o}`);
});

test('spelling tables are inverse of each other', () => {
  for (const [us, uk] of US_TO_UK) assert.equal(UK_TO_US.get(uk), us);
  for (const w of ['analyses', 'program', 'check', 'tire', 'license', 'practice', 'story', 'meter']) {
    assert.ok(!US_TO_UK.has(w) && !UK_TO_US.has(w), `${w} must not be converted`);
  }
});

test('representative cliché rewrites read correctly', () => {
  const cases = [
    ['She leverages data daily.', /\b(uses|makes use of|taps into|draws on) data\b/],
    ['We delved into the numbers.', /\b(dug|looked|explored)\b/],
    ['It plays a crucial role in growth.', /\b(matters a lot|makes a big difference|counts for a lot|carries real weight) in growth/],
    ['This is a testament to our team.', /\b(says a lot about|speaks volumes about|reflects well on) our team/],
    ["In today's fast-paced world, brands must adapt.", /^(These days|Today|Right now|Brands)\b/],
    ['Our platform seamlessly integrates with Slack.', /\b(smoothly|easily|cleanly|neatly) integrates\b/],
  ];
  for (const [input, re] of cases) {
    for (let seed = 1; seed <= 4; seed++) {
      const out = humanize(input, { seed, strength: 'light' }).text;
      assert.ok(re.test(out), `${input} -> ${out}`);
    }
  }
});
