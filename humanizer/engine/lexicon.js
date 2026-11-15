// Curated language data for the Inkling engine.
//
// Contents
//   CLICHE_DATA      AI-cliché patterns -> natural replacements (compiled lazily by getClicheRules()).
//   SYNONYMS         safe, context-robust single-word swaps (parsed from SYNONYM_TEXT).
//   CONTRACTIONS     expansion -> contraction rules.
//   TONE_PACKS       per-tone openers / framing fragments / end tags.
//   US_TO_UK, UK_TO_US spelling tables.
//   NAME_BLOCK       capitalised words that must never be lower-cased (names, brands, places).
//
// Replacement alternative syntax (cliché + verb entries):
//   ''          delete the phrase (only at sentence start unless the entry sets delMid)
//   '^text'     informal: not used for the professional / academic tones
//   '~text'     slangy: only for casual / marketing tones
//   'text|bsg'  (verb entries) only for these source forms: b=base, s=3rd-person, d=-ed, g=-ing
//   '{1}'       first extra capture group of the pattern
// Tiers: 1 = glaring AI tell (all strengths), 2 = common tell (balanced+), 3 = mild (aggressive only).

import { verbForms } from './inflect.js';
import { zipf } from './freq.js';

const CLICHE_DATA = [];
const P = (tier, src, alts, opt = {}) => CLICHE_DATA.push({ tier, src, alts, ...opt });
const V = (tier, verb, tail, alts, opt = {}) => CLICHE_DATA.push({ tier, verb, tail, alts, ...opt });

const GRADABLE = '(?<=\\b(?:more|most|less|least|very|so|too|increasingly|especially|particularly|extremely|really|absolutely|incredibly|quite|how) )';
const DESCR = '(?:true |powerful |living |lasting |clear |real |shining |remarkable )?';

// ---------------------------------------------------------------- multi-word framing & openers
P(1, 'nothing short of (?:transformative|life-changing|remarkable|extraordinary)', ['life-changing', 'genuinely life-changing']);
P(1, 'nothing short of (?:amazing|incredible|spectacular|phenomenal)', ['amazing', 'genuinely amazing']);
P(1, "in today's (?:fast-paced|ever-changing|ever-evolving|rapidly evolving|rapidly changing|modern|digital|competitive|hyper-connected|hyperconnected|busy|increasingly digital|data-driven|tech-driven|interconnected|dynamic|digital-first|always-on|crowded|noisy|technology-driven) (?:world|landscape|era|age|environment|marketplace|market|economy|business landscape|digital landscape|business world|society|climate|business environment),?", ['these days,', 'today,', 'right now,', '']);
P(1, "in today's world,?", ['these days,', 'today,', 'nowadays,', '']);
P(1, "in (?:the|this|our) (?:digital|modern|information|internet|social media|current) (?:age|era),?", ['these days,', 'today,', 'now,']);
P(1, "in this day and age,", ['these days,', 'today,', 'nowadays,']);
P(1, 'in this day and age', ['these days', 'today', 'nowadays']);
P(1, 'in an (?:era|age) (?:where|when|in which)', ['at a time when', 'in a time when', 'now that']);
P(1, 'in an (?:era|age) (?:of|defined by|marked by)', ['at a time of', 'in a time of']);
P(2, 'in a world where', ['at a time when', 'now that']);
P(2, 'in a world (?:full of|filled with|of)', ['amid']);
P(2, 'the digital age', ['the internet age', 'the age of the internet']);
P(1, 'in the (?:ever-evolving |ever-changing |fast-paced |rapidly changing |modern )?digital (?:landscape|realm|world|sphere|space)', ['online', 'in the online world']);
P(1, 'in the (?:ever-evolving|ever-changing|fast-paced|rapidly changing|competitive|dynamic|modern|crowded) (?:business |marketing |tech |media )?landscape', ['in the market', 'in this market']);
P(1, 'in the (?:ever-evolving |ever-changing |fast-paced |competitive |dynamic |exciting |vast )?(?:world|realm|sphere|arena) of', ['in']);
P(1, 'the (?:ever-changing|ever-evolving|fast-paced|rapidly evolving|constantly evolving|dynamic) (?:world|landscape|realm) of', ['the world of', 'the fast-moving world of']);
P(1, 'within the realm of possibility', ['possible', 'on the table']);
P(1, 'the realm of', ['the world of', 'the field of']);
P(1, 'realms', ['areas', 'fields', 'worlds']);
P(1, 'realm', ['area', 'field', 'world']);
P(2, 'landscapes', ['scenes', 'markets'], { post: '(?! (?:photograph|architect|design|paint))' });
P(2, 'landscape', ['world', 'scene', 'space', 'market'], { post: '(?! (?:photograph|architect|design|paint|mode|orientation|format))' });
P(1, 'ever-(?:evolving|changing)', ['constantly changing', 'fast-moving', 'shifting']);
P(2, 'rapidly (?:evolving|changing)', ['fast-changing', 'fast-moving', 'quickly changing']);
P(2, 'constantly evolving', ['always changing', 'fast-changing']);
P(2, 'ever-(?:growing|expanding)', ['growing', 'expanding', 'constantly growing']);
P(2, 'ever-increasing', ['rising', 'growing', 'mounting']);
P(2, 'fast-paced', ['fast-moving', 'hectic', 'busy']);
P(2, 'now more than ever,', ['more than ever,', 'especially now,', 'right now,']);
P(2, 'now more than ever', ['more than ever', 'especially now']);
P(2, 'as we look (?:to|toward|towards) the future,', ['looking ahead,', 'going forward,']);
P(3, 'moving forward,', ['from here,', 'going forward,', 'from now on,']);
P(2, 'in the grand scheme of things', ['in the big picture', 'all things considered']);
P(1, 'imagine a world where', ['picture a world where', 'think of a world where']);

// ---------------------------------------------------------------- sentence adverbials
P(1, 'moreover,', ['also,', '^plus,', 'on top of that,', "what's more,", '']);
P(1, 'furthermore,', ['also,', '^plus,', 'beyond that,', 'on top of that,', '']);
P(2, 'additionally,', ['also,', '^plus,', 'on top of that,', '']);
P(2, 'in addition,', ['also,', '^plus,', 'beyond that,', '']);
P(2, 'consequently,', ['as a result,', 'so', 'because of that,']);
P(1, 'in conclusion,', ['in short,', 'all in all,', 'to wrap up,', 'so,', '']);
P(1, 'in summary,', ['in short,', 'all in all,', 'so,', '']);
P(2, 'to sum up,', ['in short,', 'all in all,', 'so,']);
P(2, 'to summari[sz]e,', ['in short,', 'all in all,']);
P(1, 'ultimately,', ['in the end,', 'when all is said and done,', '']);
P(2, 'ultimately', [''], { delMid: true });
P(1, 'in essence,', ['basically,', 'in short,', 'at heart,']);
P(2, 'essentially,', ['basically,', 'in short,', '']);
P(2, 'most notably,', ['above all,', 'in particular,']);
P(2, 'notably,', ['in particular,', '']);
P(2, 'most notably', ['especially', 'above all']);
P(2, 'notably', ['particularly', 'especially']);
P(2, 'arguably,', ['', '^you could say']);
P(2, 'more importantly,', ['more to the point,', 'above all,']);
P(2, 'importantly,', ['just as important,', 'more to the point,', '']);
P(1, 'with that being said,', ['so,', 'still,', 'that said,']);
P(2, 'with that said,', ['so,', 'that said,']);
P(1, 'that being said,', ['still,', 'even so,', 'that said,', 'but']);
P(1, 'first and foremost,', ['first,', 'first off,', 'above all,']);
P(1, 'first and foremost', ['first', 'above all']);
P(1, 'last but not least,', ['finally,', 'lastly,', 'and finally,']);
P(2, 'needless to say,', ['']);
P(1, 'it goes without saying that', [''], { delMid: true });
P(2, 'indeed,', ['in fact,', 'sure enough,', '']);
P(2, 'indeed', [''], { delMid: true });
P(2, 'hence,', ['so', "that's why", 'this is why']);
P(3, 'hence', ['so'], { pre: '(?<=, )' });
P(2, 'thus,', ['so', 'as a result,', 'this way,']);
P(2, 'therefore,', ['so', "that's why", 'as a result,']);
P(3, 'however,', ['but', 'still,', 'even so,', 'that said,'], { startOnly: true });
P(3, 'overall,', ['all in all,', 'on the whole,', 'all told,'], { startOnly: true });
P(3, 'in a nutshell,', ['in short,', 'basically,']);
P(2, 'at its core,', ['basically,', 'at heart,', 'underneath it all,']);
P(1, 'at the end of the day,', ['in the end,', 'when all is said and done,', '']);
P(1, 'at the end of the day', ['in the end', 'when all is said and done']);
P(2, 'undoubtedly,', ['clearly,', 'no question,', 'without a doubt,']);
P(2, 'undoubtedly', ['clearly', 'certainly']);
P(2, 'as previously (?:mentioned|noted|discussed),', ['as noted,', 'again,']);
P(2, 'as (?:mentioned|noted|discussed) (?:earlier|above|before|previously),', ['as noted,', 'again,']);
P(2, 'additionally', ['also']);
P(2, 'moreover', ['also', "what's more"]);
P(2, 'furthermore', ['also', 'beyond that']);
P(3, 'firstly,', ['first,']);
P(3, 'secondly,', ['second,']);
P(3, 'thirdly,', ['third,']);
P(3, 'subsequently', ['later', 'afterward', 'then']);
P(1, 'thereby', ['in turn', ''], { delMid: true });

