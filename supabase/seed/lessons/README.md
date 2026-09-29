# Lesson packages

JSON packages of library lessons (`kind: "lesson"`, grammar / vocabulary) and practice
materials (`kind: "practice"`, reading / listening with questions). They are imported
into the site library as **drafts**; the admin reviews and publishes them.

```
node scripts/lessons/validate.mjs                      # check every package
node scripts/lessons/to-sql.mjs supabase/seed/lessons/starter.json > out.sql
```

The SQL only adds lessons whose title is not in the library yet — existing lessons are
never changed.

## Rules for tasks (checked by the validator where possible)

- Every task is solvable from the text / recording: the answer is stated there.
- Exactly one right option; wrong options are clearly wrong according to the text.
- Questions follow the order of the text; a "before you read" word match comes first.
- `truefalse`: A1–A2 use true / false; "not given" only from B1.
- `fill`: list every acceptable answer (`"accept": ["7"]` next to `"answer": "seven"`).
- `order`: only sequences with one possible order (no "At seven he gets up" alternatives).
- `listen` (dictation): short phrases without punctuation inside.
- Choice options are shuffled on import (numbers and times keep their order).

## Exercise shapes

```json
{ "type": "choice", "prompt": "…?", "options": ["a", "b", "c"], "answer": "b", "explanation": "quote from the text" }
{ "type": "truefalse", "prompt": "statement", "answer": "true | false | not_given" }
{ "type": "fill", "prompt": "… ___ …", "answer": "seven", "accept": ["7"] }
{ "type": "order", "prompt": "", "order": ["in", "the", "right", "order"] }
{ "type": "match", "prompt": "", "pairs": { "left": "right" } }
{ "type": "listen", "text": "a short phrase" }
```

Practice lessons also have `material`: `{ "type": "article", "body": "paragraphs…" }` for
reading, or `{ "type": "podcast", "segments": [{ "speaker": "Host", "text": "…" }] }` for listening.
