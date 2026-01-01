-- Create user_profiles table for extended user information

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  street TEXT,
  house_number TEXT,
  house_number_addition TEXT,
  postal_code TEXT,
  city TEXT,
  phone_number TEXT,
  email TEXT,
  date_of_birth DATE,
  profile_completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

-- Enable RLS and policies
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users kunnen hun eigen profiel zien" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users kunnen hun eigen profiel updaten" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users kunnen hun eigen profiel aanmaken" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_profiles_updated_at_column();