// ---------------------------------------------------------------- "it's important to note" family
P(1, "it(?:'s| is) (?:important|crucial|essential|vital|key|worth) (?:to )?(?:note|noting|remember|remembering|mention|mentioning|recognize|recognise|recognizing|understand|highlight|emphasize|emphasise|point out|keep in mind|bear in mind|consider|acknowledge) that", ['', '', 'note that'], { delMid: true });
P(1, 'it should be noted that', [''], { delMid: true });
P(1, "it(?:'s| is) worth (?:noting|mentioning|pointing out|highlighting|remembering) that", ['', 'note that'], { delMid: true });
P(1, "(?:it's|it is) no secret that", ['', 'everyone knows'], { delMid: true });
P(1, "there(?:'s| is) no denying that", ['', 'clearly,'], { delMid: true });
P(2, "it(?:'s| is) clear that", ['clearly,', ''], { delMid: true });
P(2, "it(?:'s| is) (?:essential|crucial|vital|imperative|paramount) to", ['it pays to', "it's key to", '^you need to']);
P(2, "it(?:'s| is) (?:essential|crucial|vital|imperative) that", ["it's key that", 'it matters that']);
P(1, 'the (?:importance|value|significance|power|role) of ([^.;:!?]{3,80}?) (?:cannot|can\'t) be overstated', ['{1} matters more than most people think', "it's hard to overstate how much {1} matters"]);
P(1, 'cannot be overstated', ['is huge', 'matters a lot', 'is hard to exaggerate']);
P(1, "can(?:'t|not) be understated", ['is huge', 'matters a lot']);

// ---------------------------------------------------------------- whether / when it comes to / look no further
P(2, "whether you(?:'re| are) looking to", ['if you want to', 'if you hope to']);
P(1, "whether you(?:'re| are)", ["if you're"]);
P(1, "whether it(?:'s| is)", ['be it', "if it's"]);
P(1, 'when it comes to', ['with', 'for', 'as for'], { startOnly: true });
P(1, 'when it comes to', ['with', 'in terms of', 'for']);
P(1, 'look no further than', ['try', 'check out', 'consider']);
P(1, 'look no further[.!]', ["you've found it.", 'this is it.', "you're in the right place."]);
P(1, 'look no further', ["you've found it", 'this is it']);

// ---------------------------------------------------------------- delve / dive / deep dive
P(1, "let's (?:delve|dive) (?:deeper |right )?into", ["let's look at", "let's dig into", "here's a look at"]);
P(1, "let's (?:delve|dive) (?:right )?in", ["let's get into it", "let's get started"]);
V(1, 'delve', ' deeper into', ['dig deeper into', 'look closer at', 'go further into']);
V(1, 'delve', ' deep into', ['dig deep into', 'get deep into']);
V(1, 'delve', ' into', ['dig into', 'look into', 'get into', 'explore']);
V(1, 'delve', ' deeper', ['dig deeper', 'go further', 'look closer']);
V(1, 'delve', '', ['dig in', 'look closer']);
P(2, '(?:a )?deep[- ]dive into', ['a close look at', 'a detailed look at']);
P(2, 'deep[- ]dives', ['close looks', 'detailed looks']);
P(2, 'deep[- ]dive', ['close look', 'detailed look']);
V(2, 'dive', ' (?:deep |deeper )?into', ['dig into', 'get into', 'jump into'], { forms: { d: ['dived', 'dove'] } });

// ---------------------------------------------------------------- tapestry / testament / beacon & co
P(1, 'an? (?:rich |vibrant |intricate |complex |diverse |colou?rful |beautiful |fascinating )?tapestry of', ['a mix of', 'a blend of', 'a patchwork of']);
P(1, 'the (?:rich |vibrant |intricate |complex |diverse |colou?rful |beautiful |fascinating )?tapestry of', ['the mix of', 'the blend of', 'the patchwork of']);
P(1, 'tapestry', ['mix', 'blend', 'patchwork']);
V(1, 'stand', ` as an? ${DESCR}testament to`, ['say a lot about', 'reflect well on']);
V(1, 'serve', ` as an? ${DESCR}testament to`, ['say a lot about', 'reflect well on']);
P(1, `is an? ${DESCR}testament to`, ['says a lot about', 'speaks volumes about', 'reflects well on']);
P(1, `are an? ${DESCR}testament to`, ['say a lot about', 'speak volumes about', 'reflect well on']);
P(1, `(?:was|were) an? ${DESCR}testament to`, ['said a lot about', 'reflected well on']);
P(1, `an? ${DESCR}testament to`, ['proof of', 'a sign of', 'a reminder of']);
P(1, 'testament', ['proof', 'sign'], { post: '(?! to)' });
P(1, 'testament to', ['proof of', 'a sign of']);
P(1, 'an? beacon of', ['a symbol of', 'a model of', 'an example of']);
P(1, 'an? symphony of', ['a mix of', 'a blend of']);
P(1, 'an? labyrinth of', ['a maze of', 'a tangle of']);
P(1, 'an? treasure trove of', ['a goldmine of', '~a ton of', 'a gold mine of']);
P(1, 'treasure trove', ['goldmine', 'gold mine']);
P(1, 'an? hidden gem', ['a well-kept secret', 'a great find']);
P(1, 'hidden gems', ['well-kept secrets', 'great finds']);
P(1, 'an? (?:rich )?(?:and storied |and diverse |and fascinating )?rich history', ['a long history', 'a deep history', 'a storied past']);
P(1, 'an? rich (?:and storied |and diverse |and fascinating )?history', ['a long history', 'a deep history', 'a storied past']);
P(1, 'rich history', ['long history', 'deep history']);
P(1, 'an? cornerstone of', ['a pillar of', 'a big part of', 'the backbone of']);
P(1, 'the cornerstone of', ['the foundation of', 'the backbone of']);
P(1, 'cornerstone', ['foundation', 'backbone', 'bedrock']);
P(1, 'linchpin', ['anchor', 'centerpiece', 'key piece']);
P(2, '(?:right )?in the (?:very )?heart of', ['in the middle of', 'right in the middle of']);
P(2, 'at the (?:very )?heart of', ['at the center of', 'at the core of']);

// ---------------------------------------------------------------- navigate / leverage / utilize / harness / unlock
V(1, 'navigate', ' (?:the )?(complexities|complexity|challenges|intricacies|nuances|maze|ins and outs|twists and turns|uncertainties|pitfalls) of', ['work through the {1} of', 'deal with the {1} of', 'get a handle on the {1} of']);
V(1, 'navigate', ' the (?:world|waters) of', ['find your way in', 'get around in', 'make sense of']);
V(2, 'navigate', '(?= (?:these|the|this|those|such|any|complex|new|uncertain|difficult|tricky|changing|today|life|it|them)\\b)(?! (?:the |this |our |your |a )?(?:site|website|app|page|menu|interface|dashboard|platform|map|streets|city|area|portal|store|aisles|building|campus|terrain|roads?|trail)\\b)', ['handle', 'work through', 'deal with', 'get through']);
V(3, 'navigate', ' to', ['go to', 'head to']);
V(1, 'leverage', '', ['use', 'make use of', 'tap into', 'draw on'], { only: 'b', pre: "(?<=\\b(?:to|can|could|will|would|should|must|may|might|and|or|you|we|they|i|let's|easily|fully|better|also|then|just|quickly|actively|effectively|simply) )" });
V(1, 'leverage', '', ['use', 'make use of', 'tap into', 'draw on'], { only: 'sdg' });
V(1, 'utilize', '', ['use']);
P(1, 'utili[sz]ation', ['use']);
V(1, 'harness', ' the (?:full |true |real )?power of', ['tap into', 'make the most of', 'use']);
V(2, 'harness', '', ['use', 'tap', 'channel']);
V(1, 'unlock', ' (?:the )?(?:full |true |hidden |real )?potential of', ['get the most out of', 'make the most of', 'get more out of']);
V(1, 'unlock', ' (your|their|its|our|his|her|my) (?:full |true |hidden |real )?potential', ['reach {1} full potential', 'live up to {1} potential', 'tap into {1} potential']);
P(1, 'the key to unlocking', ['the key to', 'the secret to']);
V(2, 'unlock', '(?= (?:new |more |fresh |hidden |valuable |real |deeper )?(?:opportunities|possibilities|doors|growth|insights|value|revenue|savings|features|benefits|ideas|creativity|efficiency|performance|results|success))', ['open up', 'tap into']);
V(3, 'unlock', '', ['open up', 'tap into']);

