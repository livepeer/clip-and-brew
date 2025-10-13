-- Add likes system to clips
-- This migration adds a clip_likes table and a cached likes_count column

-- Add likes_count column to clips table
ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0 NOT NULL;

-- Create clip_likes table
CREATE TABLE IF NOT EXISTS public.clip_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add unique constraint to prevent duplicate likes
ALTER TABLE public.clip_likes
ADD CONSTRAINT clip_likes_unique_user_clip UNIQUE (clip_id, user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_clip_likes_clip_id ON public.clip_likes(clip_id);
CREATE INDEX IF NOT EXISTS idx_clip_likes_user_id ON public.clip_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_likes_count ON public.clips(likes_count DESC);

-- Enable RLS
ALTER TABLE public.clip_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clip_likes
CREATE POLICY "Anyone can view likes" ON public.clip_likes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert likes" ON public.clip_likes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their own likes" ON public.clip_likes
  FOR DELETE USING (true);

-- Create function to update likes_count
CREATE OR REPLACE FUNCTION update_clip_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.clips
    SET likes_count = likes_count + 1
    WHERE id = NEW.clip_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.clips
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.clip_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to maintain likes_count consistency
CREATE TRIGGER trigger_update_clip_likes_count
AFTER INSERT OR DELETE ON public.clip_likes
FOR EACH ROW
EXECUTE FUNCTION update_clip_likes_count();

-- Initialize likes_count for existing clips
UPDATE public.clips
SET likes_count = (
  SELECT COUNT(*)
  FROM public.clip_likes
  WHERE clip_likes.clip_id = clips.id
)
WHERE likes_count = 0;

