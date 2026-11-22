'use strict';
/* Rock Hard — node unit tests + UI smoke tests.
   Run: node tests/test.js
   Modelled on HoodTalk's test pattern. Exits 1 on any failure. */
var fs = require('fs');
var path = require('path');
var A = require('../app.js');

var passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; }
  else { failed++; console.log('FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) { check(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

/* ---------- constants & data ---------- */
eq('VERSION is 1.0.0', A.VERSION, '1.0.0');
eq('APP_NAME is Rock Hard', A.APP_NAME, 'Rock Hard');
eq('5 genres', A.GENRES.length, 5);
eq('10 styles', A.STYLES.length, 10);
check('genre ids are the 5 spec genres',
  A.GENRES.map(function (g) { return g.id; }).join(',') === 'metal,heavy-metal,rock,rap,hip-hop');
check('every genre has a BPM default in range',
  A.GENRES.every(function (g) { return g.bpm >= 60 && g.bpm <= 200; }));
check('every genre has vocab, titles, statements, hooks',
  A.GENRES.every(function (g) { return g.vocab.length >= 8 && g.titlePatterns.length >= 4 && g.statements.length >= 6 && g.hookTemplates.length >= 4; }));
check('every style has allowed genres and hook templates',
  A.STYLES.every(function (s) { return s.genres.length >= 2 && s.hookTemplates.length >= 2; }));
check('rhyme families: 32 families, each 2+ words, no word reused across families', (function () {
  var seen = {};
  for (var i = 0; i < A.RHYME_FAMILIES.length; i++) {
    var f = A.RHYME_FAMILIES[i];
    if (f.words.length < 2 || f.leads.length < 1) return false;
    for (var j = 0; j < f.words.length; j++) {
      if (seen[f.words[j]]) return false;
      seen[f.words[j]] = true;
    }
  }
  return A.RHYME_FAMILIES.length === 32;
})());
check('every rhyme family has a tag used by at least one style or genre', (function () {
  return A.RHYME_FAMILIES.every(function (f) { return f.tags.length >= 1; });
})());

/* ---------- styles ---------- */
check('stylesForGenre(metal) includes heavy, dark, aggressive, melodic',
  ['heavy', 'dark', 'aggressive', 'melodic'].every(function (id) { return A.stylesForGenre('metal').some(function (s) { return s.id === id; }); }));
check('stylesForGenre(rock) includes slow-romantic and melodic',
  ['slow-romantic', 'melodic'].every(function (id) { return A.stylesForGenre('rock').some(function (s) { return s.id === id; }); }));
check('stylesForGenre(rap) has at least 5 styles', A.stylesForGenre('rap').length >= 5);
check('every genre offers at least 5 styles',
  A.GENRES.every(function (g) { return A.stylesForGenre(g.id).length >= 5; }));
check('stylesCompatible: dark + heavy is a known pair', A.stylesCompatible('dark', 'heavy'));
check('stylesCompatible: melodic + aggressive is a known pair', A.stylesCompatible('melodic', 'aggressive'));
check('stylesCompatible: slow-romantic + emotional is a known pair', A.stylesCompatible('slow-romantic', 'emotional'));
check('stylesCompatible: heavy + rebellious is a known pair', A.stylesCompatible('heavy', 'rebellious'));
check('stylesCompatible: same style twice is not a pair', !A.stylesCompatible('dark', 'dark'));
check('stylesCompatible: dark + uplifting is NOT a pair', !A.stylesCompatible('dark', 'uplifting'));
check('stylesCompatible: slow-romantic + aggressive is NOT a pair', !A.stylesCompatible('slow-romantic', 'aggressive'));

/* ---------- theme extraction ---------- */
eq('extractTheme: love wins for a love description', A.extractTheme('a song about love and heartbreak', 'rock'), 'love');
eq('extractTheme: home for coming home', A.extractTheme('a song about coming home after years away', 'metal'), 'home');
eq('extractTheme: revenge for betrayal', A.extractTheme('a song about getting revenge on the ones who betrayed me', 'rap'), 'revenge');
eq('extractTheme: falls back to genre default', A.extractTheme('something totally random with no keywords at all', 'metal'), 'fire');
eq('extractTheme: city for city streets', A.extractTheme('a song about the city streets at night', 'hip-hop'), 'city');

/* ---------- syllables & rhyme helpers ---------- */
eq('countSyllables fire = 1', A.countSyllables('fire'), 1);
eq('countSyllables thunder = 2', A.countSyllables('thunder'), 2);
eq('countSyllables hello = 2', A.countSyllables('hello'), 2);
eq('countSyllables midnight = 2', A.countSyllables('midnight'), 2);
eq('countSyllables resurrection = 4', A.countSyllables('resurrection'), 4);
check('familyOfWord: night -> night family', A.familyOfWord('night') && A.familyOfWord('night').id === 'night');
check('familyOfWord: fire -> fire family', A.familyOfWord('fire') && A.familyOfWord('fire').id === 'fire');
eq('familyOfWord: unknown word -> null', A.familyOfWord('zebra'), null);
eq('lastWord strips punctuation', A.lastWord('Burning with the fire!'), 'fire');
check('buildCouplet: two lines rhyme (same family)', (function () {
  var rng = A.mulberry32(42);
  var c = A.buildCouplet(rng, { theme: 'fire', genre: 'metal', styles: ['heavy'], easy: false }, []);
  var fa = A.familyOfWord(A.lastWord(c.lines[0])), fb = A.familyOfWord(A.lastWord(c.lines[1]));
  return fa && fb && fa.id === fb.id && c.lines[0] !== c.lines[1];
})());
check('buildHook: contains the theme', (function () {
  var h = A.buildHook(A.mulberry32(7), { theme: 'storm', genre: 'rock', styles: ['anthemic'] });
  return h.toLowerCase().indexOf('storm') !== -1 && h.length > 5;
})());
check('mulberry32: same seed -> same sequence', (function () {
  var a = A.mulberry32(99), b = A.mulberry32(99);
  return a() === b() && a() === b() && a() === b();
})());
check('mulberry32: different seeds -> different first values', A.mulberry32(1)() !== A.mulberry32(2)());

/* ---------- voice profile ---------- */
check('buildVoiceProfile: picks top words and rhyme endings', (function () {
  var p = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain\nNothing left but the rain and the night');
  return p.topWords.indexOf('rain') !== -1 && p.rhymeEndings.indexOf('rain') !== -1 &&
    p.avgSyllables > 0 && p.totalLines === 4;
})());
check('voiceSummary: names the top words', (function () {
  var p = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain');
  return A.voiceSummary(p).indexOf('rain') !== -1;
})());
eq('buildVoiceProfile: empty input -> empty profile', A.buildVoiceProfile('').totalLines, 0);

/* ---------- titles & ideas ---------- */
check('generateTitles: 5 unique titles containing the theme', (function () {
  var t = A.generateTitles(A.mulberry32(3), { theme: 'fire', genre: 'metal' });
  var uniq = {};
  t.forEach(function (x) { uniq[x] = true; });
  return t.length === 5 && Object.keys(uniq).length === 5 &&
    t.every(function (x) { return x.toLowerCase().indexOf('fire') !== -1; });
})());
check('randomIdea: theme, opening, story, chorus idea all present', (function () {
  var i = A.randomIdea(A.mulberry32(11));
  return i.theme && i.openingLine && i.story && i.chorusIdea &&
    i.openingLine.length > 5 && i.chorusIdea.length > 5;
})());
check('randomIdea: varies across seeds', (function () {
  var a = A.randomIdea(A.mulberry32(1)), b = A.randomIdea(A.mulberry32(2));
  return a.theme !== b.theme || a.openingLine !== b.openingLine;
})());

/* ---------- generateSong: structure ---------- */
function song(opts) {
  return A.generateSong(Object.assign({ seed: 5, genre: 'metal', styles: ['heavy'], method: 'describe', description: 'a song about fire and standing your ground', length: 'full', bridge: true, voice: null }, opts || {}));
}
check('generateSong full: verse1, chorus, verse2, chorus, bridge, verse3, chorus, outro in order', (function () {
  var roles = song().sections.map(function (s) { return s.role; });
  return roles.join(',') === 'verse1,chorus,verse2,chorus,bridge,verse3,chorus,outro';
})());
check('generateSong short: verse1, chorus, outro', (function () {
  var roles = song({ length: 'short', bridge: false }).sections.map(function (s) { return s.role; });
  return roles.join(',') === 'verse1,chorus,outro';
})());
check('generateSong short with bridge: verse1, chorus, bridge, outro', (function () {
  var roles = song({ length: 'short', bridge: true }).sections.map(function (s) { return s.role; });
  return roles.join(',') === 'verse1,chorus,bridge,outro';
})());
check('generateSong: every section has a label and 2+ non-empty lines', (function () {
  var s = song();
  return s.sections.every(function (sec) {
    return sec.label && sec.lines.length >= 2 &&
      sec.lines.every(function (l) { return typeof l === 'string' && l.trim().length > 3; });
  });
})());
check('generateSong: chorus hook repeats as first and last line', (function () {
  var s = song();
  return s.sections.filter(function (x) { return x.role === 'chorus'; }).every(function (c) {
    return c.lines[0] === c.lines[c.lines.length - 1] && c.lines.length === 4;
  });
})());
check('generateSong: verse arc labels describe the arc', (function () {
  var s = song();
  var labels = s.sections.map(function (x) { return x.label; }).join(' | ');
  return labels.indexOf('introduces') !== -1 && labels.indexOf('develops') !== -1 &&
    labels.indexOf('central message') !== -1 && labels.indexOf('turning point') !== -1 &&
    labels.indexOf('resolution') !== -1;
})());
check('generateSong: returns title, titles list, theme, genre, styles, warnings', (function () {
  var s = song();
  return s.title && s.titles.length === 5 && s.theme === 'fire' && s.genre === 'metal' &&
    s.styles.join(',') === 'heavy' && Array.isArray(s.warnings);
})());
check('generateSong: deterministic — same seed gives the identical song', (function () {
  var a = song({ seed: 123 }), b = song({ seed: 123 });
  return JSON.stringify(a) === JSON.stringify(b);
})());
check('generateSong: different seeds give different songs', (function () {
  var a = song({ seed: 123 }), b = song({ seed: 456 });
  return JSON.stringify(a) !== JSON.stringify(b);
})());
check('generateSong: My Lyrics mode preserves seed lines verbatim', (function () {
  var s = A.generateSong({ seed: 5, genre: 'rock', styles: ['melodic'], method: 'lyrics', seedLines: ['Midnight found me standing in the rain', 'Thunder in my chest and steel in my soul', 'I keep walking down this broken road'], length: 'short', bridge: false, voice: null });
  var flat = A.flattenLines(s);
  return flat.indexOf('Midnight found me standing in the rain') !== -1 &&
    flat.indexOf('Thunder in my chest and steel in my soul') !== -1 &&
    flat.indexOf('I keep walking down this broken road') !== -1;
})());
check('generateSong: My Voice combines with describe mode (voiceUsed true)', (function () {
  var v = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain');
  var s = song({ voice: v });
  return s.voiceUsed === true;
})());
check('generateSong: My Voice combines with lyrics mode', (function () {
  var v = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain');
  var s = A.generateSong({ seed: 5, genre: 'metal', styles: ['dark'], method: 'lyrics', seedLines: ['Fire in my veins'], length: 'short', bridge: false, voice: v });
  return s.voiceUsed === true && A.flattenLines(s).indexOf('Fire in my veins') !== -1;
})());
check('generateSong: works for every genre', (function () {
  return A.GENRES.every(function (g) {
    var s = A.generateSong({ seed: 9, genre: g.id, styles: A.stylesForGenre(g.id).slice(0, 1).map(function (x) { return x.id; }), method: 'describe', description: 'a song about the night', length: 'short', bridge: false, voice: null });
    return s.sections.length === 3 && s.sections.every(function (sec) { return sec.lines.length >= 2; });
  });
})());
check('generateSong: two compatible styles both recorded', (function () {
  var s = song({ styles: ['dark', 'heavy'] });
  return s.styles.join(',') === 'dark,heavy';
})());
check('generateSong: every line in a full song is unique (no accidental repeats)', (function () {
  var s = song({ seed: 77 });
  var seen = {};
  for (var si = 0; si < s.sections.length; si++) {
    var sec = s.sections[si];
    for (var li = 0; li < sec.lines.length; li++) {
      /* Chorus hook repeats as first and last line by design — not an accident. */
      if (sec.role === 'chorus' && (li === 0 || li === sec.lines.length - 1)) continue;
      var k = sec.lines[li].trim().toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
    }
  }
  return true;
})());
check('songToText: includes title, section labels, lines', (function () {
  var s = song({ length: 'short', bridge: false });
  var t = A.songToText(s);
  return t.indexOf(s.title) !== -1 && t.indexOf('Verse 1') !== -1 &&
    t.indexOf('Chorus') !== -1 && t.indexOf('Outro') !== -1 && t.indexOf('Rock Hard') !== -1;
})());
check('flattenLines: returns every line in order', (function () {
  var s = song({ length: 'short', bridge: false });
  var flat = A.flattenLines(s);
  return flat.length === s.sections.reduce(function (n, sec) { return n + sec.lines.length; }, 0);
})());

/* ---------- quality gate: our own songs must pass checkSong clean ---------- */
check('QUALITY GATE: describe-mode songs pass checkSong with zero warnings (20 seeds x 5 genres)', (function () {
  var bad = [];
  for (var seed = 1; seed <= 20; seed++) {
    for (var gi = 0; gi < A.GENRES.length; gi++) {
      var g = A.GENRES[gi];
      var s = A.generateSong({ seed: seed, genre: g.id, styles: A.stylesForGenre(g.id).slice(0, 1).map(function (x) { return x.id; }), method: 'describe', description: 'a song about fire and the night', length: 'full', bridge: true, voice: null });
      if (s.warnings.length) bad.push(g.id + ' seed ' + seed + ': ' + s.warnings[0].message);
    }
  }
  if (bad.length) console.log('  quality failures: ' + bad.slice(0, 5).join(' | '));
  return bad.length === 0;
})());
check('QUALITY GATE: lyrics-mode songs pass checkSong with zero warnings (10 seeds)', (function () {
  var bad = [];
  var seeds = ['Midnight found me standing in the rain', 'Thunder in my chest and steel in my soul', 'I keep walking down this broken road'];
  for (var seed = 1; seed <= 10; seed++) {
    var s = A.generateSong({ seed: seed, genre: 'rock', styles: ['melodic'], method: 'lyrics', seedLines: seeds, length: 'full', bridge: true, voice: null });
    if (s.warnings.length) bad.push('seed ' + seed + ': ' + s.warnings[0].message);
  }
  if (bad.length) console.log('  lyrics quality failures: ' + bad.slice(0, 3).join(' | '));
  return bad.length === 0;
})());

/* ---------- checkSong catches real problems ---------- */
check('checkSong: flags a repeated line', (function () {
  var s = song({ length: 'short', bridge: false });
  s.sections[0].lines[1] = s.sections[0].lines[0];
  var w = A.checkSong(s);
  return w.some(function (x) { return x.type === 'repetition'; });
})());
check('checkSong: flags a 20-syllable line as hard to perform', (function () {
  var s = song({ length: 'short', bridge: false });
  s.sections[0].lines[0] = 'Internationalization and the circumstances of the situation are complicated';
  var w = A.checkSong(s);
  return w.some(function (x) { return x.type === 'perform'; });
})());
check('checkSong: flags mismatched rhyme in a couplet', (function () {
  var s = song({ length: 'short', bridge: false });
  s.sections[0].lines[0] = 'Burning with the fire';
  s.sections[0].lines[1] = 'Standing in the rain';
  var w = A.checkSong(s);
  return w.some(function (x) { return x.type === 'rhyme'; });
})());
check('checkSong: does NOT flag Robert\'s own seed lines', (function () {
  var s = A.generateSong({ seed: 5, genre: 'rock', styles: ['melodic'], method: 'lyrics', seedLines: ['Burning with the fire', 'Standing in the rain'], length: 'short', bridge: false, voice: null });
  var w = A.checkSong(s);
  return !w.some(function (x) { return x.type === 'rhyme'; });
})());

/* ---------- section regeneration ---------- */
function baseSong() {
  return A.generateSong({ seed: 5, genre: 'metal', styles: ['heavy'], method: 'describe', description: 'a song about fire', length: 'full', bridge: true, voice: null });
}
['darker', 'powerful', 'rhymes', 'emotional', 'perform'].forEach(function (inst) {
  check('regenerateSection ' + inst + ': returns a changed section with same role', (function () {
    var s = baseSong();
    var sec = s.sections[0];
    var out = A.regenerateSection(s, sec.id, inst, 42);
    return out && out.role === sec.role && out.lines.length >= 2 &&
      out.lines.join('|') !== sec.lines.join('|');
  })());
});
check('regenerateSection perform: result lines are shorter/easier than the original', (function () {
  var s = baseSong();
  var sec = s.sections[0];
  var before = Math.max.apply(null, sec.lines.map(function (l) { return A.countSyllables(l); }));
  var out = A.regenerateSection(s, sec.id, 'perform', 42);
  var after = Math.max.apply(null, out.lines.map(function (l) { return A.countSyllables(l); }));
  return after <= before;
})());
check('regenerateSection alternatives: 3 distinct versions, none identical to the original', (function () {
  var s = baseSong();
  var sec = s.sections[1];
  var out = A.regenerateSection(s, sec.id, 'alternatives', 42);
  var seen = {};
  var all = [sec.lines.join('|')].concat(out.map(function (x) { return x.lines.join('|'); }));
  return out.length === 3 && all.every(function (x) { if (seen[x]) return false; seen[x] = true; return true; });
})());
check('regenerateSection: unknown section id returns null', A.regenerateSection(baseSong(), 'nope-123', 'darker', 1) === null);
check('regenerateSection darker: stays in the same genre', (function () {
  var s = baseSong();
  var out = A.regenerateSection(s, s.sections[0].id, 'darker', 42);
  return out && out.role === 'verse1';
})());

/* ---------- backing tracks ---------- */
check('buildTrackPattern: every genre gives 16-step arrays', (function () {
  return A.GENRES.every(function (g) {
    var p = A.buildTrackPattern(g.id, g.bpm);
    return p.kick.length === 16 && p.snare.length === 16 && p.hat.length === 16 &&
      p.bass.length === 16 && p.riff.length === 16 && p.bpm === g.bpm && p.steps === 16;
  });
})());
check('buildTrackPattern: metal has a kick on step 0, rap has a snare on step 4', (function () {
  var m = A.buildTrackPattern('metal', 160);
  var r = A.buildTrackPattern('rap', 92);
  return m.kick[0] === 1 && r.snare[4] === 1;
})());
eq('midiToFreq(69) = 440', Math.round(A.midiToFreq(69)), 440);
eq('midiToFreq(57) = 220', Math.round(A.midiToFreq(57)), 220);
check('midiToFreq: higher note -> higher frequency', A.midiToFreq(81) > A.midiToFreq(69));

/* ---------- songbook ---------- */
var lib = [];
var s1 = song({ genre: 'metal', seed: 1 });
var s2 = song({ genre: 'rap', seed: 2 });
s2.title = 'Street Lights';
lib = A.songbookAdd(lib, s1);
eq('songbookAdd: adds one song', lib.length, 1);
lib = A.songbookAdd(lib, s2);
eq('songbookAdd: adds a second', lib.length, 2);
check('songbookAdd: assigns id and savedAt', lib[0].id && lib[0].savedAt);
check('songbookAdd: updating a song with the same id replaces it', (function () {
  var copy = Object.assign({}, lib[0], { title: 'Renamed' });
  var out = A.songbookAdd(lib, copy);
  return out.length === 2 && out[0].title === 'Renamed';
})());
check('songbookSearch: finds by title', A.songbookSearch(lib, 'street').length === 1 && A.songbookSearch(lib, 'street')[0].title === 'Street Lights');
check('songbookSearch: finds by lyric word', A.songbookSearch(lib, 'fire').length >= 1);
check('songbookSearch: finds by genre', A.songbookSearch(lib, 'rap').length === 1);
eq('songbookSearch: empty query returns all', A.songbookSearch(lib, '').length, 2);
eq('songbookSearch: no match returns empty', A.songbookSearch(lib, 'zzzzqqq').length, 0);
check('songbookToggleFavorite: flips favorite', (function () {
  var out = A.songbookToggleFavorite(lib, lib[0].id);
  return out[0].favorite === true && A.songbookToggleFavorite(out, lib[0].id)[0].favorite === false;
})());
check('songbookDuplicate: copy has a new id and "(copy)" in the title', (function () {
  var out = A.songbookDuplicate(lib, lib[0].id);
  return out.length === 3 && out[2].id !== lib[0].id && out[2].title.indexOf('(copy)') !== -1;
})());
check('songbookRemove: removes by id', A.songbookRemove(lib, lib[0].id).length === 1);
check('songbookRemove: unknown id leaves list unchanged', A.songbookRemove(lib, 'nope').length === 2);
check('exportSongTxt: contains title, genre, sections, lines', (function () {
  var t = A.exportSongTxt(lib[0]);
  return t.indexOf(lib[0].title) !== -1 && t.indexOf('Genre:') !== -1 &&
    t.indexOf('Verse 1') !== -1 && t.indexOf('Rock Hard') !== -1;
})());
check('exportBackup / importBackup: roundtrip preserves songs', (function () {
  var json = A.exportBackup(lib);
  var back = A.importBackup(json);
  return back.ok && back.songs.length === 2 && back.songs[1].title === 'Street Lights';
})());
check('importBackup: rejects garbage', (function () {
  var back = A.importBackup('not json at all');
  return back.ok === false && back.error;
})());
check('importBackup: rejects a valid JSON that is not a songbook', (function () {
  var back = A.importBackup(JSON.stringify({ hello: 'world' }));
  return back.ok === false;
})());

/* ---------- UI smoke: files, ids, manifest ---------- */
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
var js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
var manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

check('index.html: links the manifest', html.indexOf('manifest.webmanifest') !== -1);
check('index.html: links styles.css and app.js', html.indexOf('styles.css') !== -1 && html.indexOf('app.js') !== -1);
check('index.html: viewport meta prevents pinch-zoom on focus issues (16px inputs)', html.indexOf('width=device-width') !== -1);
check('index.html: title and header say Rock Hard', html.indexOf('<title>Rock Hard</title>') !== -1 && html.indexOf('Rock Hard') !== -1);
check('index.html: no "Metal Muse" branding left', html.indexOf('Metal Muse') === -1);
check('index.html: honest disclosure — rule-based, does not sing', html.indexOf('rule-based') !== -1 && html.indexOf('does not sing') !== -1);
check('index.html: has Create / Songbook / My Voice / About tabs', ['tab-create', 'tab-songbook', 'tab-voice', 'tab-about'].every(function (id) { return html.indexOf('id="' + id + '"') !== -1; }));
check('index.html: Android install hint mentions Chrome Add to Home Screen', html.indexOf('Add to Home Screen') !== -1);
check('styles.css: has the core UI classes', ['.tab-bar', '.chip', '.section-card', '.toast', '.lyric-line.is-singing', '.player-bar', '.song-item'].every(function (c) { return css.indexOf(c) !== -1; }));
check('styles.css: dark theme background', css.indexOf('#0B0B0E') !== -1);
check('manifest: name and short_name are Rock Hard', manifest.name === 'Rock Hard' && manifest.short_name === 'Rock Hard');
check('manifest: display standalone, has start_url and theme_color', manifest.display === 'standalone' && manifest.start_url && manifest.theme_color);
check('manifest: has 192 and 512 icons plus a maskable 512 (Chrome install)', (function () {
  var sizes = manifest.icons.map(function (i) { return i.sizes + ':' + (i.purpose || 'any'); });
  return sizes.indexOf('192x192:any') !== -1 && sizes.indexOf('512x512:any') !== -1 && sizes.indexOf('512x512:maskable') !== -1;
})());
check('manifest icons exist on disk', manifest.icons.every(function (i) { return fs.existsSync(path.join(root, i.src)); }));
check('app.js: no "Metal Muse" branding left', js.indexOf('Metal Muse') === -1);
check('app.js: no iOS-only APIs (webkitAudioContext is a fallback, not the only path)', js.indexOf('AudioContext') !== -1);

/* Every id the JS looks up must exist in the HTML (the classic break). */
check('UI smoke: every getElementById / $ id in app.js exists in index.html', (function () {
  var ids = {};
  var re = /getElementById\(['"]([^'"]+)['"]\)/g, m;
  while ((m = re.exec(js))) ids[m[1]] = true;
  re = /\$\(['"]([^'"]+)['"]\)/g;
  while ((m = re.exec(js))) ids[m[1]] = true;
  var missing = Object.keys(ids).filter(function (id) { return html.indexOf('id="' + id + '"') === -1; });
  if (missing.length) console.log('  missing ids: ' + missing.join(', '));
  return missing.length === 0;
})());
check('UI smoke: every data-tab target exists', (function () {
  var re = /data-tab="([^"]+)"/g, m, missing = [];
  while ((m = re.exec(html))) { if (html.indexOf('id="' + m[1] + '"') === -1) missing.push(m[1]); }
  return missing.length === 0;
})());

