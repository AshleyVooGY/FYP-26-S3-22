-- Run inside the migration transaction BEFORE COMMIT; always ROLLBACK after tests.
-- These tests simulate JWT claims in an owner-controlled SQL session. They do not
-- create login sessions, change credentials, or leave test articles in the database.
create temporary table readiness_test_results(test text, result text) on commit drop;
do $$
declare viewer uuid; administrator uuid; cat bigint; tag bigint; draft bigint; receipt uuid; other_article bigint; blocked boolean;
begin
 select id into viewer from public.profiles where role='registered_user' order by created_at limit 1;
 select id into administrator from public.profiles where role='system_admin' order by created_at limit 1;
 select id into cat from public.categories order by id limit 1;
 select id into tag from public.tags order by id limit 1;
 if viewer is null or cat is null or tag is null then raise exception 'Test prerequisites missing'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 blocked:=false;
 begin perform public.set_user_role(viewer,'system_admin'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Ordinary role RPC allowed escalation'; end if;
 blocked:=false;
 begin update public.profiles set role='system_admin' where id=viewer; exception when others then blocked:=true; end;
 if not blocked then raise exception 'Direct profile role escalation allowed'; end if;
 draft:=public.save_my_article_workspace(null,'Readiness rollback test','Temporary content',array[cat],array[tag],false,null);
 if not exists(select 1 from public.article_categories where article_id=draft and category_id=cat)
 or not exists(select 1 from public.article_tags where article_id=draft and tag_id=tag) then raise exception 'Links not saved'; end if;
 blocked:=false;
 begin perform public.save_my_article_workspace(draft,'Should roll back','Changed',array[cat],array[-1::bigint],false,null); exception when foreign_key_violation then blocked:=true; end;
 if not blocked or not exists(select 1 from public.articles where id=draft and title='Readiness rollback test')
 or not exists(select 1 from public.article_tags where article_id=draft and tag_id=tag) then raise exception 'Atomic rollback failed'; end if;
 blocked:=false;
 begin perform public.save_my_article_workspace(draft,'Readiness rollback test','Temporary content',array[cat],array[tag],true,null); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Publishing without receipt allowed'; end if;
 blocked:=false;
 begin perform public.issue_article_credibility_receipt(viewer,'x','x',array[cat],array[tag],90,false); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Ordinary user can forge receipt'; end if;
 execute 'reset role';
 -- Trusted-service simulation only, fully rolled back. This is NOT an AI accuracy test.
 receipt:=public.issue_article_credibility_receipt(viewer,'Readiness rollback test','Temporary content',array[cat],array[tag],90,false);
 execute 'set local role authenticated';
 perform public.save_my_article_workspace(draft,'Readiness rollback test','Temporary content',array[cat],array[tag],true,receipt);
 if not exists(select 1 from public.articles where id=draft and status='published') then raise exception 'Reviewed publish failed'; end if;
 blocked:=false;
 begin perform public.save_my_article_workspace(draft,'Readiness rollback test','Temporary content',array[cat],array[tag],true,receipt); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Receipt replay allowed'; end if;
 blocked:=false;
 begin delete from public.article_tags where article_id=draft and tag_id=tag; exception when others then blocked:=true; end;
 if not blocked then raise exception 'Published tag change bypassed reviewed save'; end if;
 blocked:=false;
 begin perform public.get_analytics_overview(); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Ordinary user can access admin analytics'; end if;
 execute 'reset role';
 insert into readiness_test_results values('ordinary permissions, atomic draft, invalid-link rollback, reviewed publish, replay and published-link protection','PASS');
 if administrator is not null then
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.get_analytics_overview();
  -- Same-role operation: does not alter the target account's role.
  perform public.set_user_role(viewer,'registered_user');
  execute 'reset role';
  insert into readiness_test_results values('admin analytics and guarded role RPC','PASS');
 else insert into readiness_test_results values('admin checks','SKIPPED: no admin account'); end if;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 blocked:=false;
 begin perform public.save_my_article_workspace(null,'x','x',array[cat],array[tag],false,null); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Guest can write workspace'; end if;
 execute 'reset role';
 insert into readiness_test_results values('guest workspace denied','PASS');
end $$;
select * from readiness_test_results;
