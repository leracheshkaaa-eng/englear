-- Recorded listening audio (tts-audio/rec/*.mp3) comes with a small list of what exists,
-- rec/index.json, so the site never waits for files that are not there.
-- Additive: the bucket also accepts JSON now; nothing else changes.
update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'application/json']
where id = 'tts-audio' and allowed_mime_types = array['audio/mpeg'];
