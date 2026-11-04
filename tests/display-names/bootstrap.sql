create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
create table public.profiles(id uuid primary key references auth.users(id),display_name text not null,role text default 'registered_user',subscription_tier text default 'free',created_at timestamptz default now());
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.profiles(id,display_name) values ('00000000-0000-0000-0000-000000000001','Fisher'),('00000000-0000-0000-0000-000000000002','Other');
\ir ../../supabase/auth.sql