// ---------------------------------------------------------------- verbs
V(1, 'elevate', ' your ((?:[a-z]+ ){0,2})game', ['up your {1}game', 'raise your {1}game']);
V(1, 'elevate', '', ['improve', 'upgrade', 'raise the bar on']);
V(1, 'embark', ' (?:on|upon) (?:a|an) (?:new |exciting |transformative |incredible )*(?:journey|chapter|adventure)(?= as\\b)', ['take on a new challenge', 'start fresh', 'start a new role']);
V(1, 'embark', ' (?:on|upon) (?:a|an|the|this|your|our|their) (?:new |exciting |transformative |incredible )?journey(?! of)', ['set out', 'get started', 'begin|bsg']);
V(1, 'embark', ' (?:on|upon)', ['start', 'begin|bsg', 'take on', 'set out on']);
P(1, 'on (?:this|your|our|their|the) (?:incredible |exciting |amazing |transformative )?journey', ['along the way', 'on this path']);
P(3, 'journey', ['path', 'road', '^ride'], { pre: "(?<!\\b(?:customer|buyer|user|customer's|buyer's|user's|hero's|road|car|train|bus|flight|long|short|day|epic|the) )" });
V(1, 'foster', '', ['build', 'encourage', 'create'], { post: '(?! (?:care|parents?|child(?:ren)?|homes?|famil(?:y|ies)|kids?|dogs?|cats?|pets?|mothers?|fathers?)\\b)' });
P(1, 'empowering (?=(?:experience|message|story|stories|moment|environment|feeling|read|book|film|journey|words)\\b)', ['uplifting ', 'encouraging ']);
V(1, 'empower', '', ['help|bsg', 'equip', 'enable|bsg']);
P(3, 'empowerment', ['autonomy', 'control']);
V(1, 'showcase', '', ['show off', 'feature', 'display', 'highlight'], { pre: '(?<!\\b(?:a|the|our|your) )' });
P(2, 'an? showcase of', ['a display of']);
P(2, 'an? showcase for', ['a stage for', 'a platform for']);
V(1, 'streamline', '', ['simplify', 'speed up|bsg', 'tighten up|bsg', 'smooth out|bsg']);
V(2, 'optimize', '', ['fine-tune', 'improve']);
P(3, '(?<!(?:engine|on-page|off-page|page|conversion rate|conversion|search|seo|site|website|mobile|price|bid|campaign) )optimi[sz]ations', ['improvements', 'tweaks']);
P(3, '(?<!(?:engine|on-page|off-page|page|conversion rate|conversion|search|seo|site|website|mobile|price|bid|campaign) )optimi[sz]ation', ['fine-tuning', 'tuning']);
V(2, 'enhance', '', ['improve', 'boost', 'upgrade', 'sharpen|bsg']);
P(2, 'enhancements', ['improvements', 'upgrades']);
P(2, 'enhancement', ['improvement', 'upgrade']);
V(1, 'boast', '', ['have', 'offer', 'feature'], { post: '(?! (?:about|of|that|to)\\b)' });
V(1, 'resonate', ' (?:deeply |strongly )?with', ['connect with', 'click with', 'land with']);
V(1, 'resonate', '', ['land', 'connect', 'hit home']);
V(1, 'underscore', '', ['highlight', 'show', 'point to', 'drive home|bsg'], { pre: '(?<!\\b(?:an|the|a) )' });
V(1, 'revolutionize', '', ['reshape', 'overhaul', 'shake up', 'change']);
V(2, 'redefine', '', ['rethink', 'reshape', 'reinvent']);
V(2, 'reimagine', '', ['rethink', 'rework', 'rebuild']);
V(1, 'unleash', '', ['release', 'free up', 'bring out', 'tap']);
V(2, 'supercharge', '', ['boost', 'power up', 'speed up']);
V(2, 'skyrocket', '(?= (?:your|their|our|the|its|his|her|sales|revenue|growth|conversions|engagement|traffic|productivity|results|roi|profits?)\\b)', ['boost', 'multiply', 'grow']);
V(2, 'skyrocket', '', ['soar', 'shoot up', 'jump']);
V(3, 'embrace', '', ['adopt', 'welcome', 'take up']);
V(2, 'captivate', '', ['grip', 'hook', 'win over']);
V(2, 'facilitate', '', ['support', 'enable', 'make room for']);
V(2, 'endeavou?r', ' to', ['try to', 'aim to', 'work to'], { forms: { b: ['endeavor', 'endeavour'], s: ['endeavors', 'endeavours'], d: ['endeavored', 'endeavoured'], g: ['endeavoring', 'endeavouring'] }, lemma: 'endeavor' });
P(2, 'endeavou?rs', ['efforts', 'projects', 'pursuits']);
P(2, 'endeavou?r', ['effort', 'project', 'attempt']);
V(2, 'commence', '', ['start', 'begin|bsg', 'kick off']);
V(2, 'ascertain', '', ['find out', 'figure out', 'work out', 'determine']);
V(2, 'garner', '', ['earn', 'win', 'attract', 'pick up']);
V(2, 'bolster', '', ['strengthen', 'boost', 'shore up', 'back up']);
V(2, 'spearhead', '', ['lead', 'drive', 'head up']);
V(1, 'pave', ' the way for', ['open the door to', 'make room for', 'clear the path for']);
V(1, 'pave', ' the way to', ['open the door to', 'clear the path to']);
V(2, 'shed', ' (?:some |new |more )?light on', ['cast light on', 'put a spotlight on'], { forms: { b: ['shed'], s: ['sheds'], d: [], g: ['shedding'] } });
V(2, 'stand', ' out from the (?:crowd|competition|rest|pack|noise)', ['get noticed', 'grab attention']);
V(3, 'stand', ' out', ['get noticed', 'shine|bs']);
V(1, 'play', ' (?:a |an )?(?:crucial|pivotal|vital|key|significant|critical|important|major|central|essential|integral|fundamental|instrumental|big|huge|decisive) role in', ['matter a lot in', 'make a big difference in', 'count for a lot in', 'carry real weight in']);
V(1, 'play', ' (?:a |an )?(?:crucial|pivotal|vital|key|significant|critical|important|major|central|essential|integral|fundamental|instrumental|decisive) (?:role|part)', ['matter a lot', 'make a big difference', 'count for a lot']);
V(2, 'serve', ' as(?= (?:a|an|the|our|your|their|its|my)\\b)', ['act as', 'work as']);
V(3, 'ensure', ' that', ['make sure']);
P(2, ', ensuring that', [', so', ', which means', ', making sure']);
V(3, 'ensure', '', ['guarantee'], { post: '(?! that\\b)' });
V(2, 'gain', ' (?:valuable |deep |deeper |key |real |actionable )?insights? into', ['learn about', 'get a read on', 'understand']);
V(3, 'unveil', '', ['reveal', 'introduce', 'launch']);
V(2, 'master', ' the art of', ['get good at|bsg', 'get better at|bsg', 'figure out', '^nail']);
V(3, 'move', ' the needle', ['make a difference', 'make a dent']);
V(3, 'transform', ' into', ['turn into', 'change into']);
V(3, 'transform', '', ['change', 'reshape', 'overhaul']);
V(3, 'reach', ' out to', ['get in touch with', 'contact']);
V(3, 'underpin', '', ['support', 'back', 'drive|bsg']);
V(3, 'strive', ' to', ['work to', 'try to', 'aim to'], { forms: { d: ['strove', 'strived'] } });

// ---------------------------------------------------------------- adjectives & adverbs
P(1, 'seamlessly', ['smoothly', 'easily', 'cleanly', 'neatly']);
P(1, 'seamless', ['smooth', 'easy', 'hassle-free']);
P(1, 'at the cutting edge of', ['leading the way in', 'out in front in', 'ahead in']);
P(1, 'cutting-edge', ['modern', 'advanced', 'leading', 'new']);
P(2, 'state-of-the-art', ['modern', 'advanced', 'high-end']);
P(2, 'best-in-class', ['top-tier', 'top-notch', 'leading']);
P(3, 'world-class', ['first-rate', 'top-notch', 'excellent']);
P(3, 'next-gen(?:eration)?', ['new', 'newer', 'modern']);
P(1, 'an? (?:real |true |total |absolute )?game[- ]changer', ['a big deal', 'a huge step forward', 'a real breakthrough', 'a major shift']);
P(1, 'game[- ]changers', ['big deals', 'breakthroughs']);
P(1, 'game[- ]changer', ['big deal', 'breakthrough']);
P(1, 'game[- ]changing', ['major', 'huge', 'big']);
P(2, 'robustness', ['strength', 'reliability', 'sturdiness']);
P(2, 'robust', ['solid', 'strong', 'reliable', 'dependable']);
P(1, `${GRADABLE}pivotal`, ['important', 'decisive']);
P(1, 'pivotal', ['key', 'central', 'decisive']);
P(1, `${GRADABLE}crucial`, ['important', 'essential']);
P(1, 'crucial', ['key', 'essential', 'important']);
P(2, `${GRADABLE}vital`, ['important', 'essential']);
P(2, 'vital', ['key', 'essential', 'critical'], { post: '(?! (?:signs?|statistics|organs?|records?)\\b)' });
P(1, 'of paramount importance', ['essential', 'critical', 'a top priority']);
P(1, '(?:is|remains) paramount', ['matters most', 'comes first', 'is essential']);
P(1, '(?:are|remain) paramount', ['matter most', 'come first', 'are essential']);
P(1, 'paramount', ['essential', 'critical', 'top-priority'], { post: '(?! (?:pictures|studios))' });
P(1, 'an? myriad of', ['countless', 'lots of', 'all sorts of']);
P(1, 'myriad', ['countless', 'many', 'endless']);
P(1, 'an? (?:whole |vast |veritable )?plethora of', ['plenty of', 'lots of', '~a ton of']);
P(1, 'plethora', ['glut', 'pile']);
P(1, 'multi-?faceted', ['complex', 'many-sided', 'layered', 'varied']);
P(1, 'holistically', ['as a whole', 'from every angle']);
P(1, 'holistic', ['well-rounded', 'big-picture', 'all-around', 'complete']);
P(1, 'synergies', ['shared gains', 'overlaps', 'combined benefits']);
P(1, 'synergistic', ['complementary', 'mutually reinforcing']);
P(1, 'synergy', ['teamwork', 'chemistry']);
P(1, 'comprehensively', ['thoroughly', 'fully', 'completely']);
P(1, 'comprehensive(?= (?:suite|range|set|list|package|platform|solution|solutions|selection|collection|portfolio|toolkit|lineup|line|offering|bundle|plan|plans|coverage|services|service|program|database|library|catalog)\\b)', ['complete', 'full']);
P(1, 'comprehensive', ['complete', 'thorough', 'detailed', 'in-depth'], { post: '(?! (?:suite|range|set|list|package|platform|solutions?|selection|collection|portfolio|toolkit|lineup|offering|bundle|plans?|coverage|services?|program|database|library|catalog)\\b)' });
P(1, 'meticulously', ['carefully', 'painstakingly', 'precisely']);
P(1, 'meticulous', ['careful', 'painstaking', 'exacting', 'thorough']);
P(1, 'intricacies', ['details', 'ins and outs', 'finer points']);
P(1, 'intricately', ['carefully', 'closely']);
P(1, 'intricate', ['complex', 'detailed', 'elaborate']);
P(1, 'vibrant colou?rs', ['bold colors', 'bright colors']);
P(1, 'vibrant', ['lively', 'energetic']);
P(1, 'bustling', ['busy', 'lively', 'crowded']);
P(1, 'commendable', ['admirable', 'impressive']);
P(1, 'nestled', ['tucked', 'set', 'tucked away']);
P(1, 'the transformative power of', ['the real power of', 'the impact of']);
P(1, 'transformative', ['powerful', 'life-changing']);
P(2, 'revolutionary', ['radical', 'bold', 'fresh']);
P(2, 'innovative', ['fresh', 'creative', 'inventive', 'original']);
P(1, 'unparalleled', ['unmatched', 'unrivaled']);
P(3, 'unprecedented(?= (?:levels?|numbers?|highs?|growth|demand|sales|profits?|traffic)\\b)', ['record']);
P(3, 'unprecedented', ['never-before-seen', 'unheard-of']);
P(2, 'invaluable', ['priceless', 'hugely useful', 'extremely valuable']);
P(2, 'indispensable', ['essential']);
P(2, '(?<=\\b(?:the|its|their|our|your|his|her|these|those) )numerous', ['many']);
P(2, 'numerous', ['many', 'lots of', 'plenty of']);
P(2, 'profoundly', ['deeply', 'hugely']);
P(2, 'an? (?:deep|profound|thorough|comprehensive|nuanced) understanding of', ['a real grasp of', 'a solid grasp of', 'a good feel for']);
P(2, 'profound', ['deep', 'major', 'far-reaching']);
P(2, 'nuanced', ['subtle', 'layered', 'careful']);
P(2, 'nuances', ['subtleties', 'finer points', 'details']);
P(3, 'dynamic', ['lively', 'energetic', 'fast-moving'], { post: '(?! (?:pricing|content|range|link|links|data|ip|pages?|websites?|programming|equilibrium|systems?|typing|duo|island|microphones?)\\b)' });
P(2, 'captivating', ['gripping', 'engaging', 'absorbing']);
P(3, 'compelling', ['convincing', 'strong', 'persuasive']);
P(3, 'insightful', ['sharp', 'thoughtful', 'eye-opening']);
P(2, 'breathtaking', ['stunning', 'gorgeous', 'striking']);
P(2, 'awe-inspiring', ['stunning', 'striking', 'humbling']);
P(3, 'curated', ['hand-picked', 'selected', 'chosen']);
P(2, 'bespoke', ['custom', 'tailor-made', 'made-to-order']);
P(3, 'tailored to(?= (?:meet|fit|suit|match|address|serve|support|help)\\b)', ['designed to', 'built to']);
P(3, 'tailored to', ['built around', 'designed for', 'shaped around']);
P(3, 'tailored(?= [a-z])', ['custom', 'personalized']);
P(3, 'effortlessly', ['easily', 'smoothly']);
P(3, 'effortless', ['easy', 'smooth', 'painless']);
P(3, 'world-renowned', ['world-famous', 'globally known']);
P(3, 'renowned for', ['famous for', 'known for', 'celebrated for']);
P(3, 'renowned', ['famous', 'well-known', 'respected']);
P(2, 'picturesque', ['pretty', 'charming', 'scenic']);
P(2, 'esteemed', ['respected', 'well-regarded']);
P(3, 'exceptional', ['excellent', 'outstanding', 'superb']);
P(2, 'impactful', ['effective', 'powerful', 'strong']);
P(3, 'meaningful', ['real', 'genuine']);
P(2, 'truly', ['really', ''], { delMid: true });
P(3, 'incredibly', ['really', 'remarkably']);
P(2, 'immensely', ['hugely', 'enormously']);
P(2, 'increasingly (?=(?:important|popular|common|difficult|complex|competitive|crowded|clear|apparent|likely|aware|concerned|expensive|relevant|valuable|digital|mobile|sophisticated|diverse|connected|interested|critical|essential|vital|prevalent|frustrated|reliant|dependent|global|saturated|demanding|skeptical|savvy|hard|easy|personal|fragmented|noisy)\\b)', ['more and more ']);
P(2, 'more than just', ['more than']);
P(3, 'foundational', ['basic', 'core', 'fundamental']);
P(2, 'imperative', ['essential', 'critical'], { post: '(?! mood)' });
P(2, 'an? integral part of', ['a core part of', 'a big part of']);
P(2, 'integral', ['central', 'core', 'essential'], { post: '(?! (?:calculus|equation|equations|part))' });
P(2, 'boundless', ['endless', 'limitless', 'huge']);
P(3, 'stellar', ['excellent', 'great', 'top-notch']);
P(3, 'heightened', ['increased', 'greater', 'sharper']);
P(2, 'seasoned (?=(?:pros?|professionals?|marketers?|experts?|veterans?|entrepreneurs?|developers?|travell?ers?|writers?|leaders?|executives?)\\b)', ['experienced ']);
P(3, 'user-friendly', ['simple', 'straightforward']);

