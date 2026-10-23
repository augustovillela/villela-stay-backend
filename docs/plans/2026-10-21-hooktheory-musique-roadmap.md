# Hooktheory-inspired features for Musique

## Scope

The Musique implementation is original. It uses public interaction patterns as
inspiration, but does not copy Hooktheory source code, visual assets, database
records, transcriptions, books, or paid content. User-owned or properly
licensed songs remain the source for the Musique library.

## Public behavior used as reference

- A visual songwriting timeline with relative Roman-numeral notation.
- Color-coded chords and melody, with key, tempo, loop, and transposition.
- Playback while editing, piano previews, and export/import of musical data.
- Searchable song analysis with chord, melody, function, and timeline views.
- An adaptive ear-training game built around chord recognition.
- Theory lessons connected directly to the editor and practice activities.

## Delivery phases

### Phase 1 — Composer vertical slice (implemented)

Route: `/music/criar/compositor-visual`

- Eight editable timeline cells with chord degree and melody degree.
- Major/minor key selector and tempo.
- Relative notation remains stable while the key changes.
- Color cues for tonic, subdominant, and dominant functions.
- Play one cell or the complete loop; stop and restart safely.
- Save/load a local draft and export a portable JSON document.
- Entry in the Criar catalog, search index, related links, and sitemap.

### Phase 2 — Rich arrangement editor (núcleo inicial implementado)

- Variable-length sections (intro, verse, chorus, bridge, outro): the visual
  composer now supports adding/removing measures, naming sections, and choosing
  2, 3, 4, 6, or 8 beats per cell.
- Multiple melody voices, bass pattern, drum lane, lyrics, and markers.
- Per-cell duration, inversion, slash bass, voicing, velocity, and articulation.
- MIDI import/export and MusicXML export using the existing Musique parsers.
- Audio preview with instrument selection and volume/mix controls.

### Phase 3 — Analysis library

- Musique-owned song records with version history and contributor notes.
- Chord/melody timeline, Roman numerals, key-relative search, and filters.
- Progression explorer: “what can follow this?” based on theory rules and
  Musique's own catalog statistics.
- Compatibility view showing melody tones that are chord tones, tensions, or
  non-chord passing tones.

### Phase 4 — Ear training and curriculum

- Chord-recognition challenges with progressive difficulty, train mode, and
  session history.
- Practice sets by key, cadence, inversion, style, and instrument timbre.
- Links from each challenge to the relevant theory lesson and composer cell.

### Phase 5 — Publishing and collaboration

- Draft/review/publish workflow for personal and licensed material.
- Shareable read-only analysis links and accessible print/PDF views.
- Teacher assignments, learner progress, and privacy controls.
- Performance budgets for low-end devices and slow connections.

## Acceptance criteria

Every phase must keep the existing `npm.cmd run test:music` and
`npm.cmd run test:music-tocar` suites green, expose a server-rendered fallback,
avoid sending raw user audio to the server without an explicit feature and
permission, and preserve original-content/licensing metadata.
