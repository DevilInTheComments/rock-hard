/* Rock Hard v1 — songwriting app for Robert Kirk.
 * Type a few lyrics, describe a song, or use your own voice — get a whole song
 * plus a backing track to perform over. All on-device. No network calls,
 * no API keys, no accounts, no ads, $0. Lyrics are rule-based (the app says
 * so plainly); it does not sing vocals.
 * Pure functions are exported for node tests (see tests/test.js).
 */
'use strict';

var STORAGE_SONGS = 'rockhard.songs.v1';
var STORAGE_VOICE = 'rockhard.voice.v1';
var STORAGE_SETTINGS = 'rockhard.settings.v1';
var VERSION = '1.0.0';
var APP_NAME = 'Rock Hard';

/* ---------- seeded RNG (mulberry32) ---------- */
function makeRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickDistinct(rng, arr, n) {
  var copy = arr.slice();
  var out = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}
function shuffleCopy(rng, arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function uid() {
  return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/* =====================================================================
 * RHYME FAMILIES
 * Each family: words that rhyme with each other, plus clause openers
 * (subject + verb) that form a COMPLETE sentence with EVERY word in the
 * family. A lyric line = [optional discourse marker][clause opener][rhyme word].
 * Example: lead "I burn with" + word "fire" = "I burn with fire."
 * Every lead must read naturally in front of every word in its family —
 * that invariant is what keeps generated lines grammatical.
 * Tags steer style bias: dark, romantic, heavy, sad, bright, street.
 * ===================================================================== */
var RHYME_FAMILIES = [
  { id: 'fire',    tags: ['heavy', 'dark'],       words: ['fire', 'desire'],                 leads: ['I burn with', 'We burn with', "I'm lit by the", 'I choke on the', 'We feed on the'] },
  { id: 'night',   tags: ['dark', 'sad'],         words: ['night', 'light', 'fight'],        leads: ["I'm lost in the", 'We run through the', "I'm blind in the", 'I call out in the', 'We stand in the'] },
  { id: 'pain',    tags: ['sad', 'heavy'],        words: ['pain', 'rain', 'chains'],         leads: ['I drown in the', 'We break through the', 'I wash off the', "I'm bound by the", 'We scream through the'] },
  { id: 'blood',   tags: ['dark', 'heavy'],       words: ['blood', 'flood', 'mud'],          leads: ['We stand in the', "I'm washed in the", 'I crawl through the', 'We drown in the'] },
  { id: 'fall',    tags: ['sad', 'bright'],       words: ['fall', 'call', 'wall'],           leads: ["I'm waiting for the", 'We face the', "Don't fear the", 'We rise above the'] },
  { id: 'tears',   tags: ['sad', 'romantic'],     words: ['tears', 'years', 'fears'],        leads: ['I cry through the', "I'm buried in the", "I'm haunted by the", 'We live with the'] },
  { id: 'cold',    tags: ['sad', 'dark'],         words: ['cold', 'hold', 'gold'],           leads: ["I'm left out in the", "We're trapped in the", 'I reach for the', "I'm frozen in the"] },
  { id: 'broken',  tags: ['sad', 'romantic'],     words: ['broken', 'spoken', 'unspoken'],   leads: ['The words were', 'The truth was', 'What was', 'I know what was'] },
  { id: 'home',    tags: ['heavy', 'sad'],        words: ['home', 'alone', 'gone'],          leads: ["I'm far from", "I'm not", "We're not", "I won't be"] },
  { id: 'dark',    tags: ['dark', 'romantic'],    words: ['dark', 'heart', 'spark'],         leads: ["I'm lost in the", "We're deep in the", "I'm fading in the"] },
  { id: 'sky',     tags: ['bright', 'romantic'],  words: ['sky', 'high'],                    leads: ['I touch the', "We're under the", "I'm above the", 'We chase the'] },
  { id: 'flame',   tags: ['romantic', 'heavy'],   words: ['flame', 'shame', 'blame'],        leads: ['I carry the', 'I take the', 'We live with the', 'I own the'] },
  { id: 'breath',  tags: ['dark', 'sad'],         words: ['breath', 'death', 'rest'],        leads: ['We fight for', 'I need', 'Give me', "I'm still fighting for"] },
  { id: 'grace',   tags: ['romantic', 'bright'],  words: ['grace', 'place', 'face'],         leads: ["I'm searching for the", "We're looking for the", 'I keep my', 'We found the'] },
  { id: 'road',    tags: ['street', 'bright'],    words: ['road', 'load', 'code'],           leads: ['We take the', 'I chose the', 'I know the', "Don't fear the"] },
  { id: 'truth',   tags: ['heavy', 'bright'],     words: ['truth', 'youth', 'proof'],        leads: ["I'm for the", "We're chasing the", "I'm bleeding for the", 'We fight for the'] },
  { id: 'dream',   tags: ['romantic', 'bright'],  words: ['dream', 'stream', 'steam'],       leads: ["I'm lost in the", 'I feel the', 'We follow the', 'I hear the'] },
  { id: 'king',    tags: ['heavy', 'street'],     words: ['king', 'ring', 'sting'],          leads: ["I'm waiting for the", "Don't fear the", 'We face the'] },
  { id: 'war',     tags: ['heavy', 'dark'],       words: ['war', 'more'],                    leads: ["I'm born for", "We're built for", "I'm hungry for", 'I want'] },
  { id: 'soul',    tags: ['dark', 'romantic'],    words: ['soul', 'control'],                leads: ['I give my', 'I lose my', 'We fight for my', 'I keep my'] },
  { id: 'glass',   tags: ['sad', 'dark'],         words: ['glass', 'past'],                  leads: ["I'm stuck in the", "We're running from the", "I'm trapped in the", 'I see through the'] },
  { id: 'lies',    tags: ['dark', 'street'],      words: ['lies', 'skies'],                  leads: ["I'm under the", "We're beneath the", "I'm lost beneath the", 'I see through the'] },
  { id: 'dead',    tags: ['dark', 'heavy'],       words: ['dead', 'red'],                    leads: ["We're running from the", "I'm rising from the", "We're back from the", 'I came back from the'] },
  { id: 'sound',   tags: ['bright', 'heavy'],     words: ['sound', 'crown'],                 leads: ['I chase the', 'We fight for the', 'I hear the', "I'm chasing the"] },
  { id: 'star',    tags: ['bright', 'romantic'],  words: ['star', 'scar'],                   leads: ["It's written in the", "I'm born with a", 'I see the', 'I wear my'] },
  { id: 'moon',    tags: ['dark', 'romantic'],    words: ['moon', 'doom'],                   leads: ["I'm waiting for the", "We're rising with the", 'We face the', 'I see the'] },
  { id: 'ghost',   tags: ['dark', 'sad'],         words: ['ghost', 'coast'],                 leads: ['I chase the', 'I see a', "We're haunted by the", 'We ran from the'] },
  { id: 'throne',  tags: ['heavy', 'dark'],       words: ['throne', 'zone'],                 leads: ["I'm fighting for the", 'We own the', 'I take the', 'I rule the'] },
  { id: 'love',    tags: ['romantic', 'sad'],     words: ['above', 'love'],                  leads: ["I'm falling from", "I'm rising from", 'We fall from', "I'm torn from"] },
  { id: 'burn',    tags: ['heavy', 'dark'],       words: ['burn', 'turn'],                   leads: ['I watch it', 'We let it', 'I feel it', "Don't let it"] },
  { id: 'game',    tags: ['street', 'bright'],    words: ['game', 'fame'],                   leads: ["I'm chasing the", "We're hungry for the", "I'm playing for the", 'I want the'] },
  { id: 'end',     tags: ['sad', 'dark'],         words: ['end', 'bend'],                    leads: ['I see the', 'We reach the', "We're running to the", "I won't"] }
];

/* Discourse markers only — they sit in front of a complete clause and never
 * change its grammar. No subject prefixes ("I'm ", "We're ", "I said, ")
 * here: those would break the clause that follows. */
var LINE_PREFIXES = [
  '', '', '', '', '', 'Yeah, ', 'And ', 'Still, ', 'Now ', 'Oh, ',
  'So ', 'But ', 'Listen, ', 'Tonight, ', 'Some nights, ',
  'Every day, ', 'You know, ', 'They say, '
];

/* =====================================================================
 * GENRES — BPM defaults, track feel, vocabulary, title patterns,
 * statement lines (full lines used as verse openers / outro closers).
 * ===================================================================== */
var GENRES = [
  {
    id: 'metal', name: 'Metal', bpm: 160, bpmRange: [140, 180],
    blurb: 'Fast, extreme, relentless. Double-kick drums, shredding riffs, minor-key fury.',
    defaultTheme: 'fire',
    vocab: ['ashes', 'steel', 'thunder', 'vengeance', 'abyss', 'void', 'chaos', 'demons', 'shadows', 'rage', 'storm', 'iron'],
    titlePatterns: ['Ashes of {T}', '{T} in the Abyss', 'Through the {T}', 'Rise of the {T}', 'The {T} Rises', 'Blood and {T}', '{T} Forever', 'Into the {T}', 'The Last {T}', 'Echoes of {T}', 'Born in {T}', '{T} Unleashed'],
    statements: [
      'I was born in the fire, raised in the rain',
      'They told me to kneel, I learned how to stand',
      'I answer to no gods, no masters — just blood on my hands',
      'I carry the storm inside my chest',
      'Every scar I got, I earned it in the dark',
      'The world tried to break me, it only made me loud',
      'I scream at the sky till the sky screams back',
      'We are the ones they warned you about'
    ],
    hookTemplates: [
      'Scream it loud — {T} forever',
      'Through the {T}, we never fall',
      'Burn it down, raise the {T}',
      'We are the {T} — hear us scream',
      'Nothing left but the {T}'
    ]
  },
  {
    id: 'heavy-metal', name: 'Heavy Metal', bpm: 132, bpmRange: [116, 148],
    blurb: 'Classic heavy. Driving riffs, thunder drums, steel and leather.',
    defaultTheme: 'steel',
    vocab: ['steel', 'thunder', 'leather', 'highway', 'iron', 'midnight', 'power', 'glory', 'rebel', 'saint', 'sinner', 'road'],
    titlePatterns: ['Steel and {T}', 'Riding the {T}', '{T} Tonight', 'King of {T}', 'Thunder and {T}', 'The {T} Rides On', 'Heart of {T}', '{T} in the Night', 'Born to {T}', 'Legends of {T}', 'Highway {T}', '{T} or Nothing'],
    statements: [
      "There's thunder in my chest and steel in my soul",
      'We ride at midnight with the highway on fire',
      'Leather and gasoline, that is all I need',
      'The crowd is roaring and the amps are alive',
      'I never asked for permission to be loud',
      'I was born to raise hell and play it loud',
      'The road is my home and the night is mine',
      'One riff at a time, we take it all back'
    ],
    hookTemplates: [
      'Ride the {T} till the morning light',
      'Steel in our hearts, {T} in our souls',
      'We are the {T} — we ride tonight',
      'Thunder and {T}, forever loud',
      'Raise your fist for the {T}'
    ]
  },
  {
    id: 'rock', name: 'Rock', bpm: 122, bpmRange: [104, 138],
    blurb: 'Big guitars, bigger choruses. Heart, highway, and neon nights.',
    defaultTheme: 'highway',
    vocab: ['highway', 'neon', 'radio', 'heart', 'summer', 'gasoline', 'midnight', 'freedom', 'thunder', 'dreams', 'lights', 'wild'],
    titlePatterns: ['{T} Tonight', 'Highway {T}', 'Neon {T}', 'The {T} Song', 'Heart of {T}', 'Summer {T}', 'Radio {T}', 'Chasing {T}', 'My {T}', '{T} and Rain', 'The Last {T}', 'We Are {T}'],
    statements: [
      'Highway lights and a radio song carry me home',
      'We were young and the night was ours',
      'Turn the radio up, let the whole town hear',
      'I left my heart back in a small town',
      'Gasoline and neon, that is how we roll',
      'Every summer ends but this one stays',
      'We danced on the edge of a Friday night',
      'The band is loud and the feeling is right'
    ],
    hookTemplates: [
      'Turn it up — this is our {T}',
      'We were born for the {T} tonight',
      'Sing it loud, the {T} is ours',
      'Highway hearts and {T} dreams',
      'This is the {T} we have been waiting for'
    ]
  },
  {
    id: 'rap', name: 'Rap', bpm: 92, bpmRange: [80, 104],
    blurb: 'Boom-bap. Bars that hit, flow that never stops, stories from the block.',
    defaultTheme: 'grind',
    vocab: ['grind', 'hustle', 'crown', 'blocks', 'mic', 'dreams', 'streets', 'gold', 'kings', 'truth', 'money', 'respect'],
    titlePatterns: ['{T} Season', 'King of {T}', 'The {T} Grind', '{T} or Nothing', 'Bars About {T}', 'My {T} Story', 'Straight From {T}', '{T} to the Top', 'Hustle and {T}', 'The {T} Tape', 'Voice of {T}', 'All About {T}'],
    statements: [
      'I started from the bottom of a broken block',
      'They counted me out, I counted the bands',
      'Every bar I write is a page from my life',
      'I came from nothing and I turned it to gold',
      'The mic is my weapon and the booth is my church',
      'I take no handouts, no shortcuts — just work and the grind',
      'They laughed when I dreamed, now they quote what I said',
      'I put my whole city on my back and I run'
    ],
    hookTemplates: [
      'This is the {T}, and I am the truth',
      'Every bar about the {T} hits hard',
      'From the {T} straight to the top',
      'I put the {T} in every line I write',
      'The {T} is mine, I earned this crown'
    ]
  },
  {
    id: 'hip-hop', name: 'Hip-Hop', bpm: 98, bpmRange: [86, 112],
    blurb: '808s, smooth flow, city nights. Vibe first, bars second.',
    defaultTheme: 'city',
    vocab: ['city', 'vibe', 'gold', 'nights', 'diamonds', 'moonlight', 'dreams', 'neon', 'rhythm', 'soul', 'waves', 'crown'],
    titlePatterns: ['{T} Nights', 'Vibe of the {T}', 'City of {T}', 'Gold and {T}', 'Midnight {T}', 'The {T} Wave', '{T} on My Mind', 'Dreams of {T}', 'Neon {T}', 'Rhythm of the {T}', '{T} Forever', 'All Night {T}'],
    statements: [
      'City lights and a pocket full of dreams keep me moving',
      'Turn the night up, let the speakers breathe',
      "There's moonlight on the rooftop and gold on my mind",
      'We float through the city like a wave in the dark',
      'Every night is a movie and I am the star',
      'Slow it down, let the rhythm do the talking',
      'Diamonds in the dark while the beat never stops',
      'This is my city, this is my sound'
    ],
    hookTemplates: [
      'Ride the wave of the {T} all night',
      'City lights and the {T} on my mind',
      'This is the {T}, let the beat roll',
      'Moonlight, gold, and the {T}',
      'We float through the {T} till the sunrise'
    ]
  }
];
function genreById(id) {
  for (var i = 0; i < GENRES.length; i++) if (GENRES[i].id === id) return GENRES[i];
  return GENRES[0];
}

/* =====================================================================
 * STYLES — 10 styles. Each style: allowed genres, family tag bias,
 * hook templates, extra line prefixes.
 * ===================================================================== */
var STYLES = [
  { id: 'heavy', name: 'Heavy', feel: 'Powerful, crushing, hard-hitting',
    genres: ['metal', 'heavy-metal', 'rock', 'rap', 'hip-hop'], tags: ['heavy'],
    hookTemplates: ['We rise from the {T} — we never break', 'Through the {T} we ride again', 'Hear us roar: {T} forever', 'This is {T}, and we hit hard'],
    prefixes: ['Yeah, ', 'Listen, '] },
  { id: 'slow-romantic', name: 'Slow Romantic', feel: 'Emotional, intimate, melodic',
    genres: ['rock', 'heavy-metal', 'metal', 'rap', 'hip-hop'], tags: ['romantic'],
    hookTemplates: ['Hold me close in the {T} tonight', "We're slow dancing through the {T}", 'You are my {T}, you are my home', 'In the {T}, I found your heart'],
    prefixes: ['Softly, ', 'Slowly, ', 'Baby, '] },
  { id: 'aggressive', name: 'Aggressive', feel: 'Intense, confrontational',
    genres: ['metal', 'heavy-metal', 'rap', 'rock', 'hip-hop'], tags: ['heavy', 'dark'],
    hookTemplates: ['Step up or get out of the {T}', 'I will tear the {T} apart', "There's no mercy in the {T} tonight", 'Bring the {T} — I am ready'],
    prefixes: ['Listen up, ', 'Hear me, '] },
  { id: 'dark', name: 'Dark', feel: 'Brooding, haunting, atmospheric',
    genres: ['metal', 'heavy-metal', 'rock', 'rap', 'hip-hop'], tags: ['dark'],
    hookTemplates: ['In the {T}, the shadows call my name', 'Darkness falls on the {T}', 'The {T} is where the lost ones go', "There's no light inside the {T}"],
    prefixes: ['In the dark, ', 'Somewhere in the shadows, ', 'At midnight, '] },
  { id: 'melancholic', name: 'Melancholic', feel: 'Sad, reflective, personal',
    genres: ['rock', 'metal', 'heavy-metal', 'rap', 'hip-hop'], tags: ['sad'],
    hookTemplates: ['I miss the {T} we used to know', 'The {T} is gone and so am I', "I'm singing for the {T} I lost", 'All that is left is the {T}'],
    prefixes: ['Some days, ', 'Lately, ', 'Back then, '] },
  { id: 'anthemic', name: 'Anthemic', feel: 'Big choruses, memorable hooks',
    genres: ['rock', 'heavy-metal', 'metal', 'rap', 'hip-hop'], tags: ['bright', 'heavy'],
    hookTemplates: ['Sing it louder — {T}!', 'We are the {T}, hear us now', 'Every voice in the {T} sings tonight', 'This is our {T}, this is our time'],
    prefixes: ['Everybody, ', 'All together now, ', 'One more time, '] },
  { id: 'uplifting', name: 'Uplifting', feel: 'Hopeful, triumphant',
    genres: ['rock', 'heavy-metal', 'rap', 'hip-hop', 'metal'], tags: ['bright'],
    hookTemplates: ['Rise above the {T}, we are free', 'The {T} could not hold us down', 'We made it through the {T}', 'Brighter days wait past the {T}'],
    prefixes: ['Today, ', 'Finally, ', 'This time, '] },
  { id: 'rebellious', name: 'Rebellious', feel: 'Defiant, independent',
    genres: ['metal', 'heavy-metal', 'rock', 'rap', 'hip-hop'], tags: ['heavy', 'street'],
    hookTemplates: ['We do not bow to the {T}', 'There are no rules in the {T} tonight', 'They said stop — we turned up the {T}', 'We were born to break the {T}'],
    prefixes: ['They told me no, ', 'No apologies, ', 'Never again, '] },
  { id: 'melodic', name: 'Melodic', feel: 'Tuneful, expressive',
    genres: ['rock', 'heavy-metal', 'metal', 'hip-hop', 'rap'], tags: ['romantic', 'bright'],
    hookTemplates: ['Sing me the {T} one more time', 'The melody of the {T} stays', 'Every note of the {T} is mine', "We're humming the {T} all night long"],
    prefixes: ['Softly now, ', 'Like a song, ', 'In tune, '] },
  { id: 'emotional', name: 'Emotional', feel: 'Vulnerable, passionate',
    genres: ['rock', 'rap', 'hip-hop', 'metal', 'heavy-metal'], tags: ['romantic', 'sad'],
    hookTemplates: ['This is my heart, this is the {T}', 'I feel the {T} in every bone', 'The {T} is everything I am', 'Cry with me in the {T}'],
    prefixes: ['Honestly, ', 'From the heart, ', 'I swear, '] }
];
function styleById(id) {
  for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
  return null;
}
function stylesForGenre(genreId) {
  return STYLES.filter(function (s) { return s.genres.indexOf(genreId) !== -1; });
}
/* Compatible style pairs (from the spec). */
var STYLE_PAIRS = [
  ['dark', 'heavy'], ['melodic', 'aggressive'], ['slow-romantic', 'emotional'],
  ['heavy', 'rebellious'], ['dark', 'melancholic'], ['anthemic', 'uplifting'],
  ['melodic', 'emotional'], ['aggressive', 'rebellious'], ['dark', 'aggressive'],
  ['melancholic', 'emotional'], ['anthemic', 'rebellious'], ['heavy', 'anthemic']
];
function stylesCompatible(a, b) {
  if (!a || !b || a === b) return a !== b;
  for (var i = 0; i < STYLE_PAIRS.length; i++) {
    var p = STYLE_PAIRS[i];
    if ((p[0] === a && p[1] === b) || (p[0] === b && p[1] === a)) return true;
  }
  return false;
}

/* =====================================================================
 * THEMES — description keyword matching.
 * ===================================================================== */
var THEME_WORDS = [
  ['love', 'love'], ['heart', 'heart'], ['girl', 'her'], ['woman', 'her'],
  ['fight', 'fight'], ['fighting', 'fight'], ['refuse', 'fight'], ['refusing', 'fight'], ['give up', 'fight'], ['freedom', 'freedom'], ['night', 'night'],
  ['home', 'home'], ['loss', 'loss'], ['pain', 'pain'], ['war', 'war'],
  ['dream', 'dreams'], ['street', 'streets'], ['money', 'money'],
  ['death', 'death'], ['hope', 'hope'], ['family', 'family'],
  ['revenge', 'revenge'], ['ghost', 'ghosts'], ['fire', 'fire'],
  ['rain', 'rain'], ['road', 'road'], ['highway', 'highway'],
  ['city', 'city'], ['steel', 'steel'], ['blood', 'blood'],
  ['dark', 'darkness'], ['light', 'light'], ['devil', 'demons'], ['demon', 'demons'],
  ['angel', 'angels'], ['mom', 'mama'], ['dad', 'papa'], ['brother', 'brother'],
  ['sister', 'sister'], ['kids', 'kids'], ['son', 'son'], ['daughter', 'daughter'],
  ['faith', 'faith'], ['god', 'god'], ['hell', 'hell'], ['heaven', 'heaven'],
  ['summer', 'summer'], ['winter', 'winter'], ['ocean', 'ocean'],
  ['river', 'river'], ['mountain', 'mountains'], ['party', 'party'],
  ['dance', 'dancing'], ['breakup', 'heartbreak'], ['miss', 'heartbreak'], ['missing', 'heartbreak'], ['cheat', 'betrayal'], ['betrayal', 'betrayal'], ['betrayed', 'betrayal'],
  ['jail', 'prison'], ['prison', 'prison'], ['hustle', 'hustle'],
  ['grind', 'grind'], ['crown', 'crown'], ['thunder', 'thunder'],
  ['storm', 'storm'], ['ashes', 'ashes'], ['chains', 'chains']
];
function extractTheme(description, genreId) {
  var text = (description || '').toLowerCase();
  /* The first thing Robert mentions is the theme — earliest keyword wins.
     Whole-word match (optional plural) so 'son' never matches 'song'. */
  var best = null, bestIdx = -1;
  for (var i = 0; i < THEME_WORDS.length; i++) {
    var idx = text.search(new RegExp('\\b' + THEME_WORDS[i][0] + 's?\\b'));
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; best = THEME_WORDS[i][1]; }
  }
  if (best) return best;
  return genreById(genreId).defaultTheme;
}

/* =====================================================================
 * RANDOM IDEAS — themes, opening lines, story concepts, chorus ideas.
 * ===================================================================== */
var IDEA_THEMES = [
  'coming home after a long time away', 'a fight you refuse to lose',
  'the night everything changed', 'a love that will not die',
  'leaving a small town behind', 'standing up to someone who wronged you',
  'the last summer before everything changed', 'a promise you intend to keep',
  'rising from rock bottom', 'a friend who never gave up on you',
  'the road at 2 AM', 'a memory that will not let go',
  'burning the past and starting over', 'a girl who saved you',
  'the city that raised you', 'a dream worth chasing',
  'saying goodbye for the last time', 'a secret you have carried for years',
  'the storm before the calm', 'finding hope in a dark place'
];
var IDEA_OPENERS = [
  'I was sixteen when the night caught fire',
  'They told me I would never make it out',
  'The radio was playing our song again',
  'I packed my bags before the sun came up',
  'Midnight found me standing in the rain',
  'I still hear your voice in an empty room',
  'The city never sleeps and neither do I',
  'I lit a match and watched the past burn',
  'Nobody believed me till the crowd went wild',
  'I woke up with thunder in my chest',
  'The last train out of town was leaving at nine',
  'She left a note that said do not follow me',
  'I traded my halo for a broken crown',
  'The storm rolled in right as the band kicked off',
  'I have been down so long the up feels strange'
];
var IDEA_STORIES = [
  'A kid from a small town bets everything on one night in the city.',
  'Two brothers split by a lie find their way back to each other.',
  'A fighter who lost everything trains for one last shot at redemption.',
  'A girl leaves home with nothing but a guitar and a goodbye note.',
  'A man burns every bridge behind him, then realizes one was worth keeping.',
  'A band plays their last show together and nobody wants it to end.',
  'Someone finally says the thing they have held back for ten years.',
  'A night drive becomes a confession, a goodbye, and a new beginning.',
  'A kid steals his dad’s old record and finds the sound that saves him.',
  'Two old friends meet after years apart and pick up right where they left off.'
];
var IDEA_CHORUSES = [
  'A one-line shout everyone can sing along to',
  'A repeat of the song title, louder every time',
  'A question the whole crowd answers back',
  'A short phrase about never giving up',
  'A line about home that hits everyone the same way',
  'A vow: this time I am not backing down',
  'A melody built on just three words, repeated with power',
  'A call-and-response between the singer and the crowd',
  'A line that names the feeling nobody can say out loud',
  'A final line that sounds like a promise and a warning at once'
];
function randomIdea(rng) {
  rng = rng || makeRng(Date.now() % 2147483647);
  return {
    theme: pick(rng, IDEA_THEMES),
    openingLine: pick(rng, IDEA_OPENERS),
    story: pick(rng, IDEA_STORIES),
    chorusIdea: pick(rng, IDEA_CHORUSES)
  };
}

/* =====================================================================
 * SYLLABLES + RHYME HELPERS
 * ===================================================================== */
function countSyllables(text) {
  var words = (text || '').toLowerCase().replace(/[^a-z\s']/g, '').split(/\s+/).filter(Boolean);
  var total = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i].replace(/'s$/, '');
    if (!w) continue;
    var groups = w.match(/[aeiouy]+/g);
    var n = groups ? groups.length : 0;
    if (w.length > 3 && /e$/.test(w)) n--; /* silent e */
    if (w.length > 4 && /ed$/.test(w)) n--;
    if (n <= 0) n = 1;
    total += n;
  }
  return total;
}
function lastWord(line) {
  var m = (line || '').trim().match(/[a-zA-Z']+[^a-zA-Z']*$/);
  if (!m) return '';
  return m[0].replace(/[^a-zA-Z']/g, '').toLowerCase();
}
function familyOfWord(word) {
  var w = (word || '').toLowerCase();
  for (var i = 0; i < RHYME_FAMILIES.length; i++) {
    if (RHYME_FAMILIES[i].words.indexOf(w) !== -1) return RHYME_FAMILIES[i];
  }
  return null;
}
function familyById(id) {
  for (var i = 0; i < RHYME_FAMILIES.length; i++) if (RHYME_FAMILIES[i].id === id) return RHYME_FAMILIES[i];
  return null;
}
function familiesForTags(tags) {
  var out = RHYME_FAMILIES.filter(function (f) {
    return f.tags.some(function (t) { return tags.indexOf(t) !== -1; });
  });
  return out.length ? out : RHYME_FAMILIES;
}

/* =====================================================================
 * MY VOICE — style profile built from Robert's own sample lyrics.
 * Stored locally. A reusable setting, not a separate engine.
 * ===================================================================== */
var VOICE_STOPWORDS = ['the', 'and', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were', 'it', 'its', 'i', 'me', 'my', 'we', 'you', 'your', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'this', 'that', 'but', 'so', 'if', 'at', 'by', 'as', 'from', 'up', 'out', 'no', 'not', 'do', 'did', 'just', 'like', 'get', 'got', 'im', "i'm", 'dont', "don't", 'cant', "can't", 'yeah', 'oh', 'hey', 'all', 'one', 'two', 'when', 'then', 'now', 'back', 'over', 'into', 'about'];
function tokenizeWords(text) {
  return (text || '').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
}
function buildVoiceProfile(sampleText) {
  var text = sampleText || '';
  var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var words = tokenizeWords(text).filter(function (w) { return VOICE_STOPWORDS.indexOf(w) === -1 && w.length > 2; });
  var counts = {};
  words.forEach(function (w) { counts[w] = (counts[w] || 0) + 1; });
  var topWords = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
  /* Two-word phrases (bigrams) Robert actually uses. */
  var bigrams = {};
  var allWords = tokenizeWords(text);
  for (var i = 0; i + 1 < allWords.length; i++) {
    var bg = allWords[i] + ' ' + allWords[i + 1];
    if (VOICE_STOPWORDS.indexOf(allWords[i]) === -1 && VOICE_STOPWORDS.indexOf(allWords[i + 1]) === -1) {
      bigrams[bg] = (bigrams[bg] || 0) + 1;
    }
  }
  var topPhrases = Object.keys(bigrams).sort(function (a, b) { return bigrams[b] - bigrams[a]; }).slice(0, 8);
  /* Rhyme endings: last word of each line. */
  var endings = {};
  lines.forEach(function (l) {
    var w = lastWord(l);
    if (w) endings[w] = (endings[w] || 0) + 1;
  });
  var topEndings = Object.keys(endings).sort(function (a, b) { return endings[b] - endings[a]; }).slice(0, 6);
  var syll = 0;
  lines.forEach(function (l) { syll += countSyllables(l); });
  return {
    sampleLines: lines.length,
    totalLines: lines.length,
    topWords: topWords,
    topPhrases: topPhrases,
    rhymeEndings: topEndings,
    avgSyllables: lines.length ? Math.round((syll / lines.length) * 10) / 10 : 0,
    firstPerson: (text.match(/\b(i|my|me|we|our)\b/gi) || []).length,
    createdAt: Date.now()
  };
}
function voiceSummary(profile) {
  if (!profile || !profile.sampleLines) return 'No voice profile yet. Paste some of your own lyrics and build one.';
  return profile.sampleLines + ' lines analyzed · favorite words: ' +
    (profile.topWords.slice(0, 5).join(', ') || '—') +
    ' · rhyme endings: ' + (profile.rhymeEndings.slice(0, 4).join(', ') || '—') +
    ' · avg ' + profile.avgSyllables + ' syllables per line';
}

/* =====================================================================
 * LINE BUILDERS
 * A verse couplet = two lines from one rhyme family, different words.
 * ctx: { genre, styles, theme, voice, easy, darkBias, extraPrefixes }
 * ===================================================================== */
/* =====================================================================
 * GRAMMAR GATE — every generated line must read like a real sentence.
 * validateLine returns { ok: true } or { ok: false, reason: '...' }.
 * A line passes when, after stripping leading discourse markers, it
 * opens with a subject (I / We / You / They / It / There's / The ...)
 * or an imperative verb, has >= 3 words, has no word doubled right
 * next to itself, does not end dangling (preposition / article /
 * and / but), and does not pair a subject with the wrong verb form:
 *   "I'm lose" / "We're let"  (contraction + base verb)
 *   "I running" / "We fighting" (bare subject + gerund)
 *   "I burns" / "We falls"    (bare subject + verb ending in -s)
 * Fragments fail because after the markers are stripped there is no
 * subject/verb opener left: "So in the scream" -> "in the scream".
 * The gate is tuned for generated couplet lines, which are built from
 * clause openers by construction. Hand-written hooks and statements
 * (slogans like "Thunder and fire, forever loud") are checked by hand
 * and are exempt from this gate in checkSong.
 * ===================================================================== */
var SUBJECT_WORDS = ['i', 'we', 'you', 'they', 'he', 'she', 'it', "i'm", "we're", "you're", "they're", "he's", "she's", "it's", 'my', 'these', 'the', 'what', 'nobody', 'this', 'that', "there's", 'there', 'every', 'no'];
var IMPERATIVE_VERBS = ['give', 'turn', 'sing', 'burn', 'run', 'look', 'hold', 'take', 'keep', 'let', 'hear', 'rise', 'fall', 'stand', 'fight', 'wait', 'watch', 'remember', 'cry', 'follow', 'chase', 'break', 'raise', 'shout', 'call', 'reach', 'face', 'own', 'rule', 'want', 'need', 'feel', 'see', 'know', 'find', 'leave', 'go', 'come', 'stay', 'live', 'die', 'love', 'hate', 'try', 'use', 'work', 'play', 'talk', 'walk', 'jump', 'climb', 'ride', 'drive', 'dance', 'drink', 'sleep', 'wake', 'dream', 'rest', 'pray', 'hope', 'wish', 'beg', 'swear', 'speak', 'tell', 'say', 'show', 'bring', 'pull', 'push', 'carry', 'drop', 'throw', 'catch', 'grab', 'hide', 'seek', 'hit', 'kick', 'strike', 'win', 'lose', 'miss', 'forget', 'forgive', 'learn', 'grow', 'change', 'return', 'arrive', 'escape', 'flee', 'hunt', 'search', 'listen', 'laugh', 'smile', 'stare', 'think', 'believe', 'trust', 'fear', 'kiss', 'touch', 'grip', 'tear', 'rip', 'smash', 'crush', 'cut', 'paint', 'write', 'march', 'sit', 'lie', 'kneel', 'bow', 'leap', 'dive', 'fly', 'soar', 'glide', 'drift', 'float', 'swim', 'sail', 'creep', 'slide', 'slip', 'trip', 'stumble', 'race', 'rush', 'hurry', 'linger'];
var GERUNDS = ['running', 'fighting', 'burning', 'falling', 'rising', 'drowning', 'chasing', 'singing', 'crying', 'screaming', 'waiting', 'looking', 'walking', 'talking', 'dancing', 'bleeding', 'breaking', 'losing', 'winning', 'driving', 'riding', 'climbing', 'crawling', 'kneeling', 'hiding', 'seeking', 'standing', 'holding', 'carrying', 'following', 'searching', 'listening', 'laughing', 'smiling', 'staring', 'thinking', 'believing', 'trusting', 'fearing', 'kissing', 'touching', 'gripping', 'tearing', 'smashing', 'crushing', 'cutting', 'painting', 'writing', 'marching', 'sitting', 'lying', 'leaping', 'diving', 'flying', 'soaring', 'gliding', 'drifting', 'floating', 'swimming', 'sailing', 'creeping', 'sliding', 'slipping', 'tripping', 'stumbling', 'racing', 'rushing', 'hurrying', 'lingering', 'turning', 'watching', 'feeling', 'giving', 'taking', 'keeping', 'letting', 'hearing', 'remembering', 'wanting', 'needing', 'seeing', 'knowing', 'finding', 'leaving', 'going', 'coming', 'staying', 'living', 'dying', 'loving', 'hating', 'trying', 'using', 'working', 'playing', 'jumping', 'drinking', 'sleeping', 'waking', 'dreaming', 'resting', 'praying', 'hoping', 'wishing', 'begging', 'swearing', 'speaking', 'telling', 'saying', 'showing', 'bringing', 'pulling', 'pushing', 'dropping', 'throwing', 'catching', 'grabbing', 'hitting', 'kicking', 'striking', 'missing', 'forgetting', 'forgiving', 'learning', 'growing', 'changing', 'returning', 'arriving', 'escaping', 'fleeing', 'hunting'];
var AUXILIARIES = ['was', 'were', 'is', 'are', 'has', 'have', 'had', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'must', 'might', 'am', 'be', 'been', 'being'];
var DANGLING_ENDS = ['the', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'from', 'by', 'and', 'but', 'so', 'my', 'your', 'his', 'her', 'its', 'our', 'their'];
/* Discourse markers that may lead a line (line prefixes + all style
   prefixes + the bridge's "But now — "). Derived here so the gate and
   the builders can never drift apart. Longest first, so "But now — "
   strips before "But ". */
var MARKER_PHRASES = (function () {
  var seen = {}, out = [];
  function add(p) {
    var t = (p || '').trim();
    if (t && !seen[t]) { seen[t] = true; out.push(t); }
  }
  LINE_PREFIXES.forEach(add);
  Object.keys(STYLES).forEach(function (k) { STYLES[k].prefixes.forEach(add); });
  add('But now — ');
  out.sort(function (a, b) { return b.length - a.length; });
  return out;
})();
function stripMarkers(line) {
  var s = (line || '').trim();
  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < MARKER_PHRASES.length; i++) {
      var m = MARKER_PHRASES[i];
      if (s.toLowerCase().indexOf(m.toLowerCase()) === 0) {
        s = s.slice(m.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}
function wordsOf(text) {
  return (text || '').replace(/[—–]/g, ' ').replace(/[^a-zA-Z\s']/g, ' ').split(/\s+/).filter(Boolean);
}
function validateLine(line) {
  var raw = (line || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  var words = wordsOf(raw);
  if (words.length < 3) return { ok: false, reason: 'too short' };
  /* Duplicated word right next to itself ("the the", "fire fire"). */
  for (var i = 0; i + 1 < words.length; i++) {
    if (words[i].toLowerCase() === words[i + 1].toLowerCase()) {
      return { ok: false, reason: 'repeated word "' + words[i] + '"' };
    }
  }
  /* Dangling ending: the line stops on a word that needs something after it. */
  var last = words[words.length - 1].toLowerCase();
  if (DANGLING_ENDS.indexOf(last) !== -1) {
    return { ok: false, reason: 'dangling ending "' + last + '"' };
  }
  /* A standalone lowercase "i" is never right ("Keep driving, i put ..."). */
  if (/\bi\b/.test(raw)) return { ok: false, reason: 'lowercase "i"' };
  /* "I said" buried inside a line is leftover filler — reject it. */
  if (/\bi said\b/i.test(raw)) return { ok: false, reason: 'filler "I said"' };
  /* Strip discourse markers, then the line must open with a subject
     (I / We / You / They / It / There's / The ...) or an imperative verb. */
  var body = stripMarkers(raw);
  var bwords = wordsOf(body);
  if (bwords.length < 3) return { ok: false, reason: 'fragment after markers' };
  var first = bwords[0].toLowerCase();
  var second = bwords.length > 1 ? bwords[1].toLowerCase() : '';
  var isSubject = SUBJECT_WORDS.indexOf(first) !== -1;
  var isImperative = IMPERATIVE_VERBS.indexOf(first) !== -1 || first === "don't";
  if (!isSubject && !isImperative) {
    return { ok: false, reason: 'fragment: starts with "' + bwords[0] + '"' };
  }
  if (isSubject) {
    var contraction = ["i'm", "we're", "you're", "they're", "he's", "she's", "it's"].indexOf(first) !== -1;
    if (contraction && IMPERATIVE_VERBS.indexOf(second) !== -1) {
      return { ok: false, reason: '"' + bwords[0] + ' ' + bwords[1] + '" is not a verb form' };
    }
    var bare = ['i', 'we', 'you', 'they'].indexOf(first) !== -1;
    if (bare && GERUNDS.indexOf(second) !== -1) {
      return { ok: false, reason: 'subject + gerund ("' + bwords[0] + ' ' + bwords[1] + '")' };
    }
    if (bare && second.length > 2 && /s$/.test(second) && AUXILIARIES.indexOf(second) === -1 && second !== 'is' && second !== 'has' && second !== 'does') {
      return { ok: false, reason: 'subject + wrong verb form ("' + bwords[0] + ' ' + bwords[1] + '")' };
    }
  }
  return { ok: true };
}

function buildCouplet(rng, ctx, usedLines) {
  var tags = [];
  (ctx.styles || []).forEach(function (s) {
    var st = styleById(s);
    if (st) tags = tags.concat(st.tags);
  });
  if (ctx.darkBias) tags.push('dark');
  var pool = tags.length ? familiesForTags(tags) : RHYME_FAMILIES;
  /* Voice bias: prefer families holding one of Robert's rhyme endings —
     but only when his endings cover enough ground. A 2-family pool
     (e.g. just night + rain) would force the same few rhyme words over
     and over for a whole song, so the full style pool stays instead. */
  if (ctx.voice && ctx.voice.rhymeEndings && ctx.voice.rhymeEndings.length) {
    var voiced = pool.filter(function (f) {
      return f.words.some(function (w) { return ctx.voice.rhymeEndings.indexOf(w) !== -1; });
    });
    var voicedWords = 0;
    voiced.forEach(function (f) { voicedWords += f.words.length; });
    if (voiced.length >= 4 && voicedWords >= 12 && rng() < 0.6) pool = voiced;
  }
  var usedWords = ctx.usedWords || [];
  /* Prefer families that still have two fresh rhyme words left. Many
     families hold only two words, so picking the same family twice
     would force a reused rhyme word — steer to a fresh family instead
     while the style pool still has one, and only fall back to the full
     pool when every family is spent. */
  var famPool = pool;
  if (usedWords.length) {
    var fresh = pool.filter(function (f) {
      var unused = f.words.filter(function (w) { return usedWords.indexOf(w) === -1; });
      return unused.length >= 2;
    });
    if (fresh.length) famPool = fresh;
  }
  var fam = pick(rng, famPool);
  /* Easy mode: use the family's shortest leads (easier to perform). */
  var leads = fam.leads.slice();
  if (ctx.easy) leads = leads.sort(function (a, b) { return a.length - b.length; }).slice(0, 2);
  var prefixes = LINE_PREFIXES.slice();
  if (ctx.extraPrefixes) prefixes = prefixes.concat(ctx.extraPrefixes);
  /* Build candidate lines: [discourse marker][clause opener][rhyme word].
     Every candidate must pass the grammar gate and must not repeat a
     line already used in this song. Pass 1 also keeps rhyme words fresh
     (no word reused in the same song); pass 2 relaxes that so a long
     song never stalls when its style pool runs low. Balance the couplet
     (<= 4 syllables apart) and keep the best pair. Fallbacks, in order:
     best balanced valid pair, first valid pair, then a sweep of every
     lead x word pair with no marker (valid by construction) that is not
     already used — and only as an absolute last resort the plain first
     lead + first words. The fallback must never return one fixed line
     for a family, or the same line would repeat across sections. */
  /* A line with a discourse marker reads as one sentence, so the clause
     after the marker continues lowercase ("But we live with the blame",
     never "But We live..."). "I" and its contractions stay capital. */
  function withMarker(lead, word) {
    var pfx = pick(rng, prefixes);
    var ld = pfx ? lowerFirstUnlessI(lead) : lead;
    return capFirst((pfx + ld + ' ' + word).trim());
  }
  var best = null, bestDiff = Infinity, firstValid = null;
  for (var attempt = 0; attempt < 12; attempt++) {
    var words = pickDistinct(rng, fam.words, 2);
    if (attempt < 8 && (usedWords.indexOf(words[0]) !== -1 || usedWords.indexOf(words[1]) !== -1)) continue;
    var l1 = withMarker(pick(rng, leads), words[0]);
    var l2 = withMarker(pick(rng, leads), words[1]);
    if (!validateLine(l1).ok || !validateLine(l2).ok) continue;
    if (usedLines && (usedLines.indexOf(l1) !== -1 || usedLines.indexOf(l2) !== -1)) continue;
    if (!firstValid) firstValid = [l1, l2];
    var diff = Math.abs(countSyllables(l1) - countSyllables(l2));
    if (diff < bestDiff) { best = [l1, l2]; bestDiff = diff; }
    if (diff <= 4) break;
  }
  var lines = best || firstValid;
  if (!lines) {
    outer:
    for (var li = 0; li < fam.leads.length; li++) {
      for (var wi = 0; wi + 1 < fam.words.length; wi++) {
        var s1 = capFirst(fam.leads[li] + ' ' + fam.words[wi]);
        var s2 = capFirst(fam.leads[li] + ' ' + fam.words[wi + 1]);
        if (!validateLine(s1).ok || !validateLine(s2).ok) continue;
        if (usedLines && (usedLines.indexOf(s1) !== -1 || usedLines.indexOf(s2) !== -1)) continue;
        lines = [s1, s2];
        break outer;
      }
    }
  }
  if (!lines) lines = [capFirst(fam.leads[0] + ' ' + fam.words[0]), capFirst(fam.leads[0] + ' ' + fam.words[1])];
  /* Record the rhyme words so later couplets in this song pick fresh ones. */
  if (ctx.usedWords) {
    ctx.usedWords.push(lastWord(lines[0]));
    ctx.usedWords.push(lastWord(lines[1]));
  }
  /* Record the lines too, so a second couplet in the same section never
     repeats them (usedLines is otherwise only flushed at the end of a
     section, so two couplets in one verse could not see each other). */
  if (usedLines) {
    if (usedLines.indexOf(lines[0]) === -1) usedLines.push(lines[0]);
    if (usedLines.indexOf(lines[1]) === -1) usedLines.push(lines[1]);
  }
  return { lines: lines, family: fam.id };
}
function buildHook(rng, ctx) {
  var templates = [];
  var g = genreById(ctx.genre);
  if (g && g.hookTemplates) templates = templates.concat(g.hookTemplates);
  (ctx.styles || []).forEach(function (s) {
    var st = styleById(s);
    if (st) templates = templates.concat(st.hookTemplates);
  });
  if (!templates.length) templates = ['This is my {T}, hear me now', 'We are the {T} tonight'];
  /* Shuffle so the pick is not biased to the first template, then take
     the first one whose rendered line mentions the theme exactly once —
     a hook that repeats its own theme word reads broken
     ("Nothing left but the fire and the fire"). */
  var shuffled = shuffleCopy(rng, templates);
  var theme = (ctx.theme || '').toLowerCase();
  for (var i = 0; i < shuffled.length; i++) {
    var line = shuffled[i].split('{T}').join(ctx.theme);
    var count = theme ? line.toLowerCase().split(theme).length - 1 : 0;
    if (count === 1) return line;
  }
  return shuffled[0].split('{T}').join(ctx.theme);
}
function buildStatement(rng, ctx, usedLines) {
  var g = genreById(ctx.genre);
  /* Never repeat a statement already used in this song (raw or voice-flavored). */
  var pool = g.statements.filter(function (s) {
    if (!usedLines || !usedLines.length) return true;
    var low = s.toLowerCase();
    return !usedLines.some(function (u) { return u.toLowerCase().indexOf(low) !== -1; });
  });
  if (!pool.length) pool = g.statements;
  var line = pick(rng, pool);
  /* Voice flavor: sometimes open with one of Robert's own phrases —
     but only when the flavored line still reads as a real sentence.
     A bare noun phrase in front ("Midnight rain, ...") is a fragment,
     so the gate keeps the plain line instead. */
  if (ctx.voice && ctx.voice.topPhrases && ctx.voice.topPhrases.length && rng() < 0.35) {
    var flavored = capFirst(pick(rng, ctx.voice.topPhrases)) + ', ' + lowerFirstUnlessI(line);
    if (validateLine(flavored).ok && countSyllables(flavored) <= 14) line = flavored;
  }
  return line;
}

/* =====================================================================
 * SECTIONS — each section has a role in the song's development arc.
 * ===================================================================== */
/* Lowercase a line's first letter — except "I" and its contractions,
   which are always capital. Used after a discourse marker ("But we
   live with the blame", never "But We live...") and after "But now — "
   in the bridge ("But now — I burn...", never "But now — i burn..."). */
function lowerFirstUnlessI(line) {
  var s = line || '';
  if (/^(I\b|I'm|I've|I'll|I'd)/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function generateSection(role, rng, ctx, usedLines) {
  var lines = [], fams = [], label = role, seedIndices = [];
  if (role === 'verse1') {
    label = 'Verse 1 — introduces the situation';
    var c1 = buildCouplet(rng, ctx, usedLines);
    var c2 = buildCouplet(rng, ctx, usedLines);
    lines = c1.lines.concat(c2.lines);
    fams = [c1.family, c2.family];
    /* Seed lines open verse 1 in My Lyrics mode — kept word for word. */
    if (ctx.seedLines && ctx.seedLines.length) {
      var seeds = ctx.seedLines.slice(0, 2);
      lines = seeds.concat(lines).slice(0, 4);
      seedIndices = seeds.map(function (_, i) { return i; });
    } else if (!ctx.easy && rng() < 0.5) {
      /* Statement line closes the verse as an extra line — never breaks a couplet. */
      lines = lines.concat([buildStatement(rng, ctx, usedLines)]);
    }
  } else if (role === 'verse2') {
    label = 'Verse 2 — develops the story';
    var d1 = buildCouplet(rng, ctx, usedLines);
    var d2 = buildCouplet(rng, ctx, usedLines);
    lines = d1.lines.concat(d2.lines);
    fams = [d1.family, d2.family];
    if (ctx.seedLines && ctx.seedLines.length > 2) {
      lines[2] = ctx.seedLines[2];
      seedIndices = [2];
    } else if (!ctx.easy && rng() < 0.5) {
      lines = lines.concat([buildStatement(rng, ctx, usedLines)]);
    }
  } else if (role === 'verse3') {
    label = 'Verse 3 — raises the stakes';
    var e1 = buildCouplet(rng, ctx, usedLines);
    var e2 = buildCouplet(rng, ctx, usedLines);
    lines = e1.lines.concat(e2.lines);
    fams = [e1.family, e2.family];
  } else if (role === 'chorus') {
    label = 'Chorus — the central message';
    var hook = buildHook(rng, ctx);
    var ch = buildCouplet(rng, ctx, usedLines);
    lines = [hook, ch.lines[0], ch.lines[1], hook];
    fams = [ch.family];
  } else if (role === 'bridge') {
    label = 'Bridge — a new perspective, the turning point';
    var bCtx = Object.assign({}, ctx, { darkBias: true });
    /* 'But now — ' adds 2 syllables to the first line, so retry the couplet
       until the pair still scans alike after the prefix. */
    var f1 = null, guard = 0;
    while (guard++ < 8) {
      var cand = buildCouplet(rng, bCtx, usedLines);
      /* Strip the couplet line's own leading marker first: a line that
         starts "Now ..." would otherwise read "But now — now ..." */
      var prefixed = 'But now — ' + lowerFirstUnlessI(stripMarkers(cand.lines[0]));
      if (Math.abs(countSyllables(prefixed) - countSyllables(cand.lines[1])) <= 4) { f1 = cand; break; }
      if (!f1) f1 = cand;
    }
    var f2 = buildCouplet(rng, bCtx, usedLines);
    lines = ['But now — ' + lowerFirstUnlessI(stripMarkers(f1.lines[0]))];
    lines.push(f1.lines[1]);
    lines = lines.concat(f2.lines);
    fams = [f1.family, f2.family];
    lines[0] = capFirst(lines[0]);
  } else if (role === 'outro') {
    label = 'Outro — resolution, the final word';
    var o = buildCouplet(rng, ctx, usedLines);
    lines = o.lines.slice();
    fams = [o.family];
    var closer = pick(rng, [
      'And this is where I stand.',
      'That is the end of the story — and the start of mine.',
      'Remember the name. Remember the song.',
      'We made it through, and we are still here.',
      'Turn it up one last time.',
      'This is how it ends — and how it begins.'
    ]);
    lines.push(closer);
  }
  lines.forEach(function (l) { if (usedLines.indexOf(l) === -1) usedLines.push(l); });
  return { id: role + '-' + Math.floor(rng() * 1e9).toString(36), role: role, label: label, lines: lines, families: fams, seedIndices: seedIndices };
}

/* =====================================================================
 * TITLES
 * ===================================================================== */
function generateTitles(rng, opts) {
  rng = rng || makeRng(Date.now() % 2147483647);
  opts = opts || {};
  var theme = opts.theme || 'fire';
  var g = genreById(opts.genre);
  var patterns = shuffleCopy(rng, g.titlePatterns);
  var out = [];
  var capTheme = capFirst(theme);
  var count = opts.count || 5;
  for (var i = 0; i < patterns.length && out.length < count; i++) {
    var t = patterns[i].split('{T}').join(capTheme);
    if (out.indexOf(t) === -1) out.push(t);
  }
  /* Fill with plain theme titles if patterns run short. */
  var fillers = ['My ' + capTheme, 'The ' + capTheme, capTheme + ' Tonight', 'Song of the ' + capTheme];
  var fi = 0;
  while (out.length < count && fi < fillers.length) {
    if (out.indexOf(fillers[fi]) === -1) out.push(fillers[fi]);
    fi++;
  }
  return out;
}

/* =====================================================================
 * SONG GENERATION — the main entry point.
 * opts: { method: 'lyrics'|'describe'|'both', seedLines, description,
 *         genre, styles[], length: 'short'|'full', bridge: bool,
 *         voice: profile|null, seed }
 * ===================================================================== */
function generateSong(opts) {
  opts = opts || {};
  var rng = makeRng(opts.seed || (Date.now() % 2147483647));
  var genre = genreById(opts.genre || 'rock');
  var styles = (opts.styles || []).filter(function (s) { return styleById(s); });
  if (!styles.length) styles = ['heavy'];
  /* Style availability: keep only styles allowed for this genre. */
  styles = styles.filter(function (s) { return styleById(s).genres.indexOf(genre.id) !== -1; });
  if (!styles.length) styles = ['heavy'];
  var theme;
  if (opts.method === 'describe' || opts.description) theme = extractTheme(opts.description || '', genre.id);
  else theme = genre.defaultTheme;
  /* Voice can override the theme if one of Robert's words matches a theme. */
  if (opts.voice && opts.voice.topWords) {
    for (var vi = 0; vi < opts.voice.topWords.length; vi++) {
      var vw = opts.voice.topWords[vi];
      for (var ti = 0; ti < THEME_WORDS.length; ti++) {
        if (THEME_WORDS[ti][1] === vw) { theme = vw; vi = 99; break; }
      }
    }
  }
  var ctx = {
    genre: genre.id, styles: styles, theme: theme,
    voice: opts.voice || null,
    seedLines: (opts.seedLines || []).map(function (l) { return l.trim(); }).filter(Boolean),
    extraPrefixes: [],
    usedWords: [] /* rhyme words already used in this song — couplets pick fresh ones */
  };
  (styles || []).forEach(function (s) {
    var st = styleById(s);
    if (st && st.prefixes) ctx.extraPrefixes = ctx.extraPrefixes.concat(st.prefixes);
  });
  var usedLines = [];
  var sections = [];
  var length = opts.length === 'short' ? 'short' : 'full';
  if (length === 'short') {
    sections.push(generateSection('verse1', rng, ctx, usedLines));
    sections.push(generateSection('chorus', rng, ctx, usedLines));
    if (opts.bridge) sections.push(generateSection('bridge', rng, ctx, usedLines));
    sections.push(generateSection('outro', rng, ctx, usedLines));
  } else {
    sections.push(generateSection('verse1', rng, ctx, usedLines));
    sections.push(generateSection('chorus', rng, ctx, usedLines));
    sections.push(generateSection('verse2', rng, ctx, usedLines));
    sections.push(generateSection('chorus', rng, ctx, usedLines));
    if (opts.bridge) sections.push(generateSection('bridge', rng, ctx, usedLines));
    sections.push(generateSection('verse3', rng, ctx, usedLines));
    sections.push(generateSection('chorus', rng, ctx, usedLines));
    sections.push(generateSection('outro', rng, ctx, usedLines));
  }
  /* My Lyrics mode: every one of Robert's lines must survive, even in a
     short song with no verse 2. Append any missing seed line to the last
     verse, marked as his so the quality checks never flag it. */
  if (ctx.seedLines.length) {
    var flatSoFar = [];
    sections.forEach(function (sec) { sec.lines.forEach(function (l) { flatSoFar.push(l); }); });
    ctx.seedLines.forEach(function (sl) {
      if (flatSoFar.indexOf(sl) === -1) {
        for (var i = sections.length - 1; i >= 0; i--) {
          if (sections[i].role.indexOf('verse') === 0) {
            sections[i].lines.push(sl);
            sections[i].seedIndices.push(sections[i].lines.length - 1);
            flatSoFar.push(sl);
            break;
          }
        }
      }
    });
  }
  var titles = generateTitles(rng, { theme: theme, genre: genre.id, count: 5 });
  var song = {
    id: opts.seed ? ('seed-' + opts.seed + '-' + genre.id + '-' + styles.join('+') + '-' + theme + '-' + length + (opts.bridge ? '-b' : '')) : uid(),
    title: titles[0],
    titles: titles,
    genre: genre.id,
    genreName: genre.name,
    styles: styles.slice(),
    styleNames: styles.map(function (s) { return styleById(s).name; }),
    method: opts.method || 'lyrics',
    theme: theme,
    length: length,
    bridge: !!opts.bridge,
    seedLines: ctx.seedLines,
    description: opts.description || '',
    voiceUsed: !!opts.voice,
    bpm: genre.bpm,
    createdAt: opts.seed ? opts.seed : Date.now(),
    favorite: false,
    sections: sections
  };
  song.warnings = checkSong(song);
  return song;
}
function songToText(song) {
  var out = [song.title, '', 'Genre: ' + genreById(song.genre).name + ' · ' + song.styleNames.join(' + ') + ' · ' + (song.length === 'short' ? 'Short' : 'Full') + (song.bridge ? ' · Bridge' : ''), ''];
  song.sections.forEach(function (sec) {
    out.push('[' + sec.role.replace('verse', 'Verse ').replace('chorus', 'Chorus').replace('bridge', 'Bridge').replace('outro', 'Outro') + ']');
    sec.lines.forEach(function (l) { out.push(l); });
    out.push('');
  });
  out.push('— written with Rock Hard (rule-based lyrics, no sung vocals)');
  return out.join('\n');
}
function flattenLines(song) {
  var out = [];
  song.sections.forEach(function (sec) {
    sec.lines.forEach(function (l) { out.push(l); });
  });
  return out;
}

/* =====================================================================
 * SECTION REGENERATION
 * instructions: 'darker' | 'powerful' | 'rhymes' | 'emotional' |
 *               'perform' | 'alternatives'
 * ===================================================================== */
function regenerateSection(song, sectionId, instruction, opts) {
  if (typeof opts === 'number') opts = { seed: opts };
  opts = opts || {};
  var rng = makeRng(opts.seed || (Date.now() % 2147483647));
  var idx = -1;
  for (var i = 0; i < song.sections.length; i++) if (song.sections[i].id === sectionId) { idx = i; break; }
  if (idx === -1) return null;
  var old = song.sections[idx];
  var usedLines = [];
  song.sections.forEach(function (s, si) {
    if (si !== idx) s.lines.forEach(function (l) { usedLines.push(l); });
  });
  var ctx = {
    genre: song.genre, styles: song.styles.slice(), theme: song.theme,
    voice: opts.voice || null, seedLines: [], extraPrefixes: [],
    usedWords: [] /* rhyme words in the untouched sections — the new section picks fresh ones */
  };
  song.sections.forEach(function (s, si) {
    if (si !== idx) s.lines.forEach(function (l) {
      var w = lastWord(l);
      if (w && familyOfWord(w)) ctx.usedWords.push(w);
    });
  });
  song.styles.forEach(function (s) {
    var st = styleById(s);
    if (st && st.prefixes) ctx.extraPrefixes = ctx.extraPrefixes.concat(st.prefixes);
  });
  if (instruction === 'darker') {
    if (ctx.styles.indexOf('dark') === -1) ctx.styles.push('dark');
    ctx.darkBias = true;
  } else if (instruction === 'emotional') {
    ['emotional', 'melancholic', 'slow-romantic'].forEach(function (s) {
      if (ctx.styles.indexOf(s) === -1 && styleById(s).genres.indexOf(song.genre) !== -1) ctx.styles.push(s);
    });
  } else if (instruction === 'powerful') {
    if (ctx.styles.indexOf('heavy') === -1) ctx.styles.push('heavy');
    if (ctx.styles.indexOf('anthemic') === -1 && styleById('anthemic').genres.indexOf(song.genre) !== -1) ctx.styles.push('anthemic');
  } else if (instruction === 'perform') {
    ctx.easy = true;
  }
  function makeOne(seed) {
    var r2 = makeRng(seed);
    var sec = generateSection(old.role, r2, ctx, usedLines.slice());
    if (instruction === 'perform') {
      /* Easier to perform: the new section's longest line must be no longer
         than the old section's longest line (and never over 10 syllables). */
      var origMax = Math.max.apply(null, old.lines.map(function (l) { return countSyllables(l); }));
      var cap = Math.min(origMax, 10);
      var maxSyl = function (s) { return Math.max.apply(null, s.lines.map(function (l) { return countSyllables(l); })); };
      var bestSec = sec, bestMax = maxSyl(sec), guard = 0;
      while (bestMax > cap && guard++ < 8) {
        var extra = generateSection(old.role, makeRng(seed + guard * 977), ctx, usedLines.slice());
        var m = maxSyl(extra);
        if (m < bestMax) { bestSec = extra; bestMax = m; }
      }
      sec = bestSec;
    }
    if (instruction === 'rhymes') {
      /* Strict AABB: every pair of lines must share a rhyme family. */
      var pairs = [];
      for (var p = 0; p + 1 < sec.lines.length; p += 2) {
        var f1 = familyOfWord(lastWord(sec.lines[p]));
        var f2 = familyOfWord(lastWord(sec.lines[p + 1]));
        if (!f1 || !f2 || f1.id !== f2.id) pairs.push(p);
      }
      if (pairs.length) {
        var redo = generateSection(old.role, makeRng(seed + 31337), ctx, usedLines.slice());
        sec = redo;
      }
    }
    sec.id = old.id;
    return sec;
  }
  if (instruction === 'alternatives') {
    var alts = [];
    for (var a = 0; a < 3; a++) alts.push(makeOne((opts.seed || 1) + a * 7919 + 101));
    return alts;
  }
  var replacement = makeOne(opts.seed || (Date.now() % 2147483647));
  song.sections[idx] = replacement;
  song.warnings = checkSong(song);
  return replacement;
}

/* =====================================================================
 * QUALITY CHECKS — repetition, syllables, rhyme, performability.
 * ===================================================================== */
function checkSong(song) {
  var warnings = [];
  var seen = {};
  var allLines = [];
  /* Statement lines are full pre-written lines — never rhyme-checked. */
  var statementBank = {};
  GENRES.forEach(function (g) { g.statements.forEach(function (s) { statementBank[s.toLowerCase()] = true; }); });
  function isExempt(sec, idx) {
    if (sec.seedIndices && sec.seedIndices.indexOf(idx) !== -1) return true; /* Robert's own words */
    if (statementBank[(sec.lines[idx] || '').trim().toLowerCase()]) return true;
    return false;
  }
  song.sections.forEach(function (sec) {
    sec.lines.forEach(function (l, li) {
      allLines.push({ section: sec.role, text: l });
      /* Chorus hook repeats as first and last line by design — not a repeat. */
      if (sec.role === 'chorus' && (li === 0 || li === sec.lines.length - 1)) return;
      var key = l.trim().toLowerCase();
      if (seen[key]) {
        warnings.push({ type: 'repetition', section: sec.role, message: 'Line repeats: "' + l + '" — also appears in ' + seen[key] + '.' });
      } else seen[key] = sec.role;
    });
  });
  song.sections.forEach(function (sec) {
    for (var i = 0; i + 1 < sec.lines.length; i += 2) {
      if (sec.role === 'chorus') continue; /* chorus hook repeats by design */
      if (isExempt(sec, i) || isExempt(sec, i + 1)) continue;
      var a = sec.lines[i], b = sec.lines[i + 1];
      var fa = familyOfWord(lastWord(a)), fb = familyOfWord(lastWord(b));
      if (fa && fb && fa.id !== fb.id) {
        warnings.push({ type: 'rhyme', section: sec.role, message: 'Lines may not rhyme: "' + a + '" / "' + b + '".' });
      }
      var sa = countSyllables(a), sb = countSyllables(b);
      if (Math.abs(sa - sb) > 4) {
        warnings.push({ type: 'syllables', section: sec.role, message: 'Couplet syllable counts are far apart (' + sa + ' vs ' + sb + '): "' + a + '" / "' + b + '".' });
      }
    }
    sec.lines.forEach(function (l, li) {
      if (isExempt(sec, li)) return; /* never flag Robert's own lines */
      var s = countSyllables(l);
      if (s > 14) {
        warnings.push({ type: 'perform', section: sec.role, message: 'Hard to perform — ' + s + ' syllables: "' + l + '".' });
      }
      var words = l.split(/\s+/);
      var longWords = words.filter(function (w) { return countSyllables(w) >= 4; }).length;
      if (longWords >= 3) {
        warnings.push({ type: 'perform', section: sec.role, message: 'Too many long words to sing cleanly: "' + l + '".' });
      }
      /* Grammar gate: couplet lines must read as real sentences.
         Exempt: Robert's seed lines and pre-written statements (handled
         above), the chorus hook (first/last lines), and the outro closer. */
      var isCoupletLine = !(sec.role === 'chorus' && (li === 0 || li === sec.lines.length - 1)) &&
        !(sec.role === 'outro' && li === sec.lines.length - 1);
      if (isCoupletLine) {
        var v = validateLine(l);
        if (!v.ok) {
          warnings.push({ type: 'grammar', section: sec.role, message: 'Line does not read as a sentence (' + v.reason + '): "' + l + '".' });
        }
      }
    });
  });
  return warnings;
}

/* =====================================================================
 * SONGBOOK — pure list helpers (storage lives in the browser IIFE).
 * ===================================================================== */
function songbookAdd(list, song) {
  var copy = list.slice();
  var s = Object.assign({}, song);
  if (!s.id) s.id = uid();
  if (!s.savedAt) s.savedAt = Date.now();
  var i = -1;
  for (var k = 0; k < copy.length; k++) if (copy[k].id === s.id) { i = k; break; }
  if (i === -1) copy.push(s); else copy[i] = s;
  return copy;
}
function songbookRemove(list, id) {
  return list.filter(function (s) { return s.id !== id; });
}
function songbookToggleFavorite(list, id) {
  return list.map(function (s) {
    if (s.id === id) { var c = Object.assign({}, s); c.favorite = !c.favorite; return c; }
    return s;
  });
}
function songbookSearch(list, query, genreFilter) {
  var q = (query || '').trim().toLowerCase();
  return list.filter(function (s) {
    if (genreFilter && genreFilter !== 'all' && s.genre !== genreFilter) return false;
    if (!q) return true;
    var hay = (s.title + ' ' + s.theme + ' ' + s.genreName + ' ' + songToText(s)).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}
function songbookDuplicate(list, id) {
  var orig = null;
  for (var i = 0; i < list.length; i++) if (list[i].id === id) orig = list[i];
  if (!orig) return list;
  var copy = JSON.parse(JSON.stringify(orig));
  copy.id = uid();
  copy.title = orig.title + ' (copy)';
  copy.createdAt = Date.now();
  copy.favorite = false;
  var out = list.slice();
  out.push(copy);
  return out;
}
function exportSongTxt(song) {
  return songToText(song);
}
function exportBackup(list) {
  return JSON.stringify({ app: APP_NAME, version: VERSION, exportedAt: new Date().toISOString(), songs: list }, null, 2);
}
function importBackup(jsonText) {
  try {
    var data = JSON.parse(jsonText);
    if (!data || !Array.isArray(data.songs)) return { ok: false, error: 'That file is not a Rock Hard songbook backup.' };
    var valid = data.songs.filter(function (s) { return s && s.id && s.title && Array.isArray(s.sections); });
    return { ok: true, songs: valid, skipped: data.songs.length - valid.length };
  } catch (e) {
    return { ok: false, error: 'Could not read that file: ' + e.message };
  }
}

/* =====================================================================
 * BACKING TRACKS — pure pattern builders (Web Audio lives in the IIFE).
 * 16 steps per bar. bass/riff are MIDI note numbers (null = rest).
 * ===================================================================== */
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function buildTrackPattern(genreId, bpm) {
  var g = genreById(genreId);
  var bpmFinal = clamp(bpm || g.bpm, 60, 200);
  var P = { genre: genreId, bpm: bpmFinal, steps: 16, kick: [], snare: [], hat: [], bass: [], riff: [], riffType: 'saw', swing: 0 };
  var i;
  for (i = 0; i < 16; i++) { P.kick.push(0); P.snare.push(0); P.hat.push(0); P.bass.push(null); P.riff.push(null); }
  if (genreId === 'metal') {
    for (i = 0; i < 16; i++) { P.kick[i] = (i % 2 === 0) ? 1 : (i % 4 === 3 ? 1 : 0); }
    P.snare[4] = 1; P.snare[12] = 1;
    for (i = 0; i < 16; i++) P.hat[i] = (i % 2 === 0) ? 1 : 0;
    var metalBass = [40, 40, 40, 41, 40, 40, 43, 40, 40, 40, 40, 41, 45, 43, 41, 40];
    for (i = 0; i < 16; i++) P.bass[i] = metalBass[i];
    var metalRiff = [64, null, 64, 65, 64, null, 67, 64, 64, null, 64, 65, 69, 67, 65, 64];
    for (i = 0; i < 16; i++) P.riff[i] = metalRiff[i];
    P.riffType = 'saw';
  } else if (genreId === 'heavy-metal') {
    [0, 3, 6, 8, 11, 14].forEach(function (s) { P.kick[s] = 1; });
    P.snare[4] = 1; P.snare[12] = 1;
    for (i = 0; i < 16; i++) P.hat[i] = (i % 2 === 0) ? 1 : 0;
    var hmBass = [40, null, 40, null, 40, null, 43, null, 40, null, 40, null, 45, null, 43, null];
    for (i = 0; i < 16; i++) P.bass[i] = hmBass[i];
    var hmRiff = [64, null, null, 67, null, null, 69, null, 67, null, null, 64, null, 62, null, 64];
    for (i = 0; i < 16; i++) P.riff[i] = hmRiff[i];
    P.riffType = 'saw';
  } else if (genreId === 'rock') {
    [0, 8, 10].forEach(function (s) { P.kick[s] = 1; });
    P.snare[4] = 1; P.snare[12] = 1;
    for (i = 0; i < 16; i++) P.hat[i] = 1;
    var rockBass = [40, null, null, null, 45, null, null, null, 43, null, null, null, 45, null, 47, null];
    for (i = 0; i < 16; i++) P.bass[i] = rockBass[i];
    var rockRiff = [64, null, 67, null, 69, null, 67, null, 64, null, 67, null, 71, 69, 67, null];
    for (i = 0; i < 16; i++) P.riff[i] = rockRiff[i];
    P.riffType = 'square';
  } else if (genreId === 'rap') {
    [0, 6, 8, 11].forEach(function (s) { P.kick[s] = 1; });
    P.snare[4] = 1; P.snare[12] = 1;
    for (i = 0; i < 16; i++) P.hat[i] = (i % 2 === 0) ? 1 : 0;
    var rapBass = [36, null, null, null, null, null, 36, null, 41, null, null, null, 38, null, null, null];
    for (i = 0; i < 16; i++) P.bass[i] = rapBass[i];
    var rapRiff = [60, null, null, null, 63, null, null, null, 65, null, null, null, 63, null, 60, null];
    for (i = 0; i < 16; i++) P.riff[i] = rapRiff[i];
    P.riffType = 'triangle';
    P.swing = 0.12;
  } else { /* hip-hop */
    [0, 7, 10].forEach(function (s) { P.kick[s] = 1; });
    P.snare[8] = 1;
    for (i = 0; i < 16; i++) P.hat[i] = (i % 4 === 3) ? 1 : 0;
    P.hat[14] = 1; P.hat[15] = 1;
    var hhBass = [36, null, null, null, null, null, null, null, 36, null, null, null, null, null, 41, null];
    for (i = 0; i < 16; i++) P.bass[i] = hhBass[i];
    var hhRiff = [60, null, 63, null, 65, null, 63, null, 60, null, 58, null, 60, null, null, null];
    for (i = 0; i < 16; i++) P.riff[i] = hhRiff[i];
    P.riffType = 'triangle';
    P.swing = 0.08;
  }
  return P;
}

/* =====================================================================
 * BROWSER UI — runs only when document exists.
 * ===================================================================== */
if (typeof document !== 'undefined') (function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = {
    method: 'lyrics',
    genre: 'metal',
    styles: ['heavy'],
    length: 'full',
    bridge: false,
    useVoice: false,
    voice: null,
    songs: [],
    currentSong: null,
    openSongId: null,
    editingSection: null,
    lastDeleted: null,
    lastEdit: null,
    playback: null
  };

  /* ---------- storage ---------- */
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked */ }
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- tabs ---------- */
  function showTab(id) {
    ['tab-create', 'tab-songbook', 'tab-voice', 'tab-about'].forEach(function (t) {
      var panel = $(t);
      if (panel) panel.hidden = (t !== id);
      var btn = document.querySelector('[data-tab="' + t + '"]');
      if (btn) btn.classList.toggle('is-active', t === id);
    });
    if (id === 'tab-songbook') renderSongbook();
    if (id === 'tab-voice') renderVoice();
    window.scrollTo(0, 0);
  }

  /* ---------- create wizard ---------- */
  function setMethod(m) {
    state.method = m;
    var lb = $('method-lyrics-btn'), db = $('method-describe-btn');
    if (lb) lb.classList.toggle('is-active', m === 'lyrics');
    if (db) db.classList.toggle('is-active', m === 'describe');
    if ($('input-lyrics-wrap')) $('input-lyrics-wrap').hidden = (m !== 'lyrics');
    if ($('input-describe-wrap')) $('input-describe-wrap').hidden = (m !== 'describe');
  }
  function renderGenres() {
    var wrap = $('genre-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    GENRES.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (state.genre === g.id ? ' is-active' : '');
      b.textContent = g.name;
      b.onclick = function () {
        state.genre = g.id;
        /* Drop styles not allowed for this genre. */
        state.styles = state.styles.filter(function (s) {
          var st = styleById(s);
          return st && st.genres.indexOf(g.id) !== -1;
        });
        if (!state.styles.length) state.styles = ['heavy'];
        var bpm = $('bpm-slider');
        if (bpm) { bpm.value = g.bpm; updateBpmLabel(); }
        renderGenres(); renderStyles();
        var blurb = $('genre-blurb');
        if (blurb) blurb.textContent = g.blurb;
      };
      wrap.appendChild(b);
    });
    var blurb = $('genre-blurb');
    if (blurb) blurb.textContent = genreById(state.genre).blurb;
  }
  function renderStyles() {
    var wrap = $('style-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    stylesForGenre(state.genre).forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (state.styles.indexOf(s.id) !== -1 ? ' is-active' : '');
      b.textContent = s.name;
      b.title = s.feel;
      b.onclick = function () {
        var i = state.styles.indexOf(s.id);
        if (i !== -1) {
          if (state.styles.length > 1) state.styles.splice(i, 1);
        } else {
          if (state.styles.length === 1) {
            if (stylesCompatible(state.styles[0], s.id)) state.styles.push(s.id);
            else state.styles = [s.id];
          } else state.styles = [s.id];
        }
        renderStyles();
      };
      wrap.appendChild(b);
    });
    var hint = $('style-hint');
    if (hint) hint.textContent = 'Pick one, or two that go together (like Dark + Heavy). Styles change with the genre.';
  }
  function updateBpmLabel() {
    var bpm = $('bpm-slider'), lab = $('bpm-value');
    if (bpm && lab) lab.textContent = bpm.value + ' BPM';
  }

  /* ---------- build + results ---------- */
  function buildSong() {
    var seedLines = [];
    var description = '';
    if (state.method === 'lyrics') {
      seedLines = ($('input-lyrics').value || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!seedLines.length) { toast('Type in a few of your own lines first.'); $('input-lyrics').focus(); return; }
    } else {
      description = ($('input-describe').value || '').trim();
      if (!description) { toast('Describe the song first — a few sentences is plenty.'); $('input-describe').focus(); return; }
    }
    var voice = (state.useVoice && state.voice) ? state.voice : null;
    var song = generateSong({
      method: state.method, seedLines: seedLines, description: description,
      genre: state.genre, styles: state.styles, length: state.length,
      bridge: state.bridge, voice: voice, seed: (Date.now() % 2147483647)
    });
    state.currentSong = song;
    state.songs = songbookAdd(state.songs, song);
    saveJSON(STORAGE_SONGS, state.songs);
    renderResults(song);
    toast('Built and saved to your songbook.');
  }
  function renderResults(song) {
    var sec = $('results-section');
    if (!sec) return;
    sec.hidden = false;
    renderTitles(song);
    renderWarnings(song);
    renderSections(song);
    var bpm = $('bpm-slider');
    if (bpm) { bpm.value = song.bpm; updateBpmLabel(); }
    var note = $('save-note');
    if (note) note.textContent = 'Saved to your songbook · ' + genreById(song.genre).name + ' · ' + song.styleNames.join(' + ') + (song.voiceUsed ? ' · in your voice' : '');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderTitles(song) {
    var wrap = $('title-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    song.titles.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip title-chip' + (song.title === t ? ' is-active' : '');
      b.textContent = t;
      b.onclick = function () {
        song.title = t;
        state.songs = songbookAdd(state.songs, song);
        saveJSON(STORAGE_SONGS, state.songs);
        renderTitles(song);
      };
      wrap.appendChild(b);
    });
  }
  function renderWarnings(song) {
    var box = $('warnings-box');
    if (!box) return;
    if (!song.warnings || !song.warnings.length) {
      box.innerHTML = '<p class="warn-ok">✓ Quality check passed — no repeated lines, rhymes hold, lines are singable.</p>';
      return;
    }
    box.innerHTML = '<p class="warn-head">Songwriting check — ' + song.warnings.length + ' note(s):</p>' +
      song.warnings.map(function (w) { return '<p class="warn-item">• [' + w.section + '] ' + w.message + '</p>'; }).join('');
  }
  function sectionLabel(role) {
    return role.replace('verse1', 'Verse 1').replace('verse2', 'Verse 2').replace('verse3', 'Verse 3')
      .replace('chorus', 'Chorus').replace('bridge', 'Bridge').replace('outro', 'Outro');
  }
  function renderSections(song) {
    var wrap = $('sections-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    var flatIndex = 0;
    song.sections.forEach(function (sec) {
      var card = document.createElement('div');
      card.className = 'section-card';
      card.dataset.sectionId = sec.id;
      var head = document.createElement('div');
      head.className = 'section-head';
      head.innerHTML = '<h3>' + sec.label + '</h3>';
      var editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.className = 'text-btn'; editBtn.textContent = 'Edit lines';
      editBtn.onclick = function () { toggleSectionEdit(song, sec.id); };
      head.appendChild(editBtn);
      card.appendChild(head);
      if (state.editingSection === sec.id) {
        var ta = document.createElement('textarea');
        ta.className = 'section-edit';
        ta.rows = sec.lines.length + 1;
        ta.value = sec.lines.join('\n');
        card.appendChild(ta);
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button'; saveBtn.className = 'mini-btn'; saveBtn.textContent = 'Save lines';
        saveBtn.onclick = function () {
          state.lastEdit = { id: song.id, prev: JSON.parse(JSON.stringify(song)) };
          sec.lines = ta.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
          state.editingSection = null;
          song.warnings = checkSong(song);
          state.songs = songbookAdd(state.songs, song);
          saveJSON(STORAGE_SONGS, state.songs);
          renderSections(song); renderWarnings(song);
          toast('Lines saved.');
        };
        card.appendChild(saveBtn);
      } else {
        var linesDiv = document.createElement('div');
        linesDiv.className = 'lyric-lines';
        sec.lines.forEach(function (l) {
          var p = document.createElement('p');
          p.className = 'lyric-line';
          p.dataset.lineIndex = String(flatIndex++);
          p.textContent = l;
          linesDiv.appendChild(p);
        });
        card.appendChild(linesDiv);
      }
      var tools = document.createElement('div');
      tools.className = 'regen-row';
      var sel = document.createElement('select');
      sel.className = 'regen-select';
      sel.setAttribute('aria-label', 'Regenerate this section');
      [['darker', 'Make it darker'], ['powerful', 'Make it more powerful'], ['rhymes', 'Better rhymes'],
       ['emotional', 'Make it more emotional'], ['perform', 'Easier to perform'],
       ['alternatives', 'Give me 3 alternatives']].forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt[0]; o.textContent = opt[1];
        sel.appendChild(o);
      });
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'mini-btn'; go.textContent = 'Regenerate section';
      go.onclick = function () {
        var instruction = sel.value;
        if (instruction === 'alternatives') {
          var res = regenerateSection(song, sec.id, 'alternatives', { seed: (Date.now() % 2147483647), voice: song.voiceUsed ? state.voice : null });
          showAlternatives(song, sec.id, res);
        } else {
          regenerateSection(song, sec.id, instruction, { seed: (Date.now() % 2147483647), voice: song.voiceUsed ? state.voice : null });
          state.songs = songbookAdd(state.songs, song);
          saveJSON(STORAGE_SONGS, state.songs);
          renderSections(song); renderWarnings(song);
          toast('Section regenerated.');
        }
      };
      tools.appendChild(sel); tools.appendChild(go);
      card.appendChild(tools);
      var altWrap = document.createElement('div');
      altWrap.className = 'alt-wrap';
      altWrap.dataset.altFor = sec.id;
      card.appendChild(altWrap);
      wrap.appendChild(card);
    });
  }
  function showAlternatives(song, sectionId, alts) {
    var card = document.querySelector('[data-section-id="' + sectionId + '"] .alt-wrap');
    if (!card) return;
    card.innerHTML = '<p class="alt-head">Pick one — it replaces the section:</p>';
    alts.forEach(function (alt, i) {
      var div = document.createElement('div');
      div.className = 'alt-block';
      div.innerHTML = '<p class="alt-label">Alternative ' + (i + 1) + '</p>' +
        alt.lines.map(function (l) { return '<p class="lyric-line">' + escapeHtml(l) + '</p>'; }).join('');
      var use = document.createElement('button');
      use.type = 'button'; use.className = 'mini-btn'; use.textContent = 'Use this one';
      use.onclick = function () {
        for (var k = 0; k < song.sections.length; k++) {
          if (song.sections[k].id === sectionId) {
            alt.id = sectionId;
            song.sections[k] = alt;
          }
        }
        song.warnings = checkSong(song);
        state.songs = songbookAdd(state.songs, song);
        saveJSON(STORAGE_SONGS, state.songs);
        renderSections(song); renderWarnings(song);
        toast('Section replaced.');
      };
      div.appendChild(use);
      card.appendChild(div);
    });
  }
  function toggleSectionEdit(song, sectionId) {
    state.editingSection = (state.editingSection === sectionId) ? null : sectionId;
    renderSections(song);
  }
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- playback (Web Audio) ---------- */
  var audio = { ctx: null, master: null, noiseBuf: null, timer: null, pattern: null, startAt: 0, nextStep: 0, step: 0, playing: false, lineDur: 2, totalLines: 0 };
  function ensureAudio() {
    if (audio.ctx) return audio.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('This browser does not support Web Audio.'); return null; }
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.8;
    audio.master.connect(audio.ctx.destination);
    var len = audio.ctx.sampleRate * 1;
    audio.noiseBuf = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    var data = audio.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return audio.ctx;
  }
  function distortionCurve(amount) {
    var k = amount || 40, n = 256, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
  function playStep(pattern, step, when) {
    var ctx = audio.ctx;
    var drumsOn = !$('inst-drums') || $('inst-drums').checked;
    var bassOn = !$('inst-bass') || $('inst-bass').checked;
    var riffOn = !$('inst-riff') || $('inst-riff').checked;
    var stepDur = 60 / pattern.bpm / 4;
    var t = when;
    if (pattern.swing && step % 2 === 1) t += stepDur * pattern.swing;
    if (drumsOn && pattern.kick[step]) {
      var k = ctx.createOscillator(), kg = ctx.createGain();
      k.type = 'sine';
      k.frequency.setValueAtTime(150, t);
      k.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      kg.gain.setValueAtTime(0.9, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      k.connect(kg); kg.connect(audio.master);
      k.start(t); k.stop(t + 0.2);
    }
    if (drumsOn && pattern.snare[step]) {
      var n = ctx.createBufferSource(); n.buffer = audio.noiseBuf;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800;
      var ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      n.connect(bp); bp.connect(ng); ng.connect(audio.master);
      n.start(t); n.stop(t + 0.16);
    }
    if (drumsOn && pattern.hat[step]) {
      var h = ctx.createBufferSource(); h.buffer = audio.noiseBuf;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
      var hg = ctx.createGain();
      hg.gain.setValueAtTime(0.22, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      h.connect(hp); hp.connect(hg); hg.connect(audio.master);
      h.start(t); h.stop(t + 0.05);
    }
    if (bassOn && pattern.bass[step] !== null) {
      var b = ctx.createOscillator(), bg = ctx.createGain(), bf = ctx.createBiquadFilter();
      b.type = 'sawtooth'; b.frequency.value = midiToFreq(pattern.bass[step]);
      bf.type = 'lowpass'; bf.frequency.value = 700;
      bg.gain.setValueAtTime(0.45, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
      b.connect(bf); bf.connect(bg); bg.connect(audio.master);
      b.start(t); b.stop(t + stepDur * 1.9);
    }
    if (riffOn && pattern.riff[step] !== null) {
      var r = ctx.createOscillator(), rg = ctx.createGain();
      r.type = pattern.riffType;
      r.frequency.value = midiToFreq(pattern.riff[step]);
      if (pattern.riffType === 'saw' || pattern.riffType === 'square') {
        var ws = ctx.createWaveShaper();
        ws.curve = distortionCurve(30);
        var rg2 = ctx.createGain(); rg2.gain.value = 0.5;
        r.connect(ws); ws.connect(rg2); rg2.connect(rg);
      } else {
        r.connect(rg);
      }
      rg.gain.setValueAtTime(0.22, t);
      rg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.6);
      rg.connect(audio.master);
      r.start(t); r.stop(t + stepDur * 1.7);
    }
  }
  function startPlayback() {
    var song = state.currentSong;
    if (!song) { toast('Build a song first, then press play.'); return; }
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    stopPlayback(true);
    var bpm = parseInt(($('bpm-slider') || {}).value || song.bpm, 10);
    var pattern = buildTrackPattern(song.genre, bpm);
    var lines = flattenLines(song);
    audio.pattern = pattern;
    audio.totalLines = lines.length;
    audio.lineDur = (60 / bpm) * 4; /* one bar per line */
    audio.startAt = ctx.currentTime + 0.1;
    audio.nextStep = 0;
    audio.step = 0;
    audio.playing = true;
    var stepDur = 60 / bpm / 4;
    audio.timer = setInterval(function () {
      if (!audio.playing) return;
      var ahead = ctx.currentTime + 0.2; /* mobile timers can lag; 0.2s lookahead keeps the beat steady */
      while (audio.startAt + audio.nextStep * stepDur < ahead) {
        var when = audio.startAt + audio.nextStep * stepDur;
        playStep(pattern, audio.step, when);
        audio.nextStep++;
        audio.step = (audio.step + 1) % 16;
      }
      var elapsed = ctx.currentTime - audio.startAt;
      if (elapsed >= 0) {
        var lineIdx = Math.floor(elapsed / audio.lineDur) % Math.max(1, audio.totalLines);
        highlightLine(lineIdx);
        var bar = $('progress-bar');
        var totalDur = audio.totalLines * audio.lineDur;
        if (bar) bar.style.width = Math.min(100, (elapsed / totalDur) * 100) + '%';
      }
    }, 30);
    var pb = $('play-btn');
    if (pb) pb.textContent = '⏸ Pause track';
    toast('Playing the ' + genreById(song.genre).name + ' backing track at ' + bpm + ' BPM.');
  }
  function highlightLine(idx) {
    var lines = document.querySelectorAll('#sections-list .lyric-line[data-line-index]');
    lines.forEach(function (el) {
      var on = parseInt(el.dataset.lineIndex, 10) === idx;
      el.classList.toggle('is-singing', on);
      if (on) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  function stopPlayback(silent) {
    if (audio.timer) { clearInterval(audio.timer); audio.timer = null; }
    audio.playing = false;
    var pb = $('play-btn');
    if (pb) pb.textContent = '▶ Play backing track';
    document.querySelectorAll('#sections-list .lyric-line.is-singing').forEach(function (el) { el.classList.remove('is-singing'); });
    var bar = $('progress-bar');
    if (bar) bar.style.width = '0%';
    if (!silent) toast('Track stopped.');
  }

  /* ---------- songbook ---------- */
  function renderSongbook() {
    var list = $('sb-list');
    if (!list) return;
    var q = ($('sb-search') || {}).value || '';
    var gf = ($('sb-genre-filter') || {}).value || 'all';
    var matches = songbookSearch(state.songs, q, gf);
    var detail = $('sb-detail');
    if (detail) detail.hidden = true;
    var listWrap = $('sb-list-wrap');
    if (listWrap) listWrap.hidden = false;
    list.innerHTML = '';
    if (!matches.length) {
      list.innerHTML = '<p class="empty-note">No songs yet. Build your first one in the Create tab — it saves here automatically.</p>';
      return;
    }
    matches.forEach(function (s) {
      var div = document.createElement('div');
      div.className = 'sb-item song-item' + (s.favorite ? ' is-fav' : '');
      var fav = document.createElement('button');
      fav.type = 'button'; fav.className = 'fav-btn';
      fav.textContent = s.favorite ? '★' : '☆';
      fav.setAttribute('aria-label', 'Favorite');
      fav.onclick = function (e) {
        e.stopPropagation();
        state.songs = songbookToggleFavorite(state.songs, s.id);
        saveJSON(STORAGE_SONGS, state.songs);
        renderSongbook();
      };
      var info = document.createElement('div');
      info.className = 'sb-info';
      info.innerHTML = '<strong>' + escapeHtml(s.title) + '</strong><span>' + escapeHtml(s.genreName) + ' · ' + escapeHtml(s.styleNames.join(' + ')) + ' · ' + new Date(s.createdAt).toLocaleDateString() + '</span>';
      div.appendChild(fav);
      div.appendChild(info);
      div.onclick = function () { openSong(s.id); };
      list.appendChild(div);
    });
  }
  function openSong(id) {
    var song = null;
    for (var i = 0; i < state.songs.length; i++) if (state.songs[i].id === id) song = state.songs[i];
    if (!song) return;
    state.openSongId = id;
    state.currentSong = song;
    var listWrap = $('sb-list-wrap');
    if (listWrap) listWrap.hidden = true;
    var detail = $('sb-detail');
    if (!detail) return;
    detail.hidden = false;
    detail.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'sb-detail-head';
    var back = document.createElement('button');
    back.type = 'button'; back.className = 'text-btn'; back.textContent = '← Back to songbook';
    back.onclick = function () { state.openSongId = null; renderSongbook(); };
    head.appendChild(back);
    var titleRow = document.createElement('div');
    titleRow.className = 'sb-title-row';
    var h = document.createElement('h2');
    h.textContent = song.title;
    h.contentEditable = 'true';
    h.spellcheck = false;
    h.onblur = function () {
      var t = h.textContent.trim();
      if (t && t !== song.title) {
        state.lastEdit = { id: song.id, prev: JSON.parse(JSON.stringify(song)) };
        song.title = t;
        if (song.titles.indexOf(t) === -1) song.titles.unshift(t);
        state.songs = songbookAdd(state.songs, song);
        saveJSON(STORAGE_SONGS, state.songs);
        toast('Title saved. Tap the title again to edit it.');
      }
    };
    titleRow.appendChild(h);
    head.appendChild(titleRow);
    var meta = document.createElement('p');
    meta.className = 'fine';
    meta.textContent = song.genreName + ' · ' + song.styleNames.join(' + ') + ' · ' + (song.length === 'short' ? 'Short' : 'Full') + (song.bridge ? ' · Bridge' : '') + (song.voiceUsed ? ' · in your voice' : '');
    head.appendChild(meta);
    detail.appendChild(head);
    var body = document.createElement('div');
    body.className = 'sb-lyrics';
    song.sections.forEach(function (sec) {
      var lab = document.createElement('p');
      lab.className = 'sb-section-label';
      lab.textContent = '[' + sectionLabel(sec.role).toUpperCase() + ']';
      body.appendChild(lab);
      sec.lines.forEach(function (l) {
        var p = document.createElement('p');
        p.className = 'lyric-line';
        p.textContent = l;
        body.appendChild(p);
      });
    });
    detail.appendChild(body);
    var actions = document.createElement('div');
    actions.className = 'sb-actions';
    function actBtn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mini-btn'; b.textContent = label;
      b.onclick = fn;
      actions.appendChild(b);
      return b;
    }
    actBtn('▶ Play track', function () { showTab('tab-create'); state.currentSong = song; renderResults(song); startPlayback(); });
    actBtn('Copy lyrics', function () {
      var text = songToText(song);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Lyrics copied.'); }, function () { toast('Copy failed — select the text manually.'); });
    });
    actBtn('Export as TXT', function () {
      download(song.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.txt', exportSongTxt(song));
      toast('TXT downloaded.');
    });
    actBtn(song.favorite ? '★ Unfavorite' : '☆ Favorite', function () {
      state.songs = songbookToggleFavorite(state.songs, song.id);
      saveJSON(STORAGE_SONGS, state.songs);
      openSong(song.id);
    });
    actBtn('Duplicate', function () {
      state.songs = songbookDuplicate(state.songs, song.id);
      saveJSON(STORAGE_SONGS, state.songs);
      toast('Duplicated — the copy is at the top of your songbook.');
      renderSongbook();
    });
    actBtn('Delete', function () {
      if (!window.confirm('Delete "' + song.title + '"? You can undo it right after.')) return;
      var idx = -1;
      for (var i = 0; i < state.songs.length; i++) if (state.songs[i].id === song.id) idx = i;
      state.lastDeleted = { song: song, index: idx };
      state.songs = songbookRemove(state.songs, song.id);
      saveJSON(STORAGE_SONGS, state.songs);
      state.openSongId = null;
      renderSongbook();
      var undoBtn = $('undo-btn');
      if (undoBtn) undoBtn.hidden = false;
      toast('Deleted. Tap Undo to bring it back.');
    });
    detail.appendChild(actions);
  }

  /* ---------- my voice ---------- */
  function renderVoice() {
    var sum = $('voice-summary');
    if (!sum) return;
    sum.textContent = voiceSummary(state.voice);
    var toggle = $('voice-toggle');
    if (toggle) {
      toggle.disabled = !state.voice;
      var hint = $('voice-hint');
      if (hint) hint.textContent = state.voice ? 'On — new songs will be written in your voice.' : 'Build a voice profile first (paste some of your lyrics below).';
    }
  }

  /* ---------- init ---------- */
  function init() {
    state.songs = loadJSON(STORAGE_SONGS, []);
    state.voice = loadJSON(STORAGE_VOICE, null);
    var settings = loadJSON(STORAGE_SETTINGS, {});
    state.useVoice = !!settings.useVoice;
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { showTab(btn.getAttribute('data-tab')); });
    });
    var lb = $('method-lyrics-btn'), db = $('method-describe-btn');
    if (lb) lb.addEventListener('click', function () { setMethod('lyrics'); });
    if (db) db.addEventListener('click', function () { setMethod('describe'); });
    var vt = $('voice-toggle');
    if (vt) {
      vt.checked = state.useVoice;
      vt.addEventListener('change', function () {
        state.useVoice = vt.checked;
        saveJSON(STORAGE_SETTINGS, { useVoice: state.useVoice });
        toast(state.useVoice ? 'My Voice is on for the next song.' : 'My Voice is off.');
      });
    }
    var ls = $('length-short'), lf = $('length-full');
    if (ls) ls.addEventListener('click', function () {
      state.length = 'short';
      ls.classList.add('is-active'); if (lf) lf.classList.remove('is-active');
    });
    if (lf) lf.addEventListener('click', function () {
      state.length = 'full';
      lf.classList.add('is-active'); if (ls) ls.classList.remove('is-active');
    });
    var bt = $('bridge-toggle');
    if (bt) bt.addEventListener('change', function () { state.bridge = bt.checked; });
    var rib = $('random-idea-btn');
    if (rib) rib.addEventListener('click', function () {
      var idea = randomIdea();
      var box = $('idea-box');
      if (box) {
        box.hidden = false;
        box.innerHTML = '<p><strong>Theme:</strong> ' + escapeHtml(idea.theme) + '</p>' +
          '<p><strong>Opening line:</strong> ' + escapeHtml(idea.openingLine) + '</p>' +
          '<p><strong>Story:</strong> ' + escapeHtml(idea.story) + '</p>' +
          '<p><strong>Chorus idea:</strong> ' + escapeHtml(idea.chorusIdea) + '</p>';
        var use = document.createElement('button');
        use.type = 'button'; use.className = 'mini-btn'; use.textContent = 'Use this theme';
        use.addEventListener('click', function () {
          setMethod('describe');
          $('input-describe').value = 'A song about ' + idea.theme + '. ' + idea.story;
          toast('Theme dropped into the description box.');
        });
        box.appendChild(use);
      }
    });
    var bb = $('build-btn');
    if (bb) bb.addEventListener('click', buildSong);
    var pb = $('play-btn');
    if (pb) pb.addEventListener('click', function () {
      if (audio.playing) stopPlayback();
      else startPlayback();
    });
    var bpm = $('bpm-slider');
    if (bpm) bpm.addEventListener('input', updateBpmLabel);
    var vol = $('volume-slider');
    if (vol) vol.addEventListener('input', function () {
      if (audio.master) audio.master.gain.value = parseFloat(vol.value);
    });
    var cb = $('copy-btn');
    if (cb) cb.addEventListener('click', function () {
      if (!state.currentSong) return;
      var text = songToText(state.currentSong);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Lyrics copied.'); }, function () { toast('Copy failed — select the text manually.'); });
    });
    var eb = $('export-btn');
    if (eb) eb.addEventListener('click', function () {
      if (!state.currentSong) return;
      download(state.currentSong.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.txt', exportSongTxt(state.currentSong));
      toast('TXT downloaded.');
    });
    var ss = $('sb-search');
    if (ss) ss.addEventListener('input', renderSongbook);
    var gf = $('sb-genre-filter');
    if (gf) gf.addEventListener('change', renderSongbook);
    var ub = $('undo-btn');
    if (ub) ub.addEventListener('click', function () {
      if (state.lastDeleted) {
        var d = state.lastDeleted;
        state.songs.splice(Math.min(d.index, state.songs.length), 0, d.song);
        state.lastDeleted = null;
        saveJSON(STORAGE_SONGS, state.songs);
        ub.hidden = true;
        renderSongbook();
        toast('Song restored.');
      } else if (state.lastEdit) {
        var e = state.lastEdit;
        state.songs = songbookAdd(state.songs, e.prev);
        state.lastEdit = null;
        saveJSON(STORAGE_SONGS, state.songs);
        ub.hidden = true;
        renderSongbook();
        toast('Edit undone.');
      }
    });
    var bex = $('backup-export-btn');
    if (bex) bex.addEventListener('click', function () {
      download('rock-hard-songbook-backup.json', exportBackup(state.songs), 'application/json');
      toast('Backup downloaded — keep it somewhere safe.');
    });
    var bim = $('backup-import-btn');
    if (bim) bim.addEventListener('click', function () { var f = $('backup-import-file'); if (f) f.click(); });
    var bif = $('backup-import-file');
    if (bif) bif.addEventListener('change', function () {
      var file = bif.files && bif.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = importBackup(String(reader.result || ''));
        if (!res.ok) { toast(res.error); return; }
        var merged = state.songs.slice();
        res.songs.forEach(function (s) { merged = songbookAdd(merged, s); });
        state.songs = merged;
        saveJSON(STORAGE_SONGS, state.songs);
        renderSongbook();
        toast('Backup imported: ' + res.songs.length + ' song(s)' + (res.skipped ? ', ' + res.skipped + ' skipped' : '') + '.');
      };
      reader.readAsText(file);
      bif.value = '';
    });
    var vb = $('voice-build-btn');
    if (vb) vb.addEventListener('click', function () {
      var text = ($('voice-sample').value || '').trim();
      if (text.split(/\r?\n/).filter(Boolean).length < 3) {
        toast('Paste at least 3 lines of your own lyrics first.');
        return;
      }
      state.voice = buildVoiceProfile(text);
      saveJSON(STORAGE_VOICE, state.voice);
      renderVoice();
      toast('Your voice profile is built and saved on this phone.');
    });
    var vc = $('voice-clear-btn');
    if (vc) vc.addEventListener('click', function () {
      state.voice = null;
      state.useVoice = false;
      saveJSON(STORAGE_VOICE, null);
      saveJSON(STORAGE_SETTINGS, { useVoice: false });
      var vt2 = $('voice-toggle');
      if (vt2) vt2.checked = false;
      renderVoice();
      toast('Voice profile cleared.');
    });
    var cd = $('clear-data-btn');
    if (cd) cd.addEventListener('click', function () {
      if (!window.confirm('Delete all songs, your voice profile, and settings from this phone?')) return;
      state.songs = [];
      state.voice = null;
      state.currentSong = null;
      saveJSON(STORAGE_SONGS, []);
      saveJSON(STORAGE_VOICE, null);
      saveJSON(STORAGE_SETTINGS, {});
      renderSongbook(); renderVoice();
      toast('All Rock Hard data cleared from this phone.');
    });
    setMethod('lyrics');
    renderGenres();
    renderStyles();
    updateBpmLabel();
    renderVoice();
    showTab('tab-create');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ---------- node exports (tests) ---------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERSION: VERSION, APP_NAME: APP_NAME,
    GENRES: GENRES, STYLES: STYLES, RHYME_FAMILIES: RHYME_FAMILIES,
    STYLE_PAIRS: STYLE_PAIRS, THEME_WORDS: THEME_WORDS,
    genreById: genreById, styleById: styleById, stylesForGenre: stylesForGenre,
    stylesCompatible: stylesCompatible, extractTheme: extractTheme,
    randomIdea: randomIdea, countSyllables: countSyllables, lastWord: lastWord,
    familyOfWord: familyOfWord, familyById: familyById, familiesForTags: familiesForTags,
    buildVoiceProfile: buildVoiceProfile, voiceSummary: voiceSummary,
    buildCouplet: buildCouplet, buildHook: buildHook, generateSection: generateSection,
    validateLine: validateLine,
    generateTitles: generateTitles, generateSong: generateSong, songToText: songToText,
    flattenLines: flattenLines, regenerateSection: regenerateSection, checkSong: checkSong,
    songbookAdd: songbookAdd, songbookRemove: songbookRemove,
    songbookToggleFavorite: songbookToggleFavorite, songbookSearch: songbookSearch,
    songbookDuplicate: songbookDuplicate, exportSongTxt: exportSongTxt,
    exportBackup: exportBackup, importBackup: importBackup,
    buildTrackPattern: buildTrackPattern, midiToFreq: midiToFreq,
    makeRng: makeRng, mulberry32: makeRng, pick: pick, pickDistinct: pickDistinct
  };
}
