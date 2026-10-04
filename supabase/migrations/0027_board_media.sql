-- 0027: whiteboard media — audio files (uploaded or recorded) next to pictures, up to 20 MB.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'
    ]
where id = 'board-files';
