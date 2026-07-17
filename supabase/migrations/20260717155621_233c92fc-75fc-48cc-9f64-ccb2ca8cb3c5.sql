
CREATE POLICY "atestados_upload_gestao"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'atestados' AND (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'rh') OR
    public.has_role(auth.uid(), 'supervisor')
  )
);

CREATE POLICY "atestados_leitura_autorizada"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'atestados' AND (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'rh') OR
    public.has_role(auth.uid(), 'supervisor') OR
    public.has_role(auth.uid(), 'compliance')
  )
);
