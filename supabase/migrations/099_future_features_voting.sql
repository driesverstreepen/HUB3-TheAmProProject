-- Migration 099: Future features voting (user + studio interfaces)
--
-- Stores interface-specific feature ideas and anonymous vote counts.
-- Enforces: each authenticated user can vote at most once per feature.

-- Tables
CREATE TABLE IF NOT EXISTS public.future_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interface text NOT NULL CHECK (interface IN ('user', 'studio')),
  title text NOT NULL,
  description text,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.future_feature_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id uuid NOT NULL REFERENCES public.future_features(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT future_feature_votes_unique UNIQUE (feature_id, user_id)
);

-- RLS
ALTER TABLE public.future_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.future_feature_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS future_features_select_authenticated ON public.future_features;
CREATE POLICY future_features_select_authenticated
  ON public.future_features
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS future_feature_votes_insert_own ON public.future_feature_votes;
CREATE POLICY future_feature_votes_insert_own
  ON public.future_feature_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS future_feature_votes_select_own ON public.future_feature_votes;
CREATE POLICY future_feature_votes_select_own
  ON public.future_feature_votes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger: increment vote_count on first vote insert
CREATE OR REPLACE FUNCTION public.increment_future_feature_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.future_features
  SET vote_count = vote_count + 1
  WHERE id = NEW.feature_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_future_feature_vote_count ON public.future_feature_votes;
CREATE TRIGGER trg_increment_future_feature_vote_count
AFTER INSERT ON public.future_feature_votes
FOR EACH ROW
EXECUTE FUNCTION public.increment_future_feature_vote_count();

-- RPC: vote once per user per feature; returns current vote_count
CREATE OR REPLACE FUNCTION public.vote_future_feature(p_feature_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.future_feature_votes (feature_id, user_id)
  VALUES (p_feature_id, v_user_id)
  ON CONFLICT (feature_id, user_id) DO NOTHING;

  SELECT ff.vote_count
    INTO v_count
  FROM public.future_features ff
  WHERE ff.id = p_feature_id;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_future_feature(uuid) TO authenticated;
