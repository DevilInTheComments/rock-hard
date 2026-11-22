# Rock Hard 🤘

A songwriting app for Robert Kirk. Type a few lyrics, or describe a song in
plain words, and get the whole song — plus a backing track to perform over.

- **3 ways to start:** My Lyrics (your lines, kept word for word), Describe My
  Song (lyrics from a plain description), My Voice (a locally stored style
  profile that combines with either of the other two).
- **5 genres:** Metal, Heavy Metal, Rock, Rap, Hip-Hop.
- **10 styles:** Heavy, Slow Romantic, Aggressive, Dark, Melancholic, Anthemic,
  Uplifting, Rebellious, Melodic, Emotional — with genre-appropriate
  availability and compatible pairs (Dark + Heavy, and more).
- **Structure:** Short (verse + chorus) or Full, optional bridge. Verse 1
  introduces, verse 2 develops, the chorus is the central message, the bridge
  turns the story, the outro resolves it.
- **Section regeneration:** make a verse darker, a chorus more powerful,
  better rhymes, more emotional, easier to perform — or 3 alternatives.
- **Backing tracks:** Web Audio drums, bass, and riffs per genre, BPM control
  with genre defaults, instrument toggles, scrolling lyrics while it plays.
- **Songbook:** auto-save, favorites, search by title/genre, edit, duplicate,
  undo, TXT export per song, full JSON backup export/import.
- **Quality checks:** the engine checks its own work for repeated lines,
  broken rhymes, awkward syllable counts, and hard-to-perform lines.

## Honest disclosure

The lyrics are written by a rule-based engine running entirely on your phone.
It is not a real AI model and it does not sing. Real AI vocals need a paid
service; this app is $0, ad-free, no accounts, no API keys, works offline.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

```sh
node --check app.js
node tests/test.js
```

## Deploy

Standalone GitHub Pages site (like HoodTalk / Deep Current): publish the repo
root, no build step. Icons live in `icons/`, regenerate with:

```sh
python3 scripts/make_icons.py
```

Offline: `sw.js` caches the app shell (cache-first) on first load, so the app
opens with no connection. Bump `CACHE_NAME` in `sw.js` when the shell files
change, so phones pick up the new version.

## Platform

Primary target is **Android Chrome** (Robert's phone). Add to Home Screen via
Chrome: the manifest is installable (`display: standalone`, 192 + 512 icons,
plus a maskable 512 icon). Also works on iPhone/Safari, but Android is tested
first. 16px inputs so Chrome never zooms on focus; the audio scheduler uses a
0.2s lookahead because mobile timers can lag.
