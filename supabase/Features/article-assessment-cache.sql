-- Deploy after article-required-category-review.sql. Deploy this BEFORE the updated Edge Function.
-- Private, exact-version model result cache. No article data or existing review is changed.
begin;
create table internal.article_assessment_cache (
 user_id uuid not null references auth.users(id) on delete cascade,
 cache_key text not null,
 snapshot jsonb not null,
 policy text not null,
 token uuid not null,
 lease_until timestamptz not null,
 result jsonb,
 expires_at timestamptz,
 primary key(user_id,cache_key)
);
alter table internal.article_assessment_cache enable row level security;
revoke all on internal.article_assessment_cache from public,anon,authenticated;
create function public.claim_article_assessment(p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_policy text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; key text; entry internal.article_assessment_cache%rowtype; lease uuid:=gen_random_uuid();
begin
 if p_user_id is null or nullif(p_policy,'') is null or length(p_policy)>20000 then raise exception 'Invalid cache context'; end if;
 snap:=public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids);
 key:=md5(p_policy||snap::text);
 insert into internal.article_assessment_cache(user_id,cache_key,snapshot,policy,token,lease_until)
 values(p_user_id,key,snap,p_policy,lease,clock_timestamp()+interval '90 seconds') on conflict do nothing;
 select * into entry from internal.article_assessment_cache where user_id=p_user_id and cache_key=key for update;
 if entry.snapshot<>snap or entry.policy<>p_policy then raise exception 'Cache key collision'; end if;
 if entry.result is not null and entry.expires_at>clock_timestamp() then
  return jsonb_build_object('state','ready','result',entry.result);
 end if;
 if entry.token<>lease and entry.result is null and entry.lease_until>clock_timestamp() then
  return jsonb_build_object('state','pending');
 end if;
 update internal.article_assessment_cache set token=lease,lease_until=clock_timestamp()+interval '90 seconds',result=null,expires_at=null
 where user_id=p_user_id and cache_key=key;
 return jsonb_build_object('state','claimed','token',lease);
end $$;
create function public.complete_article_assessment(p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_policy text,p_token uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; key text;
begin
 snap:=public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids);
 key:=md5(p_policy||snap::text);
 if jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>32000 then raise exception 'Invalid result'; end if;
 update internal.article_assessment_cache set result=p_result,expires_at=clock_timestamp()+interval '30 minutes'
 where user_id=p_user_id and cache_key=key and snapshot=snap and policy=p_policy and token=p_token
 and result is null and lease_until>clock_timestamp();
 if not found then raise exception 'Assessment lease expired'; end if;
end $$;
create function public.release_article_assessment(p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_policy text,p_token uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; key text;
begin
 snap:=public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids);
 key:=md5(p_policy||snap::text);
 update internal.article_assessment_cache set lease_until=clock_timestamp()
 where user_id=p_user_id and cache_key=key and snapshot=snap and policy=p_policy and token=p_token and result is null;
end $$;
create function public.issue_cached_article_review(p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_policy text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; key text; entry internal.article_assessment_cache%rowtype; output jsonb; score numeric; critical boolean; expiry timestamptz;
begin
 snap:=public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids);
 key:=md5(p_policy||snap::text);
 select * into entry from internal.article_assessment_cache where user_id=p_user_id and cache_key=key and snapshot=snap and policy=p_policy
 and result is not null and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Cached assessment expired; check again'; end if;
 score:=round((entry.result->>'evidenceCoverage')::numeric*.35+(entry.result->>'sourceReliability')::numeric*.25
 +(entry.result->>'crossSourceConsistency')::numeric*.2+(entry.result->>'recencyContext')::numeric*.1+(entry.result->>'internalConsistency')::numeric*.1);
 select exists(select 1 from jsonb_array_elements_text(entry.result->'criticalIssues') issue where btrim(issue)<>'') into critical;
 output:=public.issue_article_publish_review(p_user_id,p_title,p_content,p_category_ids,p_tag_ids,score,critical,
 (entry.result->'category_review'->>'category_id')::bigint,entry.result->'category_review'->>'reason');
 -- Reissuing a receipt must not extend the original assessment's 30-minute validity.
 update public.article_credibility_receipts set expires_at=least(expires_at,entry.expires_at)
 where id=(output->>'receipt_id')::uuid returning expires_at into expiry;
 return jsonb_set(output,'{expires_at}',to_jsonb(expiry));
end $$;
revoke all on function public.claim_article_assessment(uuid,text,text,bigint[],bigint[],text) from public,anon,authenticated;
grant execute on function public.claim_article_assessment(uuid,text,text,bigint[],bigint[],text) to service_role;
revoke all on function public.complete_article_assessment(uuid,text,text,bigint[],bigint[],text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_article_assessment(uuid,text,text,bigint[],bigint[],text,uuid,jsonb) to service_role;
revoke all on function public.release_article_assessment(uuid,text,text,bigint[],bigint[],text,uuid) from public,anon,authenticated;
grant execute on function public.release_article_assessment(uuid,text,text,bigint[],bigint[],text,uuid) to service_role;
revoke all on function public.issue_cached_article_review(uuid,text,text,bigint[],bigint[],text) from public,anon,authenticated;
grant execute on function public.issue_cached_article_review(uuid,text,text,bigint[],bigint[],text) to service_role;
commit;