// ---------------------------------------------------------------- noun phrases
P(1, 'an? (?:wide|broad|vast|diverse|huge|large) (?:range|variety|array|spectrum|selection) of', ['all kinds of', 'lots of', 'a broad mix of', 'plenty of', 'many']);
P(2, 'an? (?:range|variety|array|host) of', ['a mix of', 'all sorts of', 'plenty of']);
P(1, 'an? (?:array|assortment) of', ['a mix of', 'plenty of']);
P(2, 'an? (?:key|vital|crucial|essential|critical|integral|important|fundamental|core) (?:component|element|aspect|piece) of', ['a big part of', 'a core part of', 'a major part of']);
P(2, 'an? (?:key|vital|crucial|essential|critical|integral|fundamental) part of', ['a big part of', 'a core part of', 'a major part of']);
P(2, 'endless possibilities', ['plenty of options', 'lots of room to play', 'no shortage of options']);
P(2, 'an? world of possibilities', ['plenty of options', 'lots of options']);
P(2, '(?:an? world of|endless|limitless|infinite) (?:opportunities|options)', ['plenty of options', 'lots of options']);
P(2, 'the perfect (?:blend|balance|combination|mix) of', ['a good mix of', 'just the right mix of', 'a nice balance of']);
P(1, 'to the next level', ['further', 'up a notch', 'to a new level']);
P(1, 'ahead of the curve', ['ahead', 'out in front', 'ahead of the pack']);
P(1, 'an? paradigm shift', ['a big shift', 'a sea change']);
P(1, 'paradigm shift', ['big shift', 'sea change']);
P(2, 'key takeaways', ['main points', 'big lessons', 'quick lessons']);
P(2, 'key takeaway', ['main point', 'big lesson']);
P(1, 'actionable insights', ['practical insights', 'useful takeaways', 'concrete ideas']);
P(2, 'actionable', ['practical', 'usable', 'concrete']);
P(2, 'valuable insights', ['useful insights', 'real insight', 'helpful lessons']);
P(1, 'at the forefront of', ['leading the way in', 'out in front in', 'at the front of']);
P(2, 'say goodbye to', ['forget', '~ditch', 'leave behind']);
P(2, 'say hello to', ['meet', 'welcome', 'get ready for']);
P(2, 'nothing short of', ['simply']);
P(3, 'the (?:fine |subtle |delicate )?art of', ['the craft of', 'the skill of']);

// ---------------------------------------------------------------- hooks, emails, announcements
P(2, 'are you looking to', ['want to', 'looking to', 'hoping to'], { startOnly: true });
P(2, 'are you looking for', ['looking for', 'need', 'in the market for'], { startOnly: true });
P(2, 'are you ready to', ['ready to'], { startOnly: true });
P(2, 'have you ever wondered', ['ever wondered', 'ever asked yourself'], { startOnly: true });
P(2, 'did you know that', ['did you know'], { startOnly: true });
P(1, "i(?:'m| am) (?:thrilled|excited|delighted|pleased|proud|happy|humbled) to (?:announce|share)", ["I'm glad to share", 'I can finally share']);
P(1, "we(?:'re| are) (?:thrilled|excited|delighted|pleased|proud|happy) to (?:announce|share|introduce|unveil)", ["we're glad to share", 'we can finally share', 'we finally get to share']);
P(1, 'i hope (?:this|my) (?:email|e-mail|message|note|letter) finds you well', ["I hope you're doing well", "hope your week's going well", "I hope you're well"]);
P(2, 'i wanted to reach out (?:to you )?(?:regarding|about|concerning)', ["I'm writing about", "I'm getting in touch about"]);
P(2, "i(?:'m| am) reaching out (?:to you )?(?:regarding|about|concerning)", ["I'm writing about", "I'm getting in touch about"]);
P(2, 'i wanted to reach out', ['I wanted to get in touch', "I'm writing"]);
P(1, "(?:please )?(?:do not|don't) hesitate to", ['feel free to', 'please']);
P(2, "in this (?:article|blog post|post|guide|piece),? we(?:'ll| will)", ["below, we'll", "here, we'll"]);
P(2, "in this (?:article|blog post|post|guide|piece),? you(?:'ll| will) (?:learn|discover|find out)", ["below, you'll learn", "here, you'll learn"]);
P(2, "let's (?:explore|take a closer look at|take a look at|examine)", ["let's look at", "here's a look at"]);
P(3, "here's why:", ['the reason?', 'why?']);

// ---------------------------------------------------------------- wordiness (also an AI tell)
P(2, 'in order to', ['to']);
P(1, 'due to the fact that', ['because', 'since']);
P(1, 'owing to the fact that', ['because', 'since']);
P(1, 'despite the fact that', ['although', 'even though']);
P(1, 'in spite of the fact that', ['although', 'even though']);
P(1, 'in light of the fact that', ['since', 'because']);
P(2, 'given the fact that', ['given that', 'since']);
P(1, 'at this point in time', ['now', 'right now', 'at this point']);
P(2, 'in the near future', ['soon', 'before long', 'in the coming months']);
P(2, 'on a daily basis', ['daily', 'every day']);
P(2, 'on a regular basis', ['regularly', 'often']);
P(2, 'on a weekly basis', ['weekly', 'every week']);
P(2, 'on a monthly basis', ['monthly', 'every month']);
P(2, 'in a timely (?:manner|fashion)', ['promptly', 'quickly', 'on time']);
P(3, 'the (?:vast )?majority of(?= (?:the|our|your|their|these|those|its|them|us)\\b)', ['most of']);
P(3, 'the (?:vast )?majority of', ['most']);
P(2, 'an? (?:large|great|significant|huge|vast) number of', ['lots of', 'many', 'plenty of']);
P(2, 'an? (?:significant|substantial|considerable|large|great) amount of', ['a lot of', 'plenty of', 'a good deal of']);
P(2, '(?:has|have) the (?:ability|capacity) to', ['can']);
P(2, '(?:with|in) regards? to', ['about', 'on']);
P(3, 'prior to', ['before']);
P(2, 'in the event that', ['if']);
P(2, 'each and every', ['every']);
P(2, 'absolutely (?:essential|crucial|vital|critical)', ['essential', 'critical']);

export { CLICHE_DATA };

