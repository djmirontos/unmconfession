-- Module 12d: optional profile details (college, course, year, hobbies, about me).
--
-- Rules:
--  * Every field is optional and free text (year level is a short fixed list).
--  * Hidden by default: nothing is shown until the member turns on show_details.
--  * Only signed-in members can read another member's details (guests never).
--  * Text must not contain links, phone numbers, '@', or contact-app names, and
--    must not hit the 'profile' keyword scope. The error never says which word matched.
--  * Staff can clear a member's details (logged). Details disappear with the account.
--  * Rows are reached only through the functions below (no table access for the API roles).

-- ---------------------------------------------------------------------
-- 1. Keyword scope 'profile'. Existing post and nickname keywords also apply to profile text.
-- ---------------------------------------------------------------------
alter table public.keywords drop constraint keywords_applies_to_check;
alter table public.keywords add constraint keywords_applies_to_check
  check (applies_to <@ array['post', 'comment', 'listing', 'nickname', 'profile']::text[]
         and cardinality(applies_to) > 0);

update public.keywords
   set applies_to = applies_to || array['profile']::text[]
 where not ('profile' = any (applies_to))
   and ('post' = any (applies_to) or 'nickname' = any (applies_to));

-- ---------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------
create table public.profile_details (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  show_details boolean not null default false,
  college      text check (college is null or char_length(college) between 1 and 60),
  course       text check (course is null or char_length(course) between 1 and 80),
  year_level   text check (year_level is null or year_level in
                 ('1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduate', 'Alumni')),
  hobbies      text check (hobbies is null or char_length(hobbies) between 1 and 100),
  about        text check (about is null or char_length(about) between 1 and 150),
  updated_at   timestamptz not null default now()
);
alter table public.profile_details enable row level security;
revoke all on public.profile_details from public, anon, authenticated;

-- A deleted account keeps a locked profile row, so the details are removed explicitly.
create function public.profile_details_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profile_details where user_id = new.user_id;
  return new;
end $$;
revoke execute on function public.profile_details_purge() from public, anon, authenticated;

create trigger profile_details_purge after update of deleted_at on public.user_flags
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.profile_details_purge();

-- ---------------------------------------------------------------------
-- 3. Text checks
-- ---------------------------------------------------------------------
-- True when the text has a link, '@', 9+ digits or a contact-app name.
create function public._profile_text_contact(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p like '%@%'
      or p ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ph|io|me|ly|gg|tv|co|app|link|xyz|edu|info|site|online)\M)'
      or p ~ '(\d[\s().-]*){9,}'
      or p ~* '\m(instagram|facebook|messenger|telegram|viber|whatsapp|tiktok|snapchat|discord|twitter|gcash)\M';
$$;
revoke execute on function public._profile_text_contact(text) from public, anon, authenticated;

