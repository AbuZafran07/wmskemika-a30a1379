
-- 1) Protect email column on profiles via column-level privileges
REVOKE SELECT (email) ON public.profiles FROM authenticated, anon;
GRANT SELECT (id, full_name, avatar_url, is_active, created_at, updated_at)
  ON public.profiles TO authenticated;

-- Allow users to read their own email via a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- 2) Add restrictive policy on user_roles to prevent self-escalation INSERT
CREATE POLICY "Block non-super_admin role inserts"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Block non-super_admin role updates"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Block non-super_admin role deletes"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3) Remove push_tokens from realtime publication (privacy leak)
ALTER PUBLICATION supabase_realtime DROP TABLE public.push_tokens;

-- 4) Add restrictive UPDATE policy on storage.objects for backups bucket
CREATE POLICY "Backups bucket is immutable"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (bucket_id <> 'backups')
  WITH CHECK (bucket_id <> 'backups');
