-- Copyright (C) 2026 Jimmy Wong
-- SPDX-License-Identifier: AGPL-3.0-only
-- INPUT: Synthetic auth identities inside a caller-owned rollback transaction.
-- OUTPUT: Version-tolerant auth rows and request-local JWT claims.
-- POS: Shared hosted pgTAP fixture helpers.
-- [PROTOCOL]: Update this header when making changes, then check README.md.
create or replace function pg_temp.insert_auth_user(p_id uuid, p_email text) returns void
language plpgsql as $$
declare
  col record;
  names text[] := '{}';
  literals text[] := '{}';
  literal text;
begin
  for col in
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
    order by ordinal_position
  loop
    literal := case col.column_name
      when 'id' then quote_literal(p_id::text) || '::uuid'
      when 'instance_id' then quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid'
      when 'aud' then quote_literal('authenticated')
      when 'role' then quote_literal('authenticated')
      when 'email' then quote_literal(p_email)
      when 'encrypted_password' then quote_literal('')
      when 'email_confirmed_at' then 'now()'
      when 'created_at' then 'now()'
      when 'updated_at' then 'now()'
      when 'raw_app_meta_data' then quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb'
      when 'raw_user_meta_data' then quote_literal('{}') || '::jsonb'
      when 'confirmation_token' then quote_literal('')
      when 'recovery_token' then quote_literal('')
      when 'email_change' then quote_literal('')
      when 'email_change_token_new' then quote_literal('')
      when 'email_change_token_current' then quote_literal('')
      when 'reauthentication_token' then quote_literal('')
      when 'phone_change' then quote_literal('')
      when 'phone_change_token' then quote_literal('')
      when 'email_change_confirm_status' then '0'
      when 'is_super_admin' then 'false'
      when 'is_sso_user' then 'false'
      when 'is_anonymous' then 'false'
      else null
    end;
    if literal is null then
      if col.is_nullable = 'YES' or col.column_default is not null then continue; end if;
      raise exception 'auth.users.% has no test value', col.column_name;
    end if;
    names := names || quote_ident(col.column_name);
    literals := literals || literal;
  end loop;
  execute 'insert into auth.users (' || array_to_string(names, ',') || ') values (' || array_to_string(literals, ',') || ')';
end $$;

create or replace function pg_temp.insert_auth_session(p_id uuid, p_user uuid) returns void
language plpgsql as $$
declare
  col record;
  names text[] := '{}';
  literals text[] := '{}';
  literal text;
begin
  for col in
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'sessions'
    order by ordinal_position
  loop
    literal := case col.column_name
      when 'id' then quote_literal(p_id::text) || '::uuid'
      when 'user_id' then quote_literal(p_user::text) || '::uuid'
      when 'created_at' then 'now()'
      when 'updated_at' then 'now()'
      when 'refreshed_at' then 'now()'
      when 'aal' then quote_literal('aal1') || '::auth.aal_level'
      when 'refresh_token_counter' then '0'
      else null
    end;
    if literal is null then
      if col.is_nullable = 'YES' or col.column_default is not null then continue; end if;
      raise exception 'auth.sessions.% has no test value', col.column_name;
    end if;
    names := names || quote_ident(col.column_name);
    literals := literals || literal;
  end loop;
  execute 'insert into auth.sessions (' || array_to_string(names, ',') || ') values (' || array_to_string(literals, ',') || ')';
end $$;

create or replace function pg_temp.login(p_uid uuid, p_sid uuid) returns void
language plpgsql as $$
declare claims text := json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_sid)::text;
begin
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim', claims, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