-- Returns the matched keyword or null. Same matching rules as posts, plus 0/1/3/4/5/7 read as o/i/e/a/s/t.
create function public._profile_text_flagged(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  low    text := lower(coalesce(p, ''));
  leet   text := translate(lower(coalesce(p, '')), '013457', 'oieast');
  k      record;
  term_l text;
begin
  for k in
    select term, match_type from public.keywords
    where active and 'profile' = any (applies_to)
  loop
    term_l := translate(lower(k.term), '013457', 'oieast');
    begin
      if k.match_type = 'contains' then
        if strpos(low, lower(k.term)) > 0 or strpos(leet, term_l) > 0 then return k.term; end if;
      elsif k.match_type = 'word' then
        if low  ~* ('\m' || public._re_escape(k.term) || '\M')
        or leet ~* ('\m' || public._re_escape(term_l) || '\M') then return k.term; end if;
      elsif k.match_type = 'regex' then
        if p ~* k.term then return k.term; end if;
      end if;
    exception when others then
      null;  -- an invalid pattern must not block everyone
    end;
  end loop;
  return null;
end $$;
revoke execute on function public._profile_text_flagged(text) from public, anon, authenticated;

-- Trim, collapse spaces, empty -> null; no control characters; length is checked by the caller.
create function public._profile_clean(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text := nullif(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '');
begin
  if t is not null and t ~ '[\x00-\x1f\x7f]' then raise exception 'details_invalid'; end if;
  return t;
end $$;
revoke execute on function public._profile_clean(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Member functions
-- ---------------------------------------------------------------------
create function public.set_my_profile_details(
  p_show boolean, p_college text, p_course text, p_year_level text, p_hobbies text, p_about text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := public.assert_active_member();
  col  text := public._profile_clean(p_college);
  crs  text := public._profile_clean(p_course);
  yr   text := public._profile_clean(p_year_level);
  hob  text := public._profile_clean(p_hobbies);
  abt  text := public._profile_clean(p_about);
  alltext text;
begin
  if p_show is null then raise exception 'details_invalid'; end if;
  if char_length(coalesce(col, '')) > 60 or char_length(coalesce(crs, '')) > 80
     or char_length(coalesce(hob, '')) > 100 or char_length(coalesce(abt, '')) > 150 then
    raise exception 'details_invalid';
  end if;
  if yr is not null and yr not in ('1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduate', 'Alumni') then
    raise exception 'details_invalid';
  end if;

  alltext := concat_ws(' | ', col, crs, hob, abt);
  if alltext <> '' then
    if public._profile_text_contact(alltext) then raise exception 'details_contact'; end if;
    if public._profile_text_flagged(alltext) is not null then raise exception 'details_flagged'; end if;
  end if;

  insert into public.profile_details (user_id, show_details, college, course, year_level, hobbies, about, updated_at)
  values (uid, p_show, col, crs, yr, hob, abt, now())
  on conflict (user_id) do update
    set show_details = excluded.show_details, college = excluded.college, course = excluded.course,
        year_level = excluded.year_level, hobbies = excluded.hobbies, about = excluded.about,
        updated_at = now();
end $$;

-- My own details, shown or not.
create function public.get_my_profile_details()
returns table (show_details boolean, college text, course text, year_level text, hobbies text, about text)
language sql stable security definer set search_path = '' as $$
  select d.show_details, d.college, d.course, d.year_level, d.hobbies, d.about
    from public.profile_details d
   where d.user_id = (select auth.uid());
$$;

-- Someone else's details: signed-in members only; only when they chose to show them;
-- nothing for a banned or deleted account, or for a member I blocked.
create function public.get_profile_details(p_user uuid)
returns table (college text, course text, year_level text, hobbies text, about text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return query
  select d.college, d.course, d.year_level, d.hobbies, d.about
    from public.profile_details d
    join public.user_flags f on f.user_id = d.user_id
   where d.user_id = p_user
     and d.show_details
     and f.status <> 'banned' and f.deleted_at is null
     and not exists (select 1 from public.user_blocks b where b.blocker_id = uid and b.blocked_id = p_user);
end $$;

revoke all on function public.set_my_profile_details(boolean, text, text, text, text, text) from public, anon;
revoke all on function public.get_my_profile_details() from public, anon;
revoke all on function public.get_profile_details(uuid) from public, anon;
grant execute on function public.set_my_profile_details(boolean, text, text, text, text, text) to authenticated;
grant execute on function public.get_my_profile_details() to authenticated;
grant execute on function public.get_profile_details(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Staff: clear a member's details
-- ---------------------------------------------------------------------
alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('approve', 'reject', 'remove', 'restore', 'edit', 'suspend', 'ban', 'restore_user',
                    'remove_avatar', 'clear_details'));

create function public.mod_clear_profile_details(p_user uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  f     public.user_flags;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into f from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if f.deleted_at is not null then raise exception 'account_deleted'; end if;
  if f.role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profile_details d
     where d.user_id = p_user
       and (d.college is not null or d.course is not null or d.year_level is not null
            or d.hobbies is not null or d.about is not null)
  ) then raise exception 'no_details'; end if;

  update public.profile_details
     set college = null, course = null, year_level = null, hobbies = null, about = null, updated_at = now()
   where user_id = p_user;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code)
  values (actor, 'user', p_user, 'clear_details', nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

revoke all on function public.mod_clear_profile_details(uuid, text) from public, anon;
grant execute on function public.mod_clear_profile_details(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Reports: a profile row now carries the member's details as its body
--    (moderators see them even when the member keeps them hidden).
--    Same columns as before, so CREATE OR REPLACE keeps the grants.
-- ---------------------------------------------------------------------
create or replace function public.mod_get_reports(
  p_limit int default 50, p_after_ts timestamptz default null, p_after_id uuid default null
) returns table (
  target_type public.content_type, target_id uuid, report_count int, reasons text[],
  first_reported_at timestamptz, last_reported_at timestamptz,
  content_status public.content_status, title text, body text, images jsonb,
  author_id uuid, nickname text, avatar_key text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select g.target_type, g.target_id, g.cnt, g.reasons, g.first_at, g.last_at,
         c.status, c.title, c.body, c.images, c.author_id, pr.nickname, pr.avatar_key
  from (
    select r.target_type, r.target_id, count(*)::int as cnt,
           array_agg(distinct r.reason order by r.reason) as reasons,
           min(r.created_at) as first_at, max(r.created_at) as last_at
    from public.reports r
    where r.status = 'open'
    group by r.target_type, r.target_id
  ) g
  left join lateral (
    select p.status, p.kind::text as title, p.body, p.images, p.author_id
      from public.posts p where g.target_type = 'post' and p.id = g.target_id
    union all
    select c2.status, null::text, c2.body, '[]'::jsonb, c2.author_id
      from public.comments c2 where g.target_type = 'comment' and c2.id = g.target_id
    union all
    select l.status, l.title, l.description, l.images, l.author_id
      from public.listings l where g.target_type = 'listing' and l.id = g.target_id
    union all
    select case when f.deleted_at is null then 'published'::public.content_status
                else 'removed'::public.content_status end,
           'profile'::text,
           nullif(concat_ws(E'\n',
             case when d.college    is not null then 'College: '    || d.college    end,
             case when d.course     is not null then 'Course: '     || d.course     end,
             case when d.year_level is not null then 'Year: '       || d.year_level end,
             case when d.hobbies    is not null then 'Hobbies: '    || d.hobbies    end,
             case when d.about      is not null then 'About me: '   || d.about      end), ''),
           '[]'::jsonb, pr2.id
      from public.profiles pr2
      join public.user_flags f on f.user_id = pr2.id
      left join public.profile_details d on d.user_id = pr2.id
     where g.target_type = 'profile' and pr2.id = g.target_id
  ) c on true
  left join public.profiles pr on pr.id = c.author_id
  where p_after_ts is null
     or (g.first_at, g.target_id) > (p_after_ts, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by g.first_at, g.target_id
  limit least(greatest(p_limit, 1), 100);
end $$;
