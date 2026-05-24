-- Add daily_intentions table for the check-in flow
-- Each user can have one intention per calendar day (UPSERT on conflict)
-- Supports three input modes: video (default), voice note, or text
--
-- This migration is fully idempotent — safe to re-run if partially applied.

-- ---------------------------------------------------------------------------
-- Table (original schema — ALTER TABLE below brings it to the current shape)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_intentions (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              date         NOT NULL,
  text              text         NOT NULL,
  share_with_groups boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT daily_intentions_user_date_unique UNIQUE (user_id, date)
);

-- Make text nullable (null when the user records video or voice instead)
ALTER TABLE daily_intentions ALTER COLUMN text DROP NOT NULL;

-- Add media columns (no-op when they already exist)
ALTER TABLE daily_intentions
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'text'
    CHECK (media_type IN ('video', 'voice', 'text'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE daily_intentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own intentions" ON daily_intentions;
CREATE POLICY "Users can manage their own intentions"
  ON daily_intentions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fast lookup: "get yesterday's / today's intention"
CREATE INDEX IF NOT EXISTS daily_intentions_user_date_idx
  ON daily_intentions (user_id, date DESC);

-- ---------------------------------------------------------------------------
-- Storage bucket for intention media (video + voice)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'intention-media',
  'intention-media',
  false,
  104857600,  -- 100 MB max per file
  ARRAY['video/mp4', 'video/quicktime', 'audio/m4a', 'audio/mpeg', 'audio/aac', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "intention-media: users upload own files" ON storage.objects;
CREATE POLICY "intention-media: users upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'intention-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "intention-media: users read own files" ON storage.objects;
CREATE POLICY "intention-media: users read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'intention-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "intention-media: users delete own files" ON storage.objects;
CREATE POLICY "intention-media: users delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'intention-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
