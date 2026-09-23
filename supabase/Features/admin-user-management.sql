-- Admin User Management
--
-- Not one of the 10 approved PRD features - added so a System Admin
-- can promote/demote other users without hand-editing the database
-- each time. No new functions: the existing "Users can view/update
-- own profile" policies stay as-is, these are additive permissive
-- policies (OR'd with the owner-only ones) using the is_system_admin()
-- helper Feature 1 already defined.

drop policy if exists "System Admin can view all profiles" on public.profiles;
create policy "System Admin can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_system_admin());

drop policy if exists "System Admin can update any profile" on public.profiles;
create policy "System Admin can update any profile"
on public.profiles
for update
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());
