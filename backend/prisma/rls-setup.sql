-- Enable Row-Level Security on all public tables.
-- Backend (Prisma with postgres role) automatically bypasses RLS,
-- so no application code changes are required.
-- Absence of any policy = deny all access via Supabase REST API (anon/authenticated roles).

ALTER TABLE public.committees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs     ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke default grants so REST API has no privilege path.
REVOKE ALL ON public.committees            FROM anon, authenticated;
REVOKE ALL ON public.event_settings        FROM anon, authenticated;
REVOKE ALL ON public.registration_sessions FROM anon, authenticated;
REVOKE ALL ON public.participants          FROM anon, authenticated;
REVOKE ALL ON public.notification_logs     FROM anon, authenticated;
