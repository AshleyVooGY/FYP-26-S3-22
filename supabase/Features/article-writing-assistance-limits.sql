-- Optional writing assistance: same hourly limit for all authenticated accounts.
-- Does not trust subscription/user IDs supplied by the browser.
begin;
create schema if not exists internal;
create table if not exists internal.writing_assistance_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 request_count integer not null check(request_count between 1 and 20),
 primary key(user_id,window_start)
);
alter table internal.writing_assistance_usage enable row level security;
revoke all on internal.writing_assistance_usage from public,anon,authenticated;
create or replace function public.claim_writing_assistance_request()
returns integer language plpgsql security definer set search_path=public as $$
declare used integer;
begin
 if auth.uid() is null then raise exception 'Sign in to use writing assistance'; end if;
 insert into internal.writing_assistance_usage(user_id,window_start,request_count)
 values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id,window_start) do update set request_count=internal.writing_assistance_usage.request_count+1
 where internal.writing_assistance_usage.request_count<20 returning request_count into used;
 return case when used is null then -1 else 20-used end;
end $$;
revoke all on function public.claim_writing_assistance_request() from public,anon;
grant execute on function public.claim_writing_assistance_request() to authenticated;
commit;