// Extra AI-style constructions used only by the detector (the humanizer rewrites them structurally).
export const AI_CONSTRUCTIONS = [
  /\bnot only\b[^.!?]{2,120}\bbut (?:also\b|[a-z]+ also\b)/gi,
  /\b(?:it|this|that)(?:['’]s| is|isn['’]t| is not) (?:not )?just (?:about )?[^.!?,;]{2,80}[,;—–] ?(?:it|this|that)['’]?s?\b/gi,
  /\bhere['’]s (?:why|how|what you need to know)\b/gi,
  /\bthe (?:best|good) news\?/gi,
  /\b(?:whether|from) [^,.!?]{2,60} (?:or|to) [^,.!?]{2,60}, /gi,
];

// ============================================================== compile
const APOS = "['’]";
const TRAILING_LOOKAROUND = /\(\?<?[=!](?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)$/;

function wrapSource(src) {
  let s = src.replace(/'/g, APOS);
  const startsGuard = /^[(\\[]|^\(\?<|^[a-z]/i.test(s) && !/^[,\s]/.test(s) && !/^\(\?<[=!]/.test(s);
  const endsGuard = !/\s$/.test(src) && !TRAILING_LOOKAROUND.test(src) && !/[,.!:;]\??$/.test(src) && !/\[\.!\]$/.test(src);
  if (startsGuard) s = "(?<![\\w'’-])" + s;
  if (endsGuard) s = s + "(?![\\w'’-])";
  else if (/,\?$/.test(src)) s = s.slice(0, -2) + "(?![\\w'’-]),?";
  return s;
}

let COMPILED = null;

/** Compiled cliché rules: [{re, tier, alts, verb?, forms?, formOf?, delMid?, startOnly?}] */
export function getClicheRules() {
  if (COMPILED) return COMPILED;
  COMPILED = [];
  for (const e of CLICHE_DATA) {
    const pre = e.pre || '';
    const post = e.post || '';
    if (e.verb) {
      const lemma = e.lemma || e.verb;
      const forms = verbForms(lemma, e.forms);
      const allowed = e.only ? e.only.split('') : ['b', 's', 'd', 'g'];
      const formOf = new Map();
      const list = [];
      for (const k of allowed) {
        for (const w of forms[k] || []) {
          if (!formOf.has(w)) formOf.set(w, k);
          list.push(w);
        }
      }
      list.sort((a, b) => b.length - a.length);
      const tail = (e.tail || '').replace(/'/g, APOS);
      const tailEndsWord = tail && !TRAILING_LOOKAROUND.test(e.tail) && /[a-z)]$/i.test(e.tail);
      const src =
        pre +
        "(?<![\\w'’-])(" + list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ")" +
        (tail ? (tail.startsWith('(?') ? "(?![\\w'’-])" + tail : tail) : "(?![\\w'’-])") +
        (tailEndsWord ? "(?![\\w'’-])" : '') +
        post;
      COMPILED.push({ ...e, re: new RegExp(src, 'gi'), formOf, isVerb: true });
    } else {
      COMPILED.push({ ...e, re: new RegExp(pre + wrapSource(e.src) + post, 'gi'), isVerb: false });
    }
  }
  return COMPILED;
}

// ============================================================== synonyms
// Format: headword: alt, alt | flags
// flags: nd = skip when followed by a determiner/pronoun (verb/participle use), !w1/w2 = not before,
//        <w1/w2 = not after.  Only words whose alternatives fit (nearly) every context are listed.
const SYNONYM_TEXT = `
quickly: rapidly, swiftly
rapidly: quickly, swiftly
swiftly: quickly, rapidly
easily: readily | <so/too
readily: easily
simply: just | !put/speaking/because
merely: just, only, simply
solely: only, purely
purely: solely, simply
extremely: really, exceptionally
exceptionally: remarkably, unusually
remarkably: strikingly, unusually
completely: totally, entirely, fully
entirely: completely, fully, wholly
totally: completely, entirely
fully: completely, entirely
wholly: entirely, completely
absolutely: totally, completely | !not
especially: particularly
particularly: especially
generally: usually, typically | !speaking
usually: typically, normally
typically: usually, normally
normally: usually, typically
often: frequently | <as/how/so/too
frequently: often, regularly
rarely: seldom, hardly ever
seldom: rarely
sometimes: at times
occasionally: now and then, from time to time
almost: nearly
nearly: almost
mostly: largely, mainly
mainly: mostly, largely, primarily
largely: mostly, mainly
primarily: mainly, mostly, chiefly
chiefly: mainly, mostly
probably: likely, most likely
perhaps: maybe
maybe: perhaps
certainly: definitely
definitely: certainly
obviously: clearly
currently: now
presently: now, currently
immediately: instantly
instantly: immediately
constantly: continually, always
continually: constantly
continuously: continually, nonstop
significantly: considerably, substantially, markedly, noticeably
substantially: considerably, markedly
considerably: substantially, markedly
markedly: noticeably, considerably
noticeably: markedly, visibly
dramatically: sharply
sharply: dramatically, steeply
greatly: hugely, vastly
hugely: enormously, massively
vastly: hugely, enormously
regularly: routinely
routinely: regularly
gradually: steadily, slowly
steadily: gradually
reliably: consistently, dependably
properly: correctly
correctly: properly, accurately
accurately: precisely, correctly
precisely: exactly
exactly: precisely | <not
slightly: somewhat, marginally
somewhat: rather, fairly
fairly: reasonably, pretty
reasonably: fairly
relatively: fairly, comparatively
comparatively: relatively
roughly: about, around, approximately | !speaking
approximately: about, around, roughly
originally: initially, at first
initially: originally
nowadays: these days, today
overly: too, excessively
genuinely: really, sincerely
sincerely: genuinely, honestly
honestly: frankly | <to
frankly: honestly, candidly
deliberately: intentionally, on purpose
intentionally: deliberately, on purpose
briefly: quickly
huge: massive, enormous
massive: huge, enormous
enormous: huge, massive
tremendous: enormous, huge, immense
immense: huge, vast, enormous
vast: huge, immense | !majority
large: big, sizable | <at/by
tiny: minuscule, small
rapid: fast, quick, swift
difficult: hard, tough, tricky
challenging: tough, demanding, tricky | nd
tough: hard, difficult
tricky: difficult, tough
easy: simple, straightforward, painless | <take/it's
simple: straightforward, easy | !as
straightforward: simple, easy
complicated: complex, tricky
complex: complicated | <apartment/office/industrial/sports
important: key | !to/that/for/as
essential: necessary, key | !oils/oil
necessary: needed, required | <if/when/where
main: primary, chief | !street/road/course/character/event
primary: main, chief | !school/schools/election/elections/care
chief: main, primary | !executive/officer/financial/operating/technology/marketing/of/among
significant: major, considerable, sizable | <statistically/other !other
considerable: sizable, substantial
substantial: sizable, considerable, hefty
sizable: substantial, considerable
several: a few, a handful of | <the
multiple: several, many
additional: extra, further
extra: additional | !mile
entire: whole
whole: entire | <a/as/the !lot/thing/point/new
excellent: great, superb, outstanding, first-rate
great: terrific, fantastic, excellent | <a !deal/many/britain/lakes/wall/depression/job
fantastic: terrific, superb, wonderful
amazing: remarkable, incredible, fantastic
awesome: fantastic, terrific
incredible: remarkable, unbelievable
remarkable: striking, impressive, notable
impressive: striking, remarkable
outstanding: excellent, superb | !balance/balances/debt/debts/invoice/invoices/payment/payments/issues/amount/shares/loans
superb: excellent, outstanding
terrific: fantastic, superb
wonderful: lovely, delightful
beautiful: gorgeous, lovely, stunning
gorgeous: stunning, beautiful
lovely: delightful, charming
delightful: lovely, charming
charming: delightful, lovely
perfect: ideal | <practice/makes
ideal: perfect
common: typical, frequent | <in/have !sense/ground/law/knowledge/denominator/good
typical: standard, usual, normal
usual: typical, normal | <as/than
normal: standard, typical, regular
distinctive: distinct, unique
similar: comparable | !to
comparable: similar
specific: particular | !to
particular: specific | <in
obvious: plain, evident, apparent
apparent: clear, evident, obvious | <heir
evident: clear, obvious, apparent
powerful: strong
potent: powerful, strong
reliable: dependable, trustworthy, solid
dependable: reliable, trustworthy
trustworthy: reliable, dependable
accurate: precise, exact, correct
precise: exact, accurate
exact: precise
affordable: inexpensive, budget-friendly, reasonably priced
expensive: costly, pricey
costly: expensive, pricey
pricey: expensive, costly
cheap: inexpensive, low-cost
inexpensive: cheap, low-cost
modern: contemporary | !art/history/family/languages
contemporary: modern | !art/dance/music
latest: newest, most recent | <the !news !version !update | <at
newest: latest
previous: earlier, prior, past
helpful: useful, handy
useful: handy, helpful
handy: useful, helpful
valuable: useful, worthwhile
worthwhile: rewarding
interesting: intriguing, fascinating
intriguing: interesting, fascinating
fascinating: intriguing, absorbing
boring: dull, tedious
dull: boring, tedious
tedious: dull, tiresome
annoying: irritating, frustrating | nd
irritating: annoying, frustrating | nd
frustrating: annoying, maddening | nd
stressful: taxing, draining, nerve-racking
overwhelming: daunting | !majority/support/evidence/response nd
daunting: intimidating, overwhelming
intimidating: daunting
confusing: baffling, puzzling, unclear | nd
clever: smart, ingenious, shrewd
smart: clever, sharp, savvy | !home/homes/phone/phones/watch/watches/tv/tvs/device/devices/speaker/speakers/contract/contracts/goals/thermostat/meter/meters/glasses/card/cards/city/cities/money
intelligent: smart, clever, bright
inventive: creative, imaginative
imaginative: creative, inventive
genuine: real, authentic, sincere
authentic: genuine, real
honest: candid, frank | <to/be/brutally
candid: frank, honest
transparent: open, upfront
friendly: welcoming, warm, approachable
welcoming: friendly, warm
eager: keen
keen: eager | !eye/sense/interest/observer
excited: thrilled
thrilled: delighted, excited
happy: glad, pleased, delighted | !hour/hours/birthday/new/holidays/medium/ending/path
glad: happy, pleased
pleased: glad, happy
delighted: thrilled, pleased
broad: wide, wide-ranging | !daylight/strokes/terms
extensive: wide-ranging, broad, sweeping
thorough: detailed, careful, in-depth
detailed: in-depth, thorough
fundamental: basic, core, underlying
basic: simple, fundamental | !income/needs/plan/plans/tier
advanced: sophisticated | !search/settings/options/degree/degrees/level/placement
sophisticated: advanced, refined, polished
elegant: graceful, stylish, refined
stylish: chic, sleek, elegant
sleek: slick, polished
convenient: handy, practical
practical: useful, workable
flexible: adaptable, versatile | !hours/schedule/schedules/working/work
versatile: flexible, adaptable, all-purpose
adaptable: flexible, versatile
consistent: steady, reliable | !with
steady: consistent, stable
stable: steady, solid | !version/release/build/branch/condition
dangerous: hazardous, risky, perilous
hazardous: dangerous, risky | !waste/materials/material
risky: dicey, chancy
urgent: pressing, time-sensitive | !care
pressing: urgent | nd
constant: steady, nonstop, continual
frequent: regular, common | !flyer/flyers
occasional: periodic, sporadic
rare: uncommon, unusual | !earth/disease/diseases/steak
uncommon: rare, unusual
unusual: uncommon, odd
strange: odd, weird, peculiar
weird: odd, strange
peculiar: odd, strange
minor: small, slight | <a/the/of/for !league/leagues/key/scale
slight: small, minor | !of
tiny: minuscule, small
abundant: plentiful, ample
plentiful: abundant, ample
sufficient: enough, adequate
adequate: sufficient, decent, acceptable
proper: correct, right, appropriate | !noun/nouns/name
appropriate: suitable, fitting, right | <to
suitable: appropriate, fitting, right
relevant: pertinent, applicable
pertinent: relevant, applicable
noticeable: visible, marked, perceptible
inevitable: unavoidable
unavoidable: inevitable
optimal: ideal
profitable: lucrative
lucrative: profitable, well-paying
crowded: packed, jammed
packed: crowded, jammed | <be/is/are/was/were/get/got/gets
delicious: tasty, mouthwatering, flavorful
tasty: delicious, flavorful
comfortable: cozy, comfy | !with/doing/being/saying/talking/sharing/using/making
cozy: snug, comfy
spacious: roomy, airy
roomy: spacious
ongoing: continuing, continual | !basis
continual: constant, ongoing
massive: huge, enormous
vast: huge, immense | !majority
benefits: advantages, perks, upsides | nd !from/of/package/packages/include
advantage: edge, upside, benefit | <take/takes/took/taking/taken/unfair/competitive
advantages: benefits, upsides, perks
disadvantage: drawback, downside
disadvantages: drawbacks, downsides
drawback: downside, disadvantage
drawbacks: downsides, disadvantages
downside: drawback
downsides: drawbacks
problem: issue | <no
problems: issues
goal: aim, objective, target | !line/keeper/post/posts/scored
goals: aims, objectives, targets | !scored/against
objectives: goals, aims
purpose: aim, point, goal | <on/dual/sole/general !built/driven
method: approach, technique, way
methods: approaches, techniques, ways
strategy: plan, ^game plan, approach | !games/game/consulting/consultant
strategies: plans, approaches, tactics
technique: method, approach
techniques: methods, approaches, tricks
option: choice, alternative | !to
options: choices, alternatives | !trading
choice: option | <multiple/first/second/editor's/people's
choices: options
opportunity: chance | !cost/costs
opportunities: chances, openings | !for
outcome: result
outcomes: results
knowledge: know-how, understanding, expertise | !base/bases/graph/management/worker/workers
expertise: know-how, skill
ability: capacity | !to/level
aspect: side, part, facet
aspects: sides, parts, facets
element: part, piece, component | !of
elements: parts, pieces, components | <html/page/ui/design
component: part, piece, element
components: parts, pieces, elements | <react/ui/vue
factor: element | <x/form !in/out
industry: sector, field | !standard/standards/leading/leader/leaders/experts/events/insiders
industries: sectors, fields
company: business, firm | <keep/keeping/kept/in !culture/policy/policies/website/values/mission/name/logo/page/profile/car/event/events/retreat/blog/news/updates/history/size/account/email/brand/goals/leaders/leadership/meeting/meetings/handbook/overview/info/information/announcement/party
companies: businesses, firms | !house/act
businesses: companies, firms
client: customer | !side/server/library/libraries/app/software/id/secret/certificate
clients: customers
individuals: people
employee: staff member, worker, team member | !engagement/retention/handbook/benefits/experience/onboarding/turnover/satisfaction/productivity/morale
employees: staff, workers, team members
expert: specialist, pro | !advice/witness/system/systems/opinion/level/mode !at
experts: specialists, pros
professionals: pros, experts, practitioners
beginner: newcomer, novice, first-timer | !level/friendly/mode
beginners: newcomers, novices, first-timers
task: job | !list/lists/manager/management/bar/force/scheduler
tasks: jobs
mistake: error, slip, misstep | <no/by
mistakes: errors, slips, missteps
error: mistake | !message/messages/code/codes/rate/rates/log/logs/handling/bars/page
errors: mistakes | !and
topic: subject, theme
topics: subjects, themes
variety: range, mix | <a/the/vast !show/shows/store/pack
improvement: gain, upgrade | <home/self/continuous/process
improvements: gains, upgrades
competitors: rivals
rival: competitor | !team/teams/firm
rivals: competitors
concept: idea, notion | !art/car/store
concepts: ideas, notions
notion: idea
discussion: conversation, talk | !board/boards/forum/forums/group/groups/thread/threads/topic/questions/section/sections
conversation: ^chat, talk | !rate/rates/starter/starters/history
conversations: ^chats, talks
region: area | !lock/locked/specific
location: spot, place, site | !data/services/tracking/based/settings/permission/permissions/history/sharing/pin
neighborhood: area, part of town
website: site | !builder/builders/design/designer/designers/traffic/visitors/owners/owner/hosting/development
websites: sites
article: piece, post | !of/i/ii/iii/iv/v
articles: pieces, posts | !of
tips: pointers, hints, suggestions | <the/fingertips/inside/insider/hot/top
advice: guidance | !column/columns
feedback: input | !loop/loops/form/forms/survey/surveys
evidence: proof | !based/suggests/shows/that
era: age, period, time | !of
manner: way, fashion
appearance: look | !of/fee/fees
atmosphere: feel, mood, ^vibe | !of/is
venue: spot, place | !hire/rental
residents: locals
start: begin | !date/dates/page/pages/menu/button/screen/time/times/point/points/up/ups/off/over/out nd <head/fresh/false/quick/a/the/good/great/strong/slow/early/late
starts: begins | <head/fresh/false/fits/quick
begin: start
begins: starts
began: started
choose: pick, select | !to/from
chooses: picks, selects | !to/from
chose: picked, selected | !to/from
choosing: picking, selecting | !to/from
obtain: get, secure, acquire
obtains: gets, secures
obtained: secured, acquired
obtaining: getting, securing
acquire: gain, pick up
acquires: gains, picks up
acquiring: gaining, picking up
receive: get
receives: gets
receiving: getting
provide: give, offer, deliver | !for !with !that
provides: gives, offers, delivers | !for !with !that
providing: giving, offering, delivering | !for !with !that
demonstrate: show, prove
demonstrates: shows, proves
demonstrated: proved
demonstrating: showing, proving
indicate: suggest, signal
indicates: suggests, signals
indicated: suggested, signaled
indicating: suggesting, signaling
reveal: show, uncover
reveals: shows, uncovers
revealed: uncovered
revealing: showing, uncovering | !the !a
discuss: talk about, cover, go over
discusses: covers, talks about, goes over
discussed: covered, talked about
discussing: covering, talking about
examine: look at, study, inspect
examines: looks at, studies, inspects
examined: studied, looked at, inspected
examining: looking at, studying, inspecting
investigate: look into, dig into, probe
investigates: looks into, digs into, probes
investigated: looked into, probed
investigating: looking into, digging into, probing
boost: lift, raise | <a/the/big/quick/real/huge/small/nice/major/massive/an
boosted: lifted, raised
boosting: lifting, raising
reduce: cut, lower, trim
reduces: cuts, lowers, trims
reduced: cut, lowered, trimmed | !to
reducing: cutting, lowering, trimming
minimize: reduce, limit
minimizes: reduces, limits
minimized: reduced, limited
minimizing: reducing, limiting
minimise: reduce, limit
maximize: boost
maximizes: boosts
maximizing: boosting
accomplish: achieve, pull off
accomplished: achieved, pulled off | <an/a/highly/most/very
attract: draw, pull in
attracts: draws, pulls in
attracting: drawing, pulling in
retain: keep, hold on to
retains: keeps, holds on to
retained: kept
retaining: keeping
maintain: keep, sustain | !that
maintains: keeps, sustains | !that
maintaining: keeping, sustaining
require: need
requires: needs
requiring: needing
assist: help, support | <an/the
assists: helps, supports
assisted: helped, supported | !living
assisting: helping, supporting
enable: allow
enables: allows
enabling: allowing
allow: enable, permit | !me
allows: enables, permits
allowed: permitted
prevent: stop
prevents: stops
prevented: stopped
preventing: stopping
avoid: steer clear of, sidestep
avoids: steers clear of, sidesteps
avoided: steered clear of, sidestepped
avoiding: steering clear of, sidestepping
tackle: take on, deal with, handle
tackles: takes on, deals with, handles
tackled: dealt with, handled
tackling: taking on, dealing with, handling
solve: fix, crack, resolve
solves: fixes, cracks, resolves
solved: fixed, cracked, resolved
solving: fixing, cracking, resolving
resolve: fix, settle, sort out | <the/your/our/their/his/her/my
resolves: fixes, settles, sorts out
discover: find, uncover
discovers: finds, uncovers
discovered: found, uncovered
discovering: finding, uncovering
identify: spot, pinpoint, pick out | !as/with
identifies: spots, pinpoints, picks out | !as/with
identified: spotted, pinpointed | !as/with
identifying: spotting, pinpointing | !as/with
determine: figure out, work out
determines: figures out, works out
determining: figuring out, working out
evaluate: assess, weigh, judge
evaluates: assesses, weighs, judges
evaluated: assessed, weighed, judged
evaluating: assessing, weighing, judging
assess: evaluate, gauge, weigh up
assesses: evaluates, gauges
assessed: evaluated, gauged
assessing: evaluating, gauging
analyze: study, break down, dig into
analyzes: studies, breaks down, digs into
analyzed: studied, dug into
analyzing: studying, breaking down, digging into
analyse: study, break down, dig into
analysing: studying, breaking down
emphasize: stress, underline
emphasizes: stresses, underlines
emphasized: stressed, underlined
emphasizing: stressing, underlining
expand: broaden, widen, extend | !on/upon
expands: broadens, widens, extends | !on/upon
expanded: broadened, widened, extended | !on/upon
expanding: broadening, widening, extending | !on/upon
implement: roll out, adopt, carry out
implements: rolls out, adopts, carries out
implemented: rolled out, adopted, carried out
implementing: rolling out, adopting, carrying out
adapt: adjust
adapts: adjusts
adapted: adjusted | !from/for/version
adapting: adjusting
adjust: tweak, fine-tune | !to
adjusts: tweaks, fine-tunes | !to
modify: change, tweak, alter
modifies: changes, tweaks, alters
modified: changed, tweaked, altered
modifying: changing, tweaking, altering
alter: change, modify | !ego
alters: changes, modifies
altered: changed, modified
eliminate: get rid of, remove, cut out
eliminates: gets rid of, removes, cuts out
eliminated: removed, cut out
eliminating: getting rid of, removing, cutting out
combine: blend, merge, pair
combines: blends, merges, pairs
combined: blended, merged, paired | !with !total/value/effect/effects/power/forces/experience
combining: blending, merging, pairing
encourage: spur, nudge
encourages: spurs, nudges
encouraged: spurred, nudged
encouraging: spurring, nudging | !to !results/news/sign/signs/words/start
motivate: drive, push, inspire
motivates: drives, pushes, inspires
generate: produce, create
generates: produces, creates
generated: produced, created | !by/content/images/text/code
generating: producing, creating
remain: stay | nd !to/one/unclear/a/an/the
remains: stays | nd !to/of/unclear/the/one/a/an
remained: stayed | nd !one/a/an/the/unclear
seem: appear | !like
seems: appears | !like
seemed: appeared | !like
occur: happen | !to
occurs: happens | !to
occurred: happened | !to
occurring: happening | !to
recommend: suggest | <highly/strongly
recommends: suggests | <highly/strongly
recommended: suggested | <highly/strongly/recommended/the !for/reading/settings/by
establish: build | !that/whether
establishes: builds | !that/whether
establishing: building | !that/whether
strengthen: reinforce, firm up, shore up
strengthens: reinforces, firms up, shores up
strengthened: reinforced, firmed up, shored up
strengthening: reinforcing, firming up, shoring up
clarify: clear up, spell out, explain
clarifies: clears up, spells out, explains
clarified: cleared up, spelled out, explained
gather: collect, pull together, round up
gathers: collects, pulls together, rounds up
gathered: collected, pulled together, rounded up
gathering: collecting, pulling together, rounding up | <a/the/data/information/intelligence/family/social
collect: gather
collects: gathers
organize: arrange, sort out
organizes: arranges, sorts out
organizing: arranging, sorting out
organise: arrange, sort out
participate: take part
participates: takes part
participating: taking part | !countries/companies/brands/stores/members/schools
attend: go to | !to
attends: goes to | !to
attending: going to | !to/physician
depart: leave
departs: leaves
departed: left | <the/dear/our/my
respond: reply | !well/to treatment
responds: replies
responded: replied
responding: replying
notify: alert, tell
notifies: alerts, tells
notified: alerted, told
illustrate: show, demonstrate
illustrates: shows, demonstrates
illustrated: demonstrated | !book/books/guide/edition
depict: show, portray
depicts: shows, portrays
depicted: portrayed
portray: depict, show
portrays: depicts, shows
symbolize: stand for, represent
symbolizes: stands for, represents
predict: forecast
predicts: forecasts
predicted: forecast
predicting: forecasting
anticipate: expect, foresee
anticipates: expects, foresees
anticipated: expected | <highly/most/long/eagerly/much
possess: have, own
possesses: has, owns
seek: look for, search for, pursue | !to/out
seeks: looks for, searches for, pursues | !to/out
seeking: looking for, searching for, pursuing | !to/out
pursue: chase, go after, follow
pursues: chases, goes after, follows
pursuing: chasing, going after, following
terminate: end, stop, cancel
terminated: ended, stopped, canceled
cease: stop, end
ceases: stops, ends
ceased: stopped, ended
initiate: start, kick off, launch
initiates: starts, kicks off, launches
initiated: started, kicked off, launched
initiating: starting, kicking off, launching
`;

export function parseSynonyms(text = SYNONYM_TEXT) {
  const map = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon).trim().toLowerCase();
    let rest = line.slice(colon + 1);
    let flags = '';
    const bar = rest.indexOf('|');
    if (bar >= 0) {
      flags = rest.slice(bar + 1);
      rest = rest.slice(0, bar);
    }
    // Keep swaps lateral or plainer: drop single-word alternatives that are much rarer than the headword
    // (often -> frequently reads more formal, i.e. more machine-like, not less).
    const zHead = zipf(head);
    const alts = rest
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((a) => {
        const w = a.replace(/^[~^]/, '');
        if (w.includes(' ') || !zHead) return true;
        const z = zipf(w);
        return !z || z >= zHead - 0.7;
      });
    if (!alts.length) continue;
    const entry = { alts, notBefore: new Set(), notAfter: new Set(), nd: false };
    for (const tok of flags.trim().split(/\s+/)) {
      if (!tok) continue;
      if (tok === 'nd') entry.nd = true;
      else if (tok[0] === '!') for (const w of tok.slice(1).split('/')) entry.notBefore.add(w.toLowerCase());
      else if (tok[0] === '<') for (const w of tok.slice(1).split('/')) entry.notAfter.add(w.toLowerCase());
    }
    if (map.has(head)) {
      // merge duplicate headwords (keeps data file forgiving)
      const prev = map.get(head);
      for (const a of alts) if (!prev.alts.includes(a)) prev.alts.push(a);
      for (const w of entry.notBefore) prev.notBefore.add(w);
      for (const w of entry.notAfter) prev.notAfter.add(w);
      prev.nd = prev.nd || entry.nd;
    } else map.set(head, entry);
  }
  return map;
}

export const SYNONYMS = parseSynonyms();

// ============================================================== contractions
// [pattern, replacement]; pattern is case-insensitive, must be followed by a space + word to apply.
export const CONTRACTIONS = [
  ['it is not', "it's not"],
  ['that is not', "that's not"],
  ['there is not', "there's not"],
  ['do not', "don't"],
  ['does not', "doesn't"],
  ['did not', "didn't"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['was not', "wasn't"],
  ['were not', "weren't"],
  ['have not', "haven't"],
  ['has not', "hasn't"],
  ['had not', "hadn't"],
  ['will not', "won't"],
  ['would not', "wouldn't"],
  ['should not', "shouldn't"],
  ['could not', "couldn't"],
  ['cannot', "can't"],
  ['can not', "can't"],
  ['i am', "I'm"],
  ['i will', "I'll"],
  ['i would', "I'd"],
  ['you are', "you're"],
  ['you will', "you'll"],
  ['you would', "you'd"],
  ['we are', "we're"],
  ['we will', "we'll"],
  ['we would', "we'd"],
  ['they are', "they're"],
  ['they will', "they'll"],
  ['they would', "they'd"],
  ['he is', "he's"],
  ['she is', "she's"],
  ['he will', "he'll"],
  ['she will', "she'll"],
  ['it has been', "it's been"],
  ['there has been', "there's been"],
  ['it is', "it's"],
  ['it will', "it'll"],
  ['that is', "that's"],
  ['that will', "that'll"],
  ['there is', "there's"],
  ['here is', "here's"],
  ['what is', "what's"],
  ['who is', "who's"],
  ['where is', "where's"],
];
// Expansions used by the academic tone (formal register: no contractions at all).
export const EXPANSIONS = {
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not',
  "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not',
  "won't": 'will not', "can't": 'cannot', "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not',
  "it's": 'it is', "that's": 'that is', "there's": 'there is', "here's": 'here is', "what's": 'what is',
  "you're": 'you are', "we're": 'we are', "they're": 'they are', "i'm": 'I am', "you'll": 'you will',
  "we'll": 'we will', "they'll": 'they will', "it'll": 'it will', "i'll": 'I will', "i've": 'I have',
  "you've": 'you have', "we've": 'we have', "they've": 'they have', "let's": 'let us', "i'd": 'I would',
  "you'd": 'you would', "we'd": 'we would', "they'd": 'they would',
};
// "I have been" -> "I've been" (only with a participle, never "I've a car")
export const HAVE_PARTICIPLES =
  'been|got|gotten|seen|heard|made|done|had|found|learned|learnt|built|worked|tried|used|noticed|created|helped|spent|launched|started|added|grown|become|written|shared|tested|watched|read|met|taken|given|known|always|never|already|just|also';

// ============================================================== tone packs
// Each opener only fires when the sentence carries a fitting cue, so "Frankly," lands on a blunt
// statement and "Realistically," on a prediction or a piece of advice, never on a neutral spec line.
const EVAL = "\\b(?:I|I'm|I've|we|we're|you|you're|best|worst|better|worse|great|hard|easy|simple|love|hate|think|feel|really|never|always|most|nobody|everyone|matters?|worth|wrong|right)\\b";
const MODAL = "\\b(?:can|can't|will|won't|should|shouldn't|need|needs|have to|has to|might|may|could|must)\\b";
const NEG = "\\b(?:not|isn't|aren't|doesn't|don't|won't|can't|never|no|nothing|only)\\b";
const GENERAL = "\\b(?:is|are|tends?|means|works?|helps?|makes?|lets?|gets?|usually|often)\\b";
// End tags (", honestly") only land on short evaluative sentences.
export const TAG_CUE = /\b(?:great|good|bad|hard|easy|simple|worth|better|best|worse|worst|fun|boring|weird|nice|love|hate|matters?|works?|helps?)\b/i;
export const OPENER_CUES = {
  'Honestly, ': new RegExp(EVAL, 'i'),
  'Frankly, ': new RegExp(NEG, 'i'),
  'Truth is, ': new RegExp(`${EVAL}|${MODAL}`, 'i'),
  'Thing is, ': new RegExp(`${MODAL}|${NEG}`, 'i'),
  "Here's the thing: ": new RegExp(`${MODAL}|${NEG}`, 'i'),
  'To be honest, ': new RegExp(EVAL, 'i'),
  'Look, ': /\byou(?:'re|r)?\b/i,
  'Basically, ': /\b(?:means|is|are|lets|helps|works)\b/i,
  'In practice, ': /\b(?:can|will|won't|means|helps?|works?|tends?|usually|often|takes?|costs?|ends? up|depends?)\b/i,
  'Realistically, ': new RegExp(MODAL, 'i'),
  "Here's the deal: ": /\byou(?:'re|r|'ll)?\b/i,
  'Bottom line: ': new RegExp(`${MODAL}|\\bmeans\\b`, 'i'),
  'Put simply, ': /\b(?:is|are|means|lets|helps|gives)\b/i,
  'Simply put, ': /\b(?:is|are|means|lets|helps|gives)\b/i,
  'To be clear, ': new RegExp(`${NEG}|\\bshould\\b`, 'i'),
  'Practically speaking, ': new RegExp(MODAL, 'i'),
  'Broadly speaking, ': new RegExp(GENERAL, 'i'),
  'In many cases, ': new RegExp(`${GENERAL}|${MODAL}`, 'i'),
  'To a large extent, ': /\b(?:is|are|depends?|relies|rely|shapes?|determines?)\b/i,
};

export const TONE_PACKS = {
  natural: {
    openers: ['Honestly, ', 'In practice, ', 'Realistically, ', 'Truth is, ', 'Frankly, '],
    fragments: ["Here's the thing."],
    endTags: [],
  },
  casual: {
    openers: ['Honestly, ', 'Look, ', 'Truth is, ', 'Thing is, ', "Here's the thing: ", 'To be honest, ', 'Basically, '],
    fragments: ["Here's the thing.", 'Think about it.'],
    endTags: [', honestly', ', if you ask me', ', really'],
  },
  marketing: {
    openers: ["Here's the deal: ", 'Bottom line: ', 'Put simply, ', 'Truth is, ', 'Simply put, '],
    fragments: ["Here's the deal."],
    endTags: [],
  },
  professional: {
    openers: ['In practice, ', 'Put simply, ', 'To be clear, ', 'Realistically, ', 'Practically speaking, '],
    fragments: [],
    endTags: [],
  },
  academic: {
    openers: ['In practice, ', 'Broadly speaking, ', 'In many cases, ', 'To a large extent, '],
    fragments: [],
    endTags: [],
  },
};

// ============================================================== US <-> UK spelling
const IZE_STEMS = (
  'organ recogn real optim priorit custom personal maxim minim util apolog critic emphas summar categor standard final ' +
  'special visual monet capital central author character civil familiar general harmon hospital ideal immun industrial ' +
  'initial item legal local memor mobil modern neutral normal popular public rational revolution sanit scrutin stabil ' +
  'steril strateg subsid symbol sympath synchron synthes theor energ galvan glamor jeopard mesmer patron penal polar ' +
  'social terror trivial vandal vapor victim western global incentiv operational contextual conceptual democrat ' +
  'decentral commercial crystall dramat econom empath equal evangel fantas formal human hypothes internal metabol ' +
  'ostrac oxid philosoph plagiar privat revital satir sensit serial traumat union urban verbal vocal weapon digit ' +
  'agon alphabet amort anglic anesthet antagon baptism? bowdler brutal cannibal carbon catechis? colon compartmental ' +
  'computer crimin demonet deodor desensit destabil dehuman demoral demonet dichotom energ epitom eulog extern feminis? ' +
  'fertil fossil fraternal gentrif? homogen hybrid hypnot iron? italic lion liquid magnet marginal miniatur moistur ' +
  'monopol moral motor nasal national naturall? optimal? ostrac pasteur pedestrian pressur? proselyt pulver random ' +
  'regional reorgan revolution romantic satir scandal schematic secular sermon? signal solemn special stigmat ' +
  'subsid tantal tenderiz? tokeni? tranquil unional? vitamin? winter'
)
  .split(/\s+/)
  .filter((s) => s && !s.includes('?'));
const IZE_SUFFIXES = [
  ['ize', 'ise'], ['izes', 'ises'], ['ized', 'ised'], ['izing', 'ising'], ['ization', 'isation'], ['izations', 'isations'],
  ['izer', 'iser'], ['izers', 'isers'],
];
const PAIRS_TEXT = `
analyze analyse|analyzed analysed|analyzing analysing|analyzer analyser|paralyze paralyse|paralyzed paralysed|paralyzing paralysing|catalyze catalyse|catalyzed catalysed
color colour|colors colours|colored coloured|colorful colourful|coloring colouring|colorless colourless|discolored discoloured
favor favour|favors favours|favored favoured|favoring favouring|favorite favourite|favorites favourites|favorable favourable|favorably favourably|unfavorable unfavourable
flavor flavour|flavors flavours|flavored flavoured|flavorful flavourful|flavoring flavouring
honor honour|honors honours|honored honoured|honoring honouring|honorable honourable|dishonor dishonour
humor humour|humors humours|humored humoured
labor labour|labors labours|labored laboured|laboring labouring
neighbor neighbour|neighbors neighbours|neighborhood neighbourhood|neighborhoods neighbourhoods|neighboring neighbouring|neighborly neighbourly
behavior behaviour|behaviors behaviours|behavioral behavioural|behaviorally behaviourally
rumor rumour|rumors rumours|rumored rumoured
harbor harbour|harbors harbours|savor savour|savory savoury|vapor vapour|valor valour|vigor vigour|armor armour|odor odour|odors odours|parlor parlour|splendor splendour|candor candour|demeanor demeanour|tumor tumour|ardor ardour|clamor clamour|rigor rigour|endeavor endeavour|endeavors endeavours|savior saviour
center centre|centers centres|centered centred|centering centring|theater theatre|theaters theatres|fiber fibre|fibers fibres|liter litre|liters litres|caliber calibre|somber sombre|saber sabre|specter spectre|luster lustre|maneuver manoeuvre|maneuvers manoeuvres|maneuvered manoeuvred|maneuvering manoeuvring
defense defence|defenses defences|offense offence|offenses offences|pretense pretence
catalog catalogue|catalogs catalogues|analog analogue|monolog monologue|prolog prologue
traveled travelled|traveling travelling|traveler traveller|travelers travellers|canceled cancelled|canceling cancelling|labeled labelled|labeling labelling|modeled modelled|modeling modelling|fueled fuelled|fueling fuelling|leveled levelled|leveling levelling|signaled signalled|signaling signalling|totaled totalled|marveled marvelled|marvelous marvellous|jewelry jewellery|counselor counsellor|counselors counsellors|counseling counselling|channeled channelled|channeling channelling|tunneled tunnelled|quarreled quarrelled|dialed dialled|dialing dialling|fulfill fulfil|fulfills fulfils|fulfillment fulfilment|enrollment enrolment|enroll enrol|enrolls enrols|installment instalment|skillful skilful|willful wilful|distill distil|instill instil
gray grey|grays greys|aluminum aluminium|cozy cosy|cozier cosier|mold mould|molds moulds|moldy mouldy|plow plough|skeptic sceptic|skeptical sceptical|skepticism scepticism|aging ageing|judgment judgement|judgments judgements|acknowledgment acknowledgement|pajamas pyjamas|mustache moustache|licorice liquorice|sulfur sulphur|pediatric paediatric|anemia anaemia|esophagus oesophagus|maneuverable manoeuvrable|artifact artefact|artifacts artefacts|draftsman draughtsman|cheerleader cheerleader
`;

function buildSpelling() {
  const us2uk = new Map();
  for (const stem of IZE_STEMS) {
    for (const [a, b] of IZE_SUFFIXES) us2uk.set(stem + a, stem + b);
  }
  for (const pair of PAIRS_TEXT.split(/[|\n]/)) {
    const [us, uk] = pair.trim().split(/\s+/);
    if (us && uk && us !== uk) us2uk.set(us, uk);
  }
  const uk2us = new Map();
  for (const [a, b] of us2uk) uk2us.set(b, a);
  return { us2uk, uk2us };
}
const SPELL = buildSpelling();
export const US_TO_UK = SPELL.us2uk;
export const UK_TO_US = SPELL.uk2us;

// ============================================================== proper-noun block list
// Sentence-initial capitalised words we must never lower-case when restructuring.
export const NAME_BLOCK = new Set(
  (
    'james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald ' +
    'steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric ' +
    'jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry ' +
    'tyler aaron jose adam nathan henry douglas zachary peter kyle noah ethan jeremy walter christian keith roger terry austin ' +
    'sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan albert willie alan eugene ' +
    'russell vincent philip bobby johnny bradley roy mike chris dave tom tim ben sam max alex nick matt dan jim bob bill ' +
    'mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley kimberly ' +
    'emily donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy kathleen angela ' +
    'shirley brenda emma anna pamela nicole samantha katherine christine helen debra rachel carolyn janet maria catherine ' +
    'heather diane olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn judith andrea hannah megan ' +
    'cheryl jacqueline martha madison teresa gloria sara janice ann kathryn abigail sophia frances jean alice judy isabella ' +
    'julia grace amber denise danielle marilyn beverly charlotte natalie theresa diana brittany doris kayla alexis lori ' +
    'marie kate jane sophie lily chloe ella mia ava zoe lucy jess beth liz kim jen ' +
    'google apple amazon microsoft facebook meta instagram twitter linkedin youtube tiktok netflix tesla nike adidas ' +
    'spotify uber airbnb shopify hubspot salesforce slack zoom notion canva adobe intel nvidia samsung sony ibm oracle ' +
    'walmart target costco starbucks mcdonalds disney paypal stripe openai chatgpt claude gemini bing yahoo reddit ' +
    'pinterest snapchat whatsapp telegram discord twitch etsy ebay wordpress mailchimp zapier figma asana trello ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august ' +
    'september october november december christmas easter thanksgiving halloween ' +
    'america american americans europe european asia africa australia canada mexico china japan india germany france ' +
    'spain italy britain england scotland ireland wales london paris berlin tokyo york california texas florida ' +
    'chicago boston seattle austin denver miami dallas atlanta sydney toronto dubai singapore english spanish french ' +
    'german chinese japanese indian british irish african asian christian muslim jewish god'
  ).split(/\s+/)
);
