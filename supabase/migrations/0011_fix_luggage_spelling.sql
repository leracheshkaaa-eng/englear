-- ============================================================
-- EngLear — American spelling in the definition of "luggage".
-- Run after 0010. Idempotent; the word id does not change.
-- ============================================================

update public.dictionary_words set definition = 'Bags and cases for traveling.'
where language = 'en' and lower(word) = 'luggage' and definition = 'Bags and cases for travelling.';
