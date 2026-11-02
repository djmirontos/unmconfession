-- =====================================================================
-- v1.0.3 - Q&A answer upvotes (step B)
--
-- A member can upvote a top-level answer on a Q&A post. Upvote only, no downvote.
--   * comment_upvotes (comment_id, user_id): one row per member per answer. Members cannot
--     write it directly; they only read their own rows (so my_upvote works in the view).
--   * comments.upvote_count: kept by a trigger. The order of answers is NOT changed: the app
--     still lists answers by time, the number is only displayed.
--   * set_answer_upvote(comment, on): the only way to add or remove an upvote. Allowed only when
--     the comment is a published TOP-LEVEL comment on a published post of type 'qa', the caller is
--     an active member, is not the author, and the author has not blocked the caller (and the
--     caller has not blocked the author). Replies and comments elsewhere cannot be upvoted.
--   * thread_comments gains upvote_count and my_upvote, appended last.
-- Comment reactions are untouched. Old builds ignore the new columns.
-- Like reactions today, upvotes stay when the voter deletes their account (only the account
-- details are erased), so other answers' numbers do not change.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table and counter
-- ---------------------------------------------------------------------
alter table public.comments add column upvote_count int not null default 0;

create table public.comment_upvotes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_upvotes_user_idx on public.comment_upvotes (user_id);
alter table public.comment_upvotes enable row level security;
create policy comment_upvotes_own on public.comment_upvotes for select to anon, authenticated
  using (user_id = (select auth.uid()));
-- Nobody writes this table directly (only set_answer_upvote does); revoke whatever the project's
-- default privileges hand out, then allow reads. The thread view reads it as the caller (guests
-- included); RLS shows only their own rows.
revoke all on public.comment_upvotes from public, anon, authenticated;
grant select on public.comment_upvotes to anon, authenticated;

create function public.comment_upvotes_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set upvote_count = upvote_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments set upvote_count = greatest(upvote_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;
create trigger comment_upvotes_after_write after insert or delete on public.comment_upvotes
  for each row execute function public.comment_upvotes_after_write();

-- Trigger helpers are not API endpoints (same rule as 20261030180000_launch_hardening.sql).
-- posts_lock_type() comes from 20261103100000_qa_posts.sql and gets the same treatment here.
revoke all on function public.comment_upvotes_after_write() from public, anon, authenticated;
revoke all on function public.posts_lock_type()             from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Thread view: identical to 20261025120000_comment_replies.sql plus two columns at the end
-- ---------------------------------------------------------------------
create or replace view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at,
       c.edited_at,
       c.reaction_count,
       (select r.type from public.comment_reactions r
          where r.comment_id = c.id and r.user_id = (select auth.uid())) as my_reaction,
       array(select e.key from jsonb_each_text(c.reaction_breakdown) e
              order by e.value::int desc,
                       array_position(array['like','love','haha','wow','sad','angry'], e.key)
              limit 3) as top_reactions,
       c.parent_id,
       c.reply_to_id,
       c.reply_count,
       c.upvote_count,
       exists (select 1 from public.comment_upvotes u
                where u.comment_id = c.id and u.user_id = (select auth.uid())) as my_upvote
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published'
  and not exists (select 1 from public.user_blocks b
                   where b.blocker_id = (select auth.uid()) and b.blocked_id = c.author_id);

-- ---------------------------------------------------------------------
-- 3. Upvote / remove upvote. Returns the answer's new upvote count.
-- ---------------------------------------------------------------------
create function public.set_answer_upvote(p_comment_id uuid, p_on boolean) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := public.assert_active_member();
  c_auth uuid;
  n      int;
begin
  select c.author_id into c_auth
    from public.comments c
    join public.posts p on p.id = c.post_id
   where c.id = p_comment_id
     and c.status = 'published'
     and c.parent_id is null
     and p.status = 'published'
     and p.post_type = 'qa';
  if not found then raise exception 'not_found'; end if;
  if c_auth = uid then raise exception 'own_answer'; end if;
  if exists (select 1 from public.user_blocks b
              where (b.blocker_id = c_auth and b.blocked_id = uid)
                 or (b.blocker_id = uid and b.blocked_id = c_auth)) then
    raise exception 'not_found';
  end if;

  if coalesce(p_on, false) then
    insert into public.comment_upvotes (comment_id, user_id) values (p_comment_id, uid)
    on conflict do nothing;
  else
    delete from public.comment_upvotes where comment_id = p_comment_id and user_id = uid;
  end if;

  select upvote_count into n from public.comments where id = p_comment_id;
  return n;
end $$;

revoke all on function public.set_answer_upvote(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_answer_upvote(uuid, boolean) to authenticated;
