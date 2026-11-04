-- Run only against the disposable database created by bootstrap.sql.
begin;
do $$begin
 begin
  insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003','{"display_name":" FISHER "}');
  raise exception 'duplicate signup accepted';
 exception when unique_violation then null;
 end;
 if exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000003') then raise exception 'orphan Auth account left behind'; end if;
 insert into auth.users(id,raw_user_meta_data) values ('00000000-0000-0000-0000-000000000003','{"display_name":" New registrant ","requested_tier":"premium"}');
 if not exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000003' and display_name='New registrant' and subscription_tier='premium' and role='registered_user') then raise exception 'signup profile/plan failed'; end if;
end$$;
grant usage on schema auth to anon,authenticated;
set local role anon;
do $$begin
 if public.is_display_name_available('  fIsHeR  ') then raise exception 'case/space lookup failed'; end if;
 if not public.is_display_name_available('Fresh Name') then raise exception 'new name unavailable'; end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$begin
 begin perform public.update_my_display_name(U&'\00A0FISHER\3000'); raise exception 'duplicate RPC accepted'; exception when unique_violation then null; end;
 if (select display_name from public.profiles where id=auth.uid()) <> 'Other' then raise exception 'failed rename changed profile'; end if;
 begin update public.profiles set display_name=' fisher ' where id=auth.uid(); raise exception 'direct duplicate write accepted'; exception when unique_violation then null; end;
 if public.update_my_display_name('  Other  ') <> 'Other' then raise exception 'own name rejected'; end if;
 if not public.is_display_name_available('OTHER') then raise exception 'own lookup unavailable'; end if;
 if public.update_my_display_name('  Fresh name  ') <> 'Fresh name' then raise exception 'trim failed'; end if;
 if (select raw_user_meta_data->>'display_name' from auth.users where id=auth.uid()) <> 'Fresh name' then raise exception 'Auth mirror not updated'; end if;
 begin update public.profiles set display_name=E'bad\nname' where id=auth.uid(); raise exception 'control character accepted'; exception when invalid_parameter_value then null; end;
 begin update public.profiles set display_name=repeat('x',61) where id=auth.uid(); raise exception 'long name accepted'; exception when invalid_parameter_value then null; end;
end$$;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$begin
 begin perform public.update_my_display_name('Unauthorised');raise exception 'anonymous rename allowed'; exception when insufficient_privilege then null; end;
end$$;
reset role;
rollback;
