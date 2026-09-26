# Dictionary packages

Words are added to the dictionary in packages (one JSON file per topic) and
imported with `public.import_dictionary_words(words, dry_run)`:

- a **new** word is added;
- an **existing** word (same text, ignoring case) only gets its **empty** fields
  filled and missing translations added;
- a different non-empty value is reported as a **conflict** and never overwritten;
- `dry_run = true` (the default) writes nothing and only reports.

New words automatically appear in the library flashcard sets of their topic and
level. Sets a student has already started keep their own word list.

## File format

```json
{
  "package": "travel",
  "kind": "words",
  "words": [
    {
      "word": "airport",
      "part_of_speech": "noun",
      "cefr": "A2",
      "topic": "Travel",
      "ipa": "/ˈerpɔːrt/",
      "definition": "A place where planes take off and land.",
      "examples": ["We arrived at the airport early."],
      "translations": { "uk": "аеропорт", "de": "Flughafen", "fr": "aéroport", "es": "aeropuerto", "it": "aeroporto",
                        "pt": "aeroporto", "pl": "lotnisko", "ru": "аэропорт", "zh": "机场", "ja": "空港" },
      "word_type": "word",
      "ielts_category": null
    }
  ]
}
```

- `kind: "words"` — full entries; every field above is required except
  `word_type` (default `word`) and `ielts_category`.
- `kind: "translations"` — only `word` + `translations`, for words that already exist.
- `translations` must contain all 10 translation languages: uk, de, fr, es, it, pt, pl, ru, zh (Simplified), ja.
- `cefr`: A1–C2. `topic`: one of the topics in `src/lib/config.ts`.
- `ipa`: American English, e.g. `/ˈwɑːtɚ/` (no British ɒ / əʊ / ɜː / eə / ɪə / ʊə).
- American spelling for words and examples (color, neighbor, analyze).

## Workflow

```bash
node scripts/dictionary/validate.mjs                 # check every package
node scripts/dictionary/to-sql.mjs travel.json       # SQL for a dry run
node scripts/dictionary/to-sql.mjs travel.json --real  # SQL that imports
```

Run the dry run first, review the report (new / updated / conflicts / invalid),
then run the real import.
