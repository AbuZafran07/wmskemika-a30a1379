-- Fix 1: Restrict access to profiles.email column - only owner and super_admin can read email
REVOKE SELECT (email) ON public.profiles FROM authenticated, anon;
GRANT SELECT (email) ON public.profiles TO service_role;

-- Fix 2: Remove public read access to product-photos bucket; require authentication
DROP POLICY IF EXISTS "Public can view product photos" ON storage.objects;

CREATE POLICY "Authenticated users can view product photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'product-photos' AND auth.uid() IS NOT NULL);