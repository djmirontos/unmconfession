-- =====================================================================
-- Module 8b: flagged words in nicknames.
--
-- keywords.applies_to gains a fourth scope, 'nickname'. Only keywords
-- with that scope are used for nicknames, so the post and listing lists
-- never block a name by accident. A nickname is refused with
-- 'nickname_flagged' at sign-up, in set_nickname and in change_nickname
-- (all go through _validate_nickname). The error never says which word
-- matched, so the list cannot be probed one word at a time from the
-- message. Staff can still set any name with admin_set_nickname.
--
-- Matching, per keyword match_type:
--   contains  the name with '_' and '.' removed contains the term
--             ("f.u.c.k", "xx_fuck_xx")
--   word      one part of the name, split on '_' and '.', equals the term
--             ("ass_king" yes, "class" no)
--   regex     the lower-case name matches the pattern
-- Both sides read the digits 0 1 3 4 5 7 as o i e a s t ("sh1t").
-- A broken regex is skipped instead of blocking every sign-up.
-- =====================================================================

alter table public.keywords drop constraint keywords_applies_to_check;
alter table public.keywords add constraint keywords_applies_to_check
  check (applies_to <@ array['post', 'comment', 'listing', 'nickname']::text[]
         and cardinality(applies_to) > 0);

create function public._nickname_flagged(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  low      text := lower(coalesce(p, ''));
  leet     text := translate(lower(coalesce(p, '')), '013457', 'oieast');
  squashed text := regexp_replace(translate(lower(coalesce(p, '')), '013457', 'oieast'), '[_.]', '', 'g');
  k        record;
  term_l   text;
begin
  for k in
    select term, match_type from public.keywords
    where active and 'nickname' = any (applies_to)
  loop
    term_l := translate(lower(k.term), '013457', 'oieast');
    begin
      if k.match_type = 'contains' then
        term_l := regexp_replace(term_l, '[_. ]', '', 'g');
        if term_l <> '' and strpos(squashed, term_l) > 0 then return k.term; end if;
      elsif k.match_type = 'word' then
        if exists (select 1 from regexp_split_to_table(leet, '[_.]+') t where t = term_l) then
          return k.term;
        end if;
      elsif k.match_type = 'regex' then
        if low ~* k.term then return k.term; end if;
      end if;
    exception when others then
      null;  -- an invalid pattern must not block everyone
    end;
  end loop;
  return null;
end $$;

revoke execute on function public._nickname_flagged(text) from public, anon, authenticated;

create or replace function public._validate_nickname(p text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p is null or p !~ '^[A-Za-z0-9_.]{3,20}$' then
    raise exception 'nickname_invalid';
  end if;
  if lower(p) ~ '^(admin|administrator|moderator|mod|staff|official|support|system|anonymous|anon|unm)[_.]?[0-9]*$' then
    raise exception 'nickname_reserved';
  end if;
  if public._nickname_flagged(p) is not null then
    raise exception 'nickname_flagged';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(p)) then
    raise exception 'nickname_taken';
  end if;
end $$;

-- Starter list of strong terms (English and Filipino). Short or common
-- words are left out on purpose, to avoid refusing real names; staff can
-- add or remove terms in the web panel. (Note for the panel: keywords has a
-- unique index on (lower(term), match_type), so a term that already exists
-- must get its scope added instead of a second row.)
insert into public.keywords (term, match_type, applies_to, category) values
  ('fuck',     'contains', array['nickname'], 'abuse'),
  ('bitch',    'contains', array['nickname'], 'abuse'),
  ('whore',    'contains', array['nickname'], 'abuse'),
  ('slut',     'contains', array['nickname'], 'abuse'),
  ('nigger',   'contains', array['nickname'], 'abuse'),
  ('nigga',    'contains', array['nickname'], 'abuse'),
  ('faggot',   'contains', array['nickname'], 'abuse'),
  ('hitler',   'contains', array['nickname'], 'abuse'),
  ('putang',   'contains', array['nickname'], 'abuse'),
  ('tangina',  'contains', array['nickname'], 'abuse'),
  ('kantot',   'contains', array['nickname'], 'abuse'),
  ('pekpek',   'contains', array['nickname'], 'abuse'),
  -- These two sit inside real names (Yoshitaka, Mashitah, Scunthorpe), so
  -- they only count at the start of a name or after '_' or '.'.
  ('(^|[_.])sh[i1]t', 'regex', array['nickname'], 'abuse'),
  ('(^|[_.])cunt',    'regex', array['nickname'], 'abuse');
