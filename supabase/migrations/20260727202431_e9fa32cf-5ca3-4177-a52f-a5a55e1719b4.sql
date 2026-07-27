ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS manual_whatsapp text,
  ADD COLUMN IF NOT EXISTS manual_supervisor_telefone text;