-- Add this to your Supabase SQL Editor
-- Creates table to store NOID image URLs

CREATE TABLE IF NOT EXISTS noid_images (
  token_id INTEGER PRIMARY KEY,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE noid_images ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on noid_images" 
  ON noid_images FOR SELECT 
  USING (true);

-- Allow public insert (for the scraper)
CREATE POLICY "Allow public insert on noid_images" 
  ON noid_images FOR INSERT 
  WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX idx_noid_images_token_id ON noid_images(token_id);

COMMENT ON TABLE noid_images IS 'Cached NOID NFT image URLs';
