-- Disposable fixture only; apply bootstrap and the original feed migration first.
-- Preserve the original function to prove ranking has not changed.
alter function public.get_my_news_feed(jsonb,integer) rename to get_my_news_feed_before_limit;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.set_my_news_preferences(array[1]::bigint[],array[10]::bigint[],true);
create temp table feed_baseline as
 select public.get_my_news_feed_before_limit(null,6) as response;
create temp table expected_ids as
 select s.article_ids[1:12] as ids from public.news_feed_sessions s
 where s.id=((select response->'next_cursor'->>'session' from feed_baseline))::uuid;
reset role;
\ir ../../supabase/Features/personalized-news-feed-selection-limit.sql
begin;
set local role authenticated;
do $$declare first_page jsonb; second_page jsonb; legacy_page jsonb; ids bigint[]; sid uuid; begin
 first_page:=public.get_my_news_feed(null,6);
 sid:=(first_page->'next_cursor'->>'session')::uuid;
 select article_ids into ids from public.news_feed_sessions where id=sid;
 if cardinality(ids)<>12 or ids<>(select e.ids from expected_ids e) then raise exception 'selection limit/ranking changed'; end if;
 if jsonb_array_length(first_page->'articles')<>6 then raise exception 'first page not six'; end if;
 second_page:=public.get_my_news_feed(first_page->'next_cursor',6);
 if jsonb_array_length(second_page->'articles')<>6 or second_page->'next_cursor'<>'null'::jsonb then raise exception 'second page/end cursor incorrect'; end if;
 if exists(select 1 from jsonb_array_elements(first_page->'articles') a join jsonb_array_elements(second_page->'articles') b on a->>'id'=b->>'id') then raise exception 'duplicate page articles'; end if;
 legacy_page:=public.get_my_news_feed((select response->'next_cursor' from feed_baseline),6);
 if jsonb_array_length(legacy_page->'articles')<>6 or legacy_page->'next_cursor'<>'null'::jsonb then raise exception 'legacy snapshot not capped'; end if;
 begin
 perform public.get_my_news_feed(jsonb_set((select response->'next_cursor' from feed_baseline),'{position}','18'),6);
 raise exception 'legacy third-page cursor accepted';
 exception when invalid_parameter_value then null; end;
 perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
 begin perform public.get_my_news_feed(first_page->'next_cursor',6);raise exception 'foreign session accepted';exception when invalid_parameter_value then null;end;
 first_page:=public.get_my_news_feed(null,24);
 if jsonb_array_length(first_page->'articles')<>12 or first_page->>'feed_type'<>'discover' then raise exception 'no-preference selection not capped'; end if;
end$$;
reset role;
update public.articles set status='draft' where id>3;
set local role authenticated;
do $$declare f jsonb;begin
 f:=public.get_my_news_feed(null,6);
 if jsonb_array_length(f->'articles')<>3 or f->'next_cursor'<>'null'::jsonb then raise exception 'short feed padded';end if;
end$$;
reset role;
update public.articles set status='draft';
set local role authenticated;
do $$declare f jsonb;begin
 f:=public.get_my_news_feed(null,6);
 if jsonb_array_length(f->'articles')<>0 or f->'next_cursor'<>'null'::jsonb then raise exception 'empty feed failed';end if;
end$$;
reset role;
set local role anon;
do $$begin
 begin perform public.get_my_news_feed(null,6);raise exception 'guest feed access allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: ranking preserved, 12-story limit, 6+6 pages, legacy cursors, short/empty feeds and access isolation' as verification;
