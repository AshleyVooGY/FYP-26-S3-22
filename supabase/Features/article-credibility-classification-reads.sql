-- The server-side credibility function validates IDs and labels before assessment.
-- These classification labels are already public-readable; no user data is exposed.
begin;
grant select on public.categories, public.tags to service_role;
commit;