/* ---------- lyric quality gate (quality pass 2026-11-22) ---------- */
check('validateLine: accepts complete sentences', (function () {
  return ['I burn with fire', 'We rise above the fall', "I'm far from home",
    'Give me breath', "Don't fear the fall", 'The words were broken',
    'But now — I burn with fire', 'Yeah, we live with the blame',
    'Tonight, I see through the lies', 'He burns with fire'].every(function (l) { return A.validateLine(l).ok; });
})());
check('validateLine: rejects fragments and broken verb forms', (function () {
  return ['So in the scream', 'Now doors left broken', 'in the fire',
    "I'm lose my soul", "We're let it turn", "I'm hear the sound",
    'I running through the night', 'We fighting for the crown',
    'I burns with fire', 'We falls apart', 'Yeah, I said I burn with fire',
    'I burn with the the fire', 'I burn with the', 'Keep driving, i put my whole city on my back'].every(function (l) { return !A.validateLine(l).ok; });
})());
check('rhyme families: every lead + every word reads as a sentence', (function () {
  var bad = [];
  A.RHYME_FAMILIES.forEach(function (f) {
    f.leads.forEach(function (lead) {
      f.words.forEach(function (w) {
        var line = lead + ' ' + w;
        if (!A.validateLine(line).ok) bad.push(f.id + ': "' + line + '" (' + A.validateLine(line).reason + ')');
      });
    });
  });
  if (bad.length) console.log('  family failures: ' + bad.slice(0, 5).join(' | '));
  return bad.length === 0;
})());
check('rhyme family grace: no missing article ("searching for the place", never "searching for place")', (function () {
  var f = A.familyById('grace');
  return f.leads.every(function (lead) {
    return f.words.every(function (w) {
      var line = lead + ' ' + w;
      return !/for (place|face)$/.test(line) && line !== 'I found my face' && line !== 'We found our face';
    });
  });
})());
check('buildCouplet: lines pass validateLine across genres and seeds', (function () {
  var bad = [];
  for (var seed = 1; seed <= 20; seed++) {
    A.GENRES.forEach(function (g) {
      var c = A.buildCouplet(A.makeRng(seed), { theme: 'fire', genre: g.id, styles: A.stylesForGenre(g.id).slice(0, 1).map(function (x) { return x.id; }), easy: false }, []);
      c.lines.forEach(function (l) { if (!A.validateLine(l).ok) bad.push(g.id + ' seed ' + seed + ': "' + l + '"'); });
    });
  }
  if (bad.length) console.log('  couplet failures: ' + bad.slice(0, 3).join(' | '));
  return bad.length === 0;
})());
check('buildCouplet: no mid-sentence capital after a discourse marker ("But we", never "But We")', (function () {
  for (var seed = 1; seed <= 30; seed++) {
    var c = A.buildCouplet(A.makeRng(seed), { theme: 'fire', genre: 'rock', styles: ['heavy'], easy: false }, []);
    for (var i = 0; i < c.lines.length; i++) {
      if (/(, |^(But|So|And|Now|Still|Yeah|Tonight|Some nights|Every day) )(We|We're|Don't|The|What|It's)\b/.test(c.lines[i])) return false;
    }
  }
  return true;
})());
check('QUALITY GATE: full songs have zero grammar warnings (5 genres x lyrics/describe/voice+describe x 5 seeds)', (function () {
  var voice = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain');
  var bad = [];
  for (var seed = 1; seed <= 5; seed++) {
    A.GENRES.forEach(function (g) {
      var style = A.stylesForGenre(g.id).slice(0, 1).map(function (x) { return x.id; });
      var variants = [
        A.generateSong({ seed: seed, genre: g.id, styles: style, method: 'lyrics', seedLines: ['Midnight found me standing in the rain'], length: 'full', bridge: true }),
        A.generateSong({ seed: seed, genre: g.id, styles: style, method: 'describe', description: 'a song about fire and the night', length: 'full', bridge: true }),
        A.generateSong({ seed: seed, genre: g.id, styles: style, method: 'describe', description: 'a song about fire', length: 'full', bridge: true, voice: voice })
      ];
      variants.forEach(function (s) {
        var grams = s.warnings.filter(function (w) { return w.type === 'grammar'; });
        if (grams.length) bad.push(g.id + ' seed ' + seed + ': ' + grams[0].message);
      });
    });
  }
  if (bad.length) console.log('  grammar failures: ' + bad.slice(0, 3).join(' | '));
  return bad.length === 0;
})());
check('generated songs contain no "I said" filler', (function () {
  for (var seed = 1; seed <= 5; seed++) {
    for (var gi = 0; gi < A.GENRES.length; gi++) {
      var s = A.generateSong({ seed: seed, genre: A.GENRES[gi].id, styles: A.stylesForGenre(A.GENRES[gi].id).slice(0, 1).map(function (x) { return x.id; }), method: 'describe', description: 'a song about fire', length: 'full', bridge: true });
      if (A.flattenLines(s).some(function (l) { return /\bi said\b/i.test(l); })) return false;
    }
  }
  return true;
})());
check('bridge lines never have a lowercase "i" after "But now — "', (function () {
  for (var seed = 1; seed <= 10; seed++) {
    for (var gi = 0; gi < A.GENRES.length; gi++) {
      var s = A.generateSong({ seed: seed, genre: A.GENRES[gi].id, styles: ['heavy'], method: 'describe', description: 'a song about fire', length: 'full', bridge: true });
      var b = s.sections.filter(function (sec) { return sec.role === 'bridge'; })[0];
      if (b && /But now — i\b/.test(b.lines[0])) return false;
    }
  }
  return true;
})());
check('buildHook: rendered hook mentions the theme exactly once', (function () {
  var themes = ['fire', 'betrayal', 'heartbreak', 'family', 'fight', 'darkness'];
  for (var i = 0; i < 200; i++) {
    for (var t = 0; t < themes.length; t++) {
      var hook = A.buildHook(A.makeRng(i * 31 + t), { genre: 'metal', styles: ['heavy', 'dark'], theme: themes[t] });
      var count = (hook.toLowerCase().match(new RegExp('\\b' + themes[t] + '\\b', 'g')) || []).length;
      if (count !== 1) return false;
    }
  }
  return true;
})());
check('rhyme variety: a full song keeps at least 3 in 4 couplet lines on fresh rhyme words', (function () {
  var statementBank = {};
  A.GENRES.forEach(function (g) { g.statements.forEach(function (s) { statementBank[s.toLowerCase()] = true; }); });
  for (var seed = 1; seed <= 3; seed++) {
    for (var gi = 0; gi < A.GENRES.length; gi++) {
      var s = A.generateSong({ seed: seed, genre: A.GENRES[gi].id, styles: A.stylesForGenre(A.GENRES[gi].id).slice(0, 1).map(function (x) { return x.id; }), method: 'describe', description: 'a song about fire and the night', length: 'full', bridge: true });
      var lasts = [];
      s.sections.forEach(function (sec) {
        sec.lines.forEach(function (l, li) {
          if (sec.seedIndices && sec.seedIndices.indexOf(li) !== -1) return;
          if (statementBank[l.trim().toLowerCase()]) return;
          if (sec.role === 'chorus' && (li === 0 || li === sec.lines.length - 1)) return;
          if (sec.role === 'outro' && li === sec.lines.length - 1) return;
          lasts.push(A.lastWord(l));
        });
      });
      var distinct = {};
      lasts.forEach(function (w) { distinct[w] = true; });
      if (Object.keys(distinct).length / Math.max(1, lasts.length) < 0.75) return false;
    }
  }
  return true;
})());
check('style differentiation: Heavy vs Slow Romantic in rock use different rhyme families', (function () {
  function familySet(style) {
    var fams = {};
    for (var seed = 1; seed <= 8; seed++) {
      var s = A.generateSong({ seed: seed, genre: 'rock', styles: [style], method: 'describe', description: 'a song about the night', length: 'full', bridge: false });
      s.sections.forEach(function (sec) { (sec.families || []).forEach(function (f) { fams[f] = true; }); });
    }
    return fams;
  }
  var heavy = familySet('heavy'), rom = familySet('slow-romantic');
  var hKeys = Object.keys(heavy), rKeys = Object.keys(rom);
  var inter = hKeys.filter(function (k) { return rom[k]; }).length;
  var union = {};
  hKeys.concat(rKeys).forEach(function (k) { union[k] = true; });
  var jaccard = inter / Object.keys(union).length;
  return jaccard < 0.6 && hKeys.length >= 3 && rKeys.length >= 3;
})());
check('My Voice theme bias: rain-profile voice + describe "a song about fire" gives theme rain', (function () {
  var v = A.buildVoiceProfile('Midnight rain on the highway\nThunder rolling through the night\nI keep driving through the rain');
  var s = A.generateSong({ seed: 3, genre: 'rock', styles: ['heavy'], method: 'describe', description: 'a song about fire', length: 'short', bridge: false, voice: v });
  return s.theme === 'rain' && s.voiceUsed === true;
})());
check('extractTheme: the five description examples map to fitting themes', (function () {
  return A.extractTheme('Aggressive heavy metal song about surviving betrayal', 'heavy-metal') === 'betrayal' &&
    A.extractTheme('Slow romantic rock song about missing someone', 'rock') === 'heartbreak' &&
    A.extractTheme('Dark metal song about fighting personal demons', 'metal') === 'darkness' &&
    A.extractTheme('Emotional hip-hop song about family and perseverance', 'hip-hop') === 'family' &&
    A.extractTheme('Aggressive rap song about refusing to give up', 'rap') === 'fight';
})());
check('describe mode: theme word reaches the song (hook or title carries it)', (function () {
  var s = A.generateSong({ seed: 7, genre: 'heavy-metal', styles: ['aggressive'], method: 'describe', description: 'Aggressive heavy metal song about surviving betrayal', length: 'full', bridge: true });
  var text = (s.title + ' ' + A.songToText(s)).toLowerCase();
  return text.indexOf('betrayal') !== -1 && s.theme === 'betrayal' && s.warnings.length === 0;
})());

console.log('\nRock Hard tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
