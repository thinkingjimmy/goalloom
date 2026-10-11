-- Local Postgres stand-in for Supabase Auth. Not applied on a real project:
-- auth.users and auth.sessions already exist there. Run this only before 0001_core.sql
-- when those objects are missing.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);

create table if not exists auth._request (
  id integer primary key check (id = 1),
  uid uuid,
  jwt jsonb not null default '{}'::jsonb
);

insert into auth._request(id, uid, jwt) values (1, null, '{}'::jsonb) on conflict (id) do nothing;

create or replace function auth.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select uid from auth._request where id = 1
$$;

create or replace function auth.jwt() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jwt from auth._request where id = 1
$$;

create or replace function auth._login(p_uid uuid, p_sid uuid) returns void
language sql security definer set search_path = '' as $$
  update auth._request
     set uid = p_uid,
         jwt = jsonb_build_object('sub', p_uid::text, 'session_id', p_sid::text)
   where id = 1
$$;
