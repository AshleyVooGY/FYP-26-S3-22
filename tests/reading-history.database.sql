-- Execute inside BEGIN/ROLLBACK after the new history SQL; no records are retained.
create temporary table history_test_results(test text,result text) on commit drop;
do $$
declare first_user uuid; second_user uuid; article bigint; before_count integer; after_count integer;
 viewed boolean; initial_time timestamptz; final_time timestamptz; blocked boolean;
begin
 select id into first_user from public.profiles order by created_at limit 1;
 select id into second_user from public.profiles where id<>first_user order by created_at limit 1;
 select id,view_count into article,before_count from public.articles where status='published' order by id limit 1;
 if first_user is null or second_user is null or article is null then raise exception 'Two users and a published article are required'; end if;
 insert into public.article_views(article_id,viewer_identifier,viewed_on,viewed_at)
 values(article,'user:'||first_user::text,current_date-1,now()-interval '1 day'),
       (article,'user:'||second_user::text,current_date-1,now()-interval '1 day') on conflict do nothing;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',first_user,'role','authenticated')::text,true);
 set local role authenticated;
 select r.view_counted,r.updated_view_count into viewed,after_count from public.record_article_view(article,null) r;
 if after_count <> before_count + (case when viewed then 1 else 0 end) then raise exception 'Daily view count incorrect'; end if;
 select h.viewed_at into initial_time from public.get_reading_history() h where h.article_id=article;
 select r.view_counted,r.updated_view_count into viewed,before_count from public.record_article_view(article,null) r;
 select h.viewed_at into final_time from public.get_reading_history() h where h.article_id=article;
 if viewed or before_count<>after_count then raise exception 'Same-day re-read inflated views'; end if;
 if initial_time is null or final_time<=initial_time then raise exception 'Latest read time not refreshed'; end if;
 if (select count(*) from public.get_reading_history() h where h.article_id=article)<>1 then raise exception 'Repeated article not deduplicated'; end if;
 if exists(select 1 from public.article_views where viewer_identifier <> 'user:'||first_user::text) then raise exception 'First user can read other users'; end if;
 blocked:=false;
 begin insert into public.article_views(article_id,viewer_identifier) values(article,'user:'||second_user::text); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Client can forge someone else history'; end if;
 reset role;
 insert into history_test_results values('Record/read/re-read; latest timestamp; one daily view; deduplication; first user isolation; forged writes denied','PASS');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',second_user,'role','authenticated')::text,true);
 set local role authenticated;
 if exists(select 1 from public.article_views where viewer_identifier <> 'user:'||second_user::text) then raise exception 'Second user can read other users'; end if;
 if not exists(select 1 from public.get_reading_history() h where h.article_id=article) then raise exception 'Second user own history missing'; end if;
 reset role;
 insert into history_test_results values('Second account sees only its own history','PASS');
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 set local role anon;
 blocked:=false;
 begin perform public.get_reading_history(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Guest can call personal history'; end if;
 blocked:=false;
 begin perform 1 from public.article_views limit 1; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Guest can read raw history'; end if;
 reset role;
 insert into history_test_results values('Guest personal RPC and direct history reads denied','PASS');
end $$;
select * from history_test_results;
