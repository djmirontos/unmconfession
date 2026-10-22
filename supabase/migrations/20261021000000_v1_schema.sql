-- =====================================================================
-- UNM Freedom Confessions - V1 schema
-- Supabase (Postgres 15+). Run as the migration owner (postgres).
--
-- Design rules
--   * Clients READ through RLS and WRITE through RPC functions only.
--     Direct INSERT/UPDATE/DELETE is revoked on content tables, so the
--     keyword hold, rate limits and moderation mode cannot be bypassed.
--   * Email lives only in auth.users. The public API never returns it.
--     Admins see it through admin_view_identity(), which is audit-logged.
--   * Nickname is public (shown on posts and comments) and locked once set.
--   * All SECURITY DEFINER functions use search_path = '' and qualified names.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.app_role       as enum ('user', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.content_status as enum ('published', 'pending', 'rejected', 'removed');
create type public.post_kind      as enum ('confession', 'shoutout', 'poll');
create type public.listing_kind   as enum ('sell', 'lost_found');
create type public.reaction_type  as enum ('like', 'love', 'haha', 'wow', 'sad', 'angry');
create type public.content_type   as enum ('post', 'comment', 'listing');

-- ---------------------------------------------------------------------
-- Users: profiles (public) and flags (role/status, private)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text,
  avatar_key  text not null default 'avatar_01',
  created_at  timestamptz not null default now(),
  constraint profiles_nickname_format check (nickname is null or nickname ~ '^[A-Za-z0-9_.]{3,20}$'),
  constraint profiles_avatar_format   check (avatar_key ~ '^[a-z0-9_]{1,40}$')
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));

create table public.user_flags (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  role             public.app_role not null default 'user',
  status           public.account_status not null default 'active',
  suspended_until  timestamptz,
  status_reason    text,
  updated_at       timestamptz not null default now()
);

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_flags f
    where f.user_id = (select auth.uid())
      and f.role in ('moderator', 'admin')
      and f.status = 'active'
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_flags f
    where f.user_id = (select auth.uid())
      and f.role = 'admin'
      and f.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------
-- App settings (single row): branding, moderation mode, retention
-- ---------------------------------------------------------------------
create table public.app_settings (
  id                      smallint primary key default 1 check (id = 1),
  app_name                text not null default 'UNM Freedom Confessions' check (char_length(app_name) between 1 and 60),
  tagline                 text not null default '' check (char_length(tagline) <= 120),
  logo_path               text,
  moderation_mode         text not null default 'post' check (moderation_mode in ('post', 'pre')),
  audit_retention_days    int  not null default 30 check (audit_retention_days between 1 and 3650),
  rejected_retention_days int  not null default 30 check (rejected_retention_days between 1 and 3650),
  updated_by              uuid references public.profiles (id) on delete set null,
  updated_at              timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

create function public.app_settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Staff may edit branding. Mode and retention are admin-only.
  -- auth.uid() is null for dashboard/service-role changes, which are allowed.
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.moderation_mode is distinct from old.moderation_mode
       or new.audit_retention_days is distinct from old.audit_retention_days
       or new.rejected_retention_days is distinct from old.rejected_retention_days then
      raise exception 'admin_only' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger app_settings_guard before update on public.app_settings
  for each row execute function public.app_settings_guard();

-- ---------------------------------------------------------------------
-- Keyword filter (managed by staff, preset below)
-- ---------------------------------------------------------------------
create table public.keywords (
  id          uuid primary key default gen_random_uuid(),
  term        text not null check (char_length(term) between 1 and 200),
  match_type  text not null default 'word' check (match_type in ('word', 'contains', 'regex')),
  applies_to  text[] not null default '{post,comment,listing}'
              check (applies_to <@ array['post', 'comment', 'listing']::text[] and cardinality(applies_to) > 0),
  category    text not null default 'other' check (category in ('abuse', 'doxxing', 'prohibited_item', 'spam', 'other')),
  active      boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index keywords_term_key on public.keywords (lower(term), match_type);

create function public.keywords_validate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.match_type = 'regex' then
    begin
      perform '' ~* new.term;
    exception when others then
      raise exception 'invalid_regex';
    end;
  end if;
  return new;
end $$;
create trigger keywords_validate before insert or update on public.keywords
  for each row execute function public.keywords_validate();

-- Starter list. The team should review and extend it (abuse words are
-- intentionally not seeded; add the ones your community needs).
insert into public.keywords (term, match_type, applies_to, category) values
  ('(\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}', 'regex',    '{post,comment}', 'doxxing'),
  ('facebook.com/',                            'contains', '{post,comment}', 'doxxing'),
  ('fb.com/',                                  'contains', '{post,comment}', 'doxxing'),
  ('alak',       'word', '{listing}', 'prohibited_item'),
  ('alcohol',    'word', '{listing}', 'prohibited_item'),
  ('beer',       'word', '{listing}', 'prohibited_item'),
  ('sigarilyo',  'word', '{listing}', 'prohibited_item'),
  ('cigarette',  'word', '{listing}', 'prohibited_item'),
  ('yosi',       'word', '{listing}', 'prohibited_item'),
  ('vape',       'word', '{listing}', 'prohibited_item'),
  ('gamot',      'word', '{listing}', 'prohibited_item'),
  ('medicine',   'word', '{listing}', 'prohibited_item'),
  ('shabu',      'word', '{listing}', 'prohibited_item'),
  ('marijuana',  'word', '{listing}', 'prohibited_item'),
  ('baril',      'word', '{listing}', 'prohibited_item'),
  ('gun',        'word', '{listing}', 'prohibited_item');

-- ---------------------------------------------------------------------
-- Content: posts (confession / shoutout / poll)
-- ---------------------------------------------------------------------
create sequence public.post_number_seq;

create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  number         bigint unique,
  kind           public.post_kind not null,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body           text not null check (char_length(btrim(body)) between 1 and 2000),
  target_name    text check (target_name is null or char_length(btrim(target_name)) between 1 and 80),
  images         jsonb not null default '[]'::jsonb,
  ends_at        timestamptz,
  status         public.content_status not null,
  reject_reason  text,
  moderated_by   uuid references public.profiles (id) on delete set null,
  moderated_at   timestamptz,
  reaction_count int not null default 0,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint posts_images_max2   check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 2),
  constraint posts_shoutout_tgt  check ((kind = 'shoutout') = (target_name is not null)),
  constraint posts_poll_end      check ((kind = 'poll') = (ends_at is not null)),
  constraint posts_published_ts  check (status <> 'published' or published_at is not null)
);
create index posts_feed_idx    on public.posts (published_at desc, id desc) where status = 'published';
create index posts_author_idx  on public.posts (author_id, created_at desc);
create index posts_pending_idx on public.posts (created_at) where status = 'pending';

create table public.poll_options (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 80),
  position    smallint not null,
  vote_count  int not null default 0,
  unique (post_id, position),
  unique (id, post_id)
);

create table public.poll_votes (
  post_id    uuid not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  option_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  foreign key (option_id, post_id) references public.poll_options (id, post_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Content: Buy & Sell and Lost & Found listings
-- ---------------------------------------------------------------------
create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  kind           public.listing_kind not null,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 100),
  description    text check (description is null or char_length(description) <= 2000),
  price          numeric(10, 2) check (price is null or price >= 0),
  condition      text check (condition is null or condition in ('new', 'like_new', 'good', 'fair', 'poor')),
  location       text check (location is null or char_length(location) <= 100),
  event_date     date,
  images         jsonb not null default '[]'::jsonb,
  is_closed      boolean not null default false,   -- sold (sell) or resolved (lost_found)
  status         public.content_status not null,
  reject_reason  text,
  moderated_by   uuid references public.profiles (id) on delete set null,
  moderated_at   timestamptz,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint listings_images_max2  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 2),
  constraint listings_sell_price   check (kind <> 'sell' or price is not null),
  constraint listings_lf_fields    check (kind <> 'lost_found' or (location is not null and event_date is not null)),
  constraint listings_published_ts check (status <> 'published' or published_at is not null)
);
create index listings_feed_idx   on public.listings (kind, published_at desc, id desc) where status = 'published';
create index listings_author_idx on public.listings (author_id, created_at desc);
create index listings_pending_idx on public.listings (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- Comments (on posts or listings), reactions, blocks
-- ---------------------------------------------------------------------
create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid references public.posts (id) on delete cascade,
  listing_id     uuid references public.listings (id) on delete cascade,
  author_id      uuid not null references public.profiles (id) on delete cascade,
  body           text not null check (char_length(btrim(body)) between 1 and 1000),
  status         public.content_status not null,
  reject_reason  text,
  moderated_by   uuid references public.profiles (id) on delete set null,
  moderated_at   timestamptz,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint comments_one_target check (num_nonnulls(post_id, listing_id) = 1),
  constraint comments_published_ts check (status <> 'published' or published_at is not null)
);
create index comments_post_idx    on public.comments (post_id, published_at, id) where status = 'published';
create index comments_listing_idx on public.comments (listing_id, published_at, id) where status = 'published';
create index comments_author_idx  on public.comments (author_id, created_at desc);
create index comments_pending_idx on public.comments (created_at) where status = 'pending';

create table public.reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.reaction_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null default 'block' check (kind in ('block', 'mute')),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------
-- Moderation: holds, actions, reports, identity audit
-- ---------------------------------------------------------------------
create table public.moderation_holds (
  target_type   public.content_type not null,
  target_id     uuid not null,
  reason        text not null check (reason in ('keyword', 'pre_moderation')),
  matched_term  text,
  created_at    timestamptz not null default now(),
  primary key (target_type, target_id)
);

create table public.moderation_actions (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles (id) on delete set null,
  target_type   text not null check (target_type in ('post', 'comment', 'listing', 'user')),
  target_id     uuid not null,
  action        text not null check (action in ('approve', 'reject', 'remove', 'restore', 'edit', 'suspend', 'ban', 'restore_user')),
  reason_code   text,
  note          text,
  original_body text,
  created_at    timestamptz not null default now()
);
create index moderation_actions_created_idx on public.moderation_actions (created_at);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  public.content_type not null,
  target_id    uuid not null,
  reason       text not null check (reason in ('doxxing', 'bullying', 'spam', 'prohibited_item', 'inappropriate', 'other')),
  note         text check (note is null or char_length(note) <= 500),
  status       text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  handled_by   uuid references public.profiles (id) on delete set null,
  handled_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

create table public.identity_audit_log (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid references public.profiles (id) on delete set null,
  target_type      public.content_type not null,
  target_id        uuid not null,
  subject_user_id  uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index identity_audit_created_idx on public.identity_audit_log (created_at);

-- ---------------------------------------------------------------------
-- Notifications, announcements, trending cache, storage cleanup queue
-- ---------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('comment', 'reaction', 'content_approved', 'content_rejected', 'content_removed')),
  target_type  public.content_type,
  target_id    uuid,
  actor_id     uuid references public.profiles (id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
-- One reaction notification per (owner, post, reactor), so toggling cannot spam.
create unique index notifications_reaction_uniq on public.notifications (user_id, target_id, actor_id) where type = 'reaction';

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 100),
  body        text not null check (char_length(body) between 1 and 1000),
  created_by  uuid references public.profiles (id) on delete set null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.trending_scores (
  post_id     uuid primary key references public.posts (id) on delete cascade,
  score       double precision not null,
  computed_at timestamptz not null default now()
);

create table public.storage_cleanup_queue (
  id        bigint generated always as identity primary key,
  bucket    text not null,
  path      text not null,
  queued_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Signup: create profile + flags from auth.users metadata
-- ---------------------------------------------------------------------
create function public._validate_nickname(p text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p is null or p !~ '^[A-Za-z0-9_.]{3,20}$' then
    raise exception 'nickname_invalid';
  end if;
  if lower(p) ~ '^(admin|administrator|moderator|mod|staff|official|support|system|anonymous|anon|unm)[_.]?[0-9]*$' then
    raise exception 'nickname_reserved';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(p)) then
    raise exception 'nickname_taken';
  end if;
end $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nick text := nullif(btrim(new.raw_user_meta_data ->> 'nickname'), '');
begin
  if nick is not null then
    perform public._validate_nickname(nick);
  end if;
  insert into public.profiles (id, nickname) values (new.id, nick);
  insert into public.user_flags (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id <> old.id then raise exception 'immutable'; end if;
  if old.nickname is not null and new.nickname is distinct from old.nickname
     and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'nickname_locked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- Triggers: numbering/publish stamp, counters, notifications, cleanup
-- ---------------------------------------------------------------------
create function public.posts_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' then
    if new.published_at is null then new.published_at := now(); end if;
    if new.number is null and new.kind in ('confession', 'shoutout') then
      new.number := nextval('public.post_number_seq');
    end if;
  end if;
  return new;
end $$;
create trigger posts_stamp before insert or update on public.posts
  for each row execute function public.posts_stamp();

create function public.content_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger comments_stamp before insert or update on public.comments
  for each row execute function public.content_stamp();
create trigger listings_stamp before insert or update on public.listings
  for each row execute function public.content_stamp();

create function public.comments_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r        public.comments;
  was_pub  boolean := false;
  is_pub   boolean := false;
  delta    int;
  owner    uuid;
begin
  if tg_op = 'DELETE' then r := old; was_pub := (old.status = 'published');
  elsif tg_op = 'INSERT' then r := new; is_pub := (new.status = 'published');
  else r := new; was_pub := (old.status = 'published'); is_pub := (new.status = 'published');
  end if;

  if was_pub = is_pub then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  delta := case when is_pub then 1 else -1 end;

  if r.post_id is not null then
    update public.posts set comment_count = greatest(comment_count + delta, 0) where id = r.post_id
    returning author_id into owner;
  else
    update public.listings set comment_count = greatest(comment_count + delta, 0) where id = r.listing_id
    returning author_id into owner;
  end if;

  if is_pub and owner is not null and owner <> r.author_id then
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    values (owner, 'comment',
            case when r.post_id is not null then 'post'::public.content_type else 'listing'::public.content_type end,
            coalesce(r.post_id, r.listing_id), r.author_id);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
create trigger comments_after_write after insert or update of status or delete on public.comments
  for each row execute function public.comments_after_write();

create function public.reactions_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger reactions_after_write after insert or delete on public.reactions
  for each row execute function public.reactions_after_write();

create function public.poll_votes_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.poll_options set vote_count = vote_count + 1 where id = new.option_id;
  elsif tg_op = 'DELETE' then
    update public.poll_options set vote_count = greatest(vote_count - 1, 0) where id = old.option_id;
  end if;
  return null;
end $$;
create trigger poll_votes_after_write after insert or delete on public.poll_votes
  for each row execute function public.poll_votes_after_write();

create function public.queue_storage_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare el jsonb;
begin
  for el in select * from jsonb_array_elements(old.images) loop
    insert into public.storage_cleanup_queue (bucket, path) values ('post-images', el ->> 'path');
  end loop;
  return old;
end $$;
create trigger posts_cleanup    before delete on public.posts    for each row execute function public.queue_storage_cleanup();
create trigger listings_cleanup before delete on public.listings for each row execute function public.queue_storage_cleanup();

-- ---------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------
create function public.assert_active_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f   public.user_flags;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into f from public.user_flags where user_id = uid;
  if not found then raise exception 'no_profile'; end if;
  if f.status = 'banned' then raise exception 'banned' using errcode = '42501'; end if;
  if f.status = 'suspended' and (f.suspended_until is null or f.suspended_until > now()) then
    raise exception 'suspended' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid and nickname is not null) then
    raise exception 'nickname_required';
  end if;
  return uid;
end $$;

create function public._re_escape(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p, '([\\.^$|()\[\]{}*+?\-])', '\\\1', 'g');
$$;

-- Decide whether new content is published or held.
-- Staff bypass. A keyword hit always holds. Otherwise follows moderation_mode.
create function public._moderation_decision(p_type public.content_type, p_text text)
returns table (out_status public.content_status, out_reason text, out_term text)
language plpgsql stable security definer set search_path = '' as $$
declare
  mode text;
  k    record;
begin
  if public.is_staff() then
    out_status := 'published'; out_reason := null; out_term := null;
    return next; return;
  end if;

  for k in
    select term, match_type from public.keywords
    where active and p_type::text = any (applies_to)
  loop
    if (k.match_type = 'word'     and p_text ~* ('\m' || public._re_escape(k.term) || '\M'))
    or (k.match_type = 'contains' and strpos(lower(p_text), lower(k.term)) > 0)
    or (k.match_type = 'regex'    and p_text ~* k.term) then
      out_status := 'pending'; out_reason := 'keyword'; out_term := k.term;
      return next; return;
    end if;
  end loop;

  select moderation_mode into mode from public.app_settings where id = 1;
  if mode = 'pre' then
    out_status := 'pending'; out_reason := 'pre_moderation'; out_term := null;
  else
    out_status := 'published'; out_reason := null; out_term := null;
  end if;
  return next;
end $$;

-- Validates and rebuilds the images array. Paths must be <uid>/<file>.
create function public._check_images(p_images jsonb, p_uid uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  el  jsonb;
  out jsonb := '[]'::jsonb;
begin
  if p_images is null or jsonb_typeof(p_images) <> 'array' then raise exception 'invalid_images'; end if;
  if jsonb_array_length(p_images) > 2 then raise exception 'too_many_images'; end if;
  for el in select * from jsonb_array_elements(p_images) loop
    if jsonb_typeof(el) <> 'object'
       or coalesce(el ->> 'path', '')   !~ ('^' || p_uid::text || '/[A-Za-z0-9._-]{1,120}$')
       or coalesce(el ->> 'width', '')  !~ '^[0-9]{1,5}$'
       or coalesce(el ->> 'height', '') !~ '^[0-9]{1,5}$'
       or (el ->> 'width')::int < 1 or (el ->> 'height')::int < 1
       or char_length(coalesce(el ->> 'blurhash', '')) > 100 then
      raise exception 'invalid_images';
    end if;
    out := out || jsonb_build_array(jsonb_build_object(
      'path', el ->> 'path',
      'width', (el ->> 'width')::int,
      'height', (el ->> 'height')::int,
      'blurhash', el ->> 'blurhash'));
  end loop;
  return out;
end $$;

-- ---------------------------------------------------------------------
-- Member RPCs (the only way clients write)
-- ---------------------------------------------------------------------
create function public.set_nickname(p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  p_nickname := btrim(p_nickname);
  if exists (select 1 from public.profiles where id = uid and nickname is not null) then
    raise exception 'nickname_locked' using errcode = '42501';
  end if;
  perform public._validate_nickname(p_nickname);
  update public.profiles set nickname = p_nickname where id = uid;
end $$;

create function public.create_post(
  p_kind          public.post_kind,
  p_body          text,
  p_target_name   text default null,
  p_images        jsonb default '[]'::jsonb,
  p_poll_options  text[] default null,
  p_ends_at       timestamptz default null
) returns public.posts
language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := public.assert_active_member();
  d     record;
  p     public.posts;
  opts  text[];
  imgs  jsonb;
  txt   text;
begin
  p_body := btrim(coalesce(p_body, ''));
  p_target_name := nullif(btrim(coalesce(p_target_name, '')), '');
  if char_length(p_body) < 1 or char_length(p_body) > 2000 then raise exception 'invalid_body'; end if;

  imgs := public._check_images(coalesce(p_images, '[]'::jsonb), uid);

  if p_kind = 'poll' then
    if char_length(p_body) < 3 or char_length(p_body) > 280 then raise exception 'invalid_body'; end if;
    if jsonb_array_length(imgs) > 0 then raise exception 'invalid_images'; end if;
    if p_target_name is not null then raise exception 'invalid_target'; end if;
    if coalesce(array_length(p_poll_options, 1), 0) not between 2 and 6 then raise exception 'invalid_poll_options'; end if;
    select array_agg(btrim(u.o) order by u.ord) into opts from unnest(p_poll_options) with ordinality as u (o, ord);
    if exists (select 1 from unnest(opts) x where char_length(x) not between 1 and 80)
       or (select count(distinct lower(x)) from unnest(opts) x) <> array_length(opts, 1) then
      raise exception 'invalid_poll_options';
    end if;
    if p_ends_at is null or p_ends_at < now() + interval '5 minutes' or p_ends_at > now() + interval '30 days' then
      raise exception 'invalid_poll_end';
    end if;
  else
    if p_poll_options is not null or p_ends_at is not null then raise exception 'invalid_poll_options'; end if;
    if p_kind = 'shoutout' and p_target_name is null then raise exception 'target_required'; end if;
    if p_kind = 'confession' and p_target_name is not null then raise exception 'invalid_target'; end if;
  end if;

  if (select count(*) from public.posts where author_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  txt := p_body || ' ' || coalesce(p_target_name, '') || ' ' || coalesce(array_to_string(opts, ' '), '');
  select * into d from public._moderation_decision('post', txt);

  insert into public.posts (kind, author_id, body, target_name, images, ends_at, status, published_at)
  values (p_kind, uid, p_body, p_target_name, imgs, case when p_kind = 'poll' then p_ends_at end,
          d.out_status, case when d.out_status = 'published' then now() end)
  returning * into p;

  if p_kind = 'poll' then
    insert into public.poll_options (post_id, label, position)
    select p.id, u.o, (u.ord - 1)::smallint from unnest(opts) with ordinality as u (o, ord);
  end if;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('post', p.id, d.out_reason, d.out_term);
  end if;
  return p;
end $$;

create function public.create_listing(
  p_kind         public.listing_kind,
  p_title        text,
  p_description  text default null,
  p_price        numeric default null,
  p_condition    text default null,
  p_location     text default null,
  p_event_date   date default null,
  p_images       jsonb default '[]'::jsonb
) returns public.listings
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := public.assert_active_member();
  d    record;
  l    public.listings;
  imgs jsonb;
begin
  p_title := btrim(coalesce(p_title, ''));
  p_description := nullif(btrim(coalesce(p_description, '')), '');
  p_location := nullif(btrim(coalesce(p_location, '')), '');
  if char_length(p_title) not between 1 and 100 then raise exception 'invalid_title'; end if;
  imgs := public._check_images(coalesce(p_images, '[]'::jsonb), uid);

  if p_kind = 'sell' then
    if p_price is null or p_price < 0 or p_price > 9999999 then raise exception 'invalid_price'; end if;
    if p_condition is null then raise exception 'condition_required'; end if;
    p_location := null; p_event_date := null;
  else
    if p_location is null or p_event_date is null or p_event_date > current_date then
      raise exception 'invalid_lost_found';
    end if;
    p_price := null; p_condition := null;
  end if;

  if (select count(*) from public.listings where author_id = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision(
    'listing', p_title || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_location, ''));

  insert into public.listings (kind, author_id, title, description, price, condition, location, event_date, images, status, published_at)
  values (p_kind, uid, p_title, p_description, p_price, p_condition, p_location, p_event_date, imgs,
          d.out_status, case when d.out_status = 'published' then now() end)
  returning * into l;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('listing', l.id, d.out_reason, d.out_term);
  end if;
  return l;
end $$;

create function public.set_listing_closed(p_listing_id uuid, p_closed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  update public.listings set is_closed = p_closed where id = p_listing_id and author_id = uid;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.create_comment(p_target_type public.content_type, p_target_id uuid, p_body text)
returns public.comments
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.assert_active_member();
  d   record;
  c   public.comments;
  ok  boolean;
begin
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;

  if p_target_type = 'post' then
    select exists (select 1 from public.posts where id = p_target_id and status = 'published') into ok;
  elsif p_target_type = 'listing' then
    select exists (select 1 from public.listings where id = p_target_id and status = 'published') into ok;
  else
    raise exception 'invalid_target';
  end if;
  if not ok then raise exception 'not_found'; end if;

  if (select count(*) from public.comments where author_id = uid and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited';
  end if;

  select * into d from public._moderation_decision('comment', p_body);

  insert into public.comments (post_id, listing_id, author_id, body, status, published_at)
  values (case when p_target_type = 'post' then p_target_id end,
          case when p_target_type = 'listing' then p_target_id end,
          uid, p_body, d.out_status, case when d.out_status = 'published' then now() end)
  returning * into c;

  if d.out_status = 'pending' then
    insert into public.moderation_holds (target_type, target_id, reason, matched_term)
    values ('comment', c.id, d.out_reason, d.out_term);
  end if;
  return c;
end $$;

-- p_type null removes the reaction.
create function public.set_reaction(p_post_id uuid, p_type public.reaction_type) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid       uuid := public.assert_active_member();
  owner     uuid;
  inserted  boolean;
begin
  if p_type is null then
    delete from public.reactions where post_id = p_post_id and user_id = uid;
    return;
  end if;

  select author_id into owner from public.posts where id = p_post_id and status = 'published';
  if not found then raise exception 'not_found'; end if;

  insert into public.reactions (post_id, user_id, type) values (p_post_id, uid, p_type)
  on conflict (post_id, user_id) do update set type = excluded.type, updated_at = now()
  returning (xmax = 0) into inserted;

  if inserted and owner <> uid then
    insert into public.notifications (user_id, type, target_type, target_id, actor_id)
    values (owner, 'reaction', 'post', p_post_id, uid)
    on conflict (user_id, target_id, actor_id) where type = 'reaction' do nothing;
  end if;
end $$;

create function public.vote_poll(p_post_id uuid, p_option_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.assert_active_member();
begin
  if not exists (
    select 1 from public.posts
    where id = p_post_id and kind = 'poll' and status = 'published' and ends_at > now()
  ) then
    raise exception 'poll_closed';
  end if;
  begin
    insert into public.poll_votes (post_id, user_id, option_id) values (p_post_id, uid, p_option_id);
  exception
    when unique_violation then raise exception 'already_voted';
    when foreign_key_violation then raise exception 'invalid_option';
  end;
end $$;

create function public.report_content(
  p_type public.content_type, p_id uuid, p_reason text, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  ok  boolean;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  ok := case p_type
    when 'post'    then exists (select 1 from public.posts    where id = p_id and status = 'published')
    when 'comment' then exists (select 1 from public.comments where id = p_id and status = 'published')
    else                exists (select 1 from public.listings where id = p_id and status = 'published')
  end;
  if not ok then raise exception 'not_found'; end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, note)
  values (uid, p_type, p_id, p_reason, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (reporter_id, target_type, target_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Read helpers (security invoker: RLS applies to the caller)
-- ---------------------------------------------------------------------
create view public.feed_posts with (security_invoker = true) as
select
  p.id, p.number, p.kind, p.body, p.target_name, p.images, p.ends_at,
  p.author_id, pr.nickname, pr.avatar_key,
  p.published_at, p.reaction_count, p.comment_count,
  (select r.type from public.reactions r
     where r.post_id = p.id and r.user_id = (select auth.uid())) as my_reaction,
  case when p.kind = 'poll' then
    (select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes', o.vote_count) order by o.position)
       from public.poll_options o where o.post_id = p.id)
  end as poll_options,
  case when p.kind = 'poll' then
    (select v.option_id from public.poll_votes v
       where v.post_id = p.id and v.user_id = (select auth.uid()))
  end as my_vote
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published';

create view public.feed_listings with (security_invoker = true) as
select
  l.id, l.kind, l.title, l.description, l.price, l.condition, l.location, l.event_date,
  l.images, l.is_closed, l.author_id, pr.nickname, pr.avatar_key, l.published_at, l.comment_count
from public.listings l
join public.profiles pr on pr.id = l.author_id
where l.status = 'published';

create view public.thread_comments with (security_invoker = true) as
select c.id, c.post_id, c.listing_id, c.body, c.author_id, pr.nickname, pr.avatar_key, c.published_at
from public.comments c
join public.profiles pr on pr.id = c.author_id
where c.status = 'published';

-- Keyset pagination: pass the last row's (published_at, id) as the cursor.
create function public.get_feed(p_before_ts timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_posts
language sql stable security invoker set search_path = '' as $$
  select * from public.feed_posts f
  where p_before_ts is null or (f.published_at, f.id) < (p_before_ts, p_before_id)
  order by f.published_at desc, f.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.get_trending(p_limit int default 20)
returns setof public.feed_posts
language sql stable security invoker set search_path = '' as $$
  select f.* from public.feed_posts f
  join public.trending_scores t on t.post_id = f.id
  order by t.score desc, f.id
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.get_active_polls(p_limit int default 10)
returns setof public.feed_posts
language sql stable security invoker set search_path = '' as $$
  select f.* from public.feed_posts f
  where f.kind = 'poll' and f.ends_at > now()
  order by (select coalesce(sum(o.vote_count), 0) from public.poll_options o where o.post_id = f.id) desc,
           f.published_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

create function public.get_listings(
  p_kind public.listing_kind, p_before_ts timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns setof public.feed_listings
language sql stable security invoker set search_path = '' as $$
  select * from public.feed_listings f
  where f.kind = p_kind
    and (p_before_ts is null or (f.published_at, f.id) < (p_before_ts, p_before_id))
  order by f.published_at desc, f.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Oldest first, so a thread reads top to bottom.
create function public.get_comments(
  p_target_type public.content_type, p_target_id uuid,
  p_after_ts timestamptz default null, p_after_id uuid default null, p_limit int default 50)
returns setof public.thread_comments
language sql stable security invoker set search_path = '' as $$
  select * from public.thread_comments c
  where ((p_target_type = 'post' and c.post_id = p_target_id) or (p_target_type = 'listing' and c.listing_id = p_target_id))
    and (p_after_ts is null or (c.published_at, c.id) > (p_after_ts, p_after_id))
  order by c.published_at, c.id
  limit least(greatest(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------
create function public.mod_get_queue(p_limit int default 50, p_after_ts timestamptz default null)
returns table (
  target_type public.content_type, target_id uuid, created_at timestamptz, title text, body text,
  images jsonb, author_id uuid, nickname text, hold_reason text, matched_term text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select q.target_type, q.target_id, q.created_at, q.title, q.body, q.images, q.author_id, q.nickname, q.hold_reason, q.matched_term
  from (
    select 'post'::public.content_type as target_type, p.id as target_id, p.created_at, p.kind::text as title, p.body, p.images,
           p.author_id, pr.nickname, h.reason as hold_reason, h.matched_term
    from public.posts p join public.profiles pr on pr.id = p.author_id
    left join public.moderation_holds h on h.target_type = 'post' and h.target_id = p.id
    where p.status = 'pending'
    union all
    select 'comment', c.id, c.created_at, null::text, c.body, '[]'::jsonb,
           c.author_id, pr.nickname, h.reason, h.matched_term
    from public.comments c join public.profiles pr on pr.id = c.author_id
    left join public.moderation_holds h on h.target_type = 'comment' and h.target_id = c.id
    where c.status = 'pending'
    union all
    select 'listing', l.id, l.created_at, l.title, l.description, l.images,
           l.author_id, pr.nickname, h.reason, h.matched_term
    from public.listings l join public.profiles pr on pr.id = l.author_id
    left join public.moderation_holds h on h.target_type = 'listing' and h.target_id = l.id
    where l.status = 'pending'
  ) q
  where p_after_ts is null or q.created_at > p_after_ts
  order by q.created_at, q.target_id
  limit least(greatest(p_limit, 1), 100);
end $$;

-- approve (pending->published), reject (pending->rejected, reason required),
-- remove (published->removed, reason required), restore (removed|rejected->published)
create function public.mod_review(
  p_type public.content_type, p_id uuid, p_action text, p_reason text default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  cur   public.content_status;
  owner uuid;
  ns    public.content_status;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject', 'remove', 'restore') then raise exception 'invalid_action'; end if;
  p_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_action in ('reject', 'remove') and p_reason is null then raise exception 'reason_required'; end if;

  if p_type = 'post' then
    select status, author_id into cur, owner from public.posts where id = p_id for update;
  elsif p_type = 'comment' then
    select status, author_id into cur, owner from public.comments where id = p_id for update;
  else
    select status, author_id into cur, owner from public.listings where id = p_id for update;
  end if;
  if not found then raise exception 'not_found'; end if;

  if (p_action in ('approve', 'reject') and cur <> 'pending')
     or (p_action = 'remove' and cur <> 'published')
     or (p_action = 'restore' and cur not in ('removed', 'rejected')) then
    raise exception 'invalid_transition';
  end if;

  ns := (case p_action when 'approve' then 'published' when 'reject' then 'rejected'
                       when 'remove' then 'removed' else 'published' end)::public.content_status;

  if p_type = 'post' then
    update public.posts set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  elsif p_type = 'comment' then
    update public.comments set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  else
    update public.listings set status = ns,
      reject_reason = case when ns in ('rejected', 'removed') then p_reason end,
      moderated_by = actor, moderated_at = now(),
      published_at = case when p_action = 'approve' then now() else published_at end
    where id = p_id;
  end if;

  delete from public.moderation_holds where target_type = p_type and target_id = p_id;

  if ns in ('rejected', 'removed') then
    update public.reports set status = 'actioned', handled_by = actor, handled_at = now()
    where target_type = p_type and target_id = p_id and status = 'open';
  end if;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, note)
  values (actor, p_type::text, p_id, p_action, p_reason, p_note);

  insert into public.notifications (user_id, type, target_type, target_id, data)
  values (owner,
          case ns when 'rejected' then 'content_rejected' when 'removed' then 'content_removed' else 'content_approved' end,
          p_type, p_id, jsonb_build_object('reason', p_reason));
end $$;

-- Edit text to remove a name etc. The original is kept in moderation_actions.
create function public.mod_edit_content(p_type public.content_type, p_id uuid, p_new_body text, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  old_body text;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_new_body := btrim(coalesce(p_new_body, ''));
  if p_type = 'post' then
    if char_length(p_new_body) not between 1 and 2000 then raise exception 'invalid_body'; end if;
    select body into old_body from public.posts where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    update public.posts set body = p_new_body where id = p_id;
  elsif p_type = 'comment' then
    if char_length(p_new_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;
    select body into old_body from public.comments where id = p_id for update;
    if not found then raise exception 'not_found'; end if;
    update public.comments set body = p_new_body where id = p_id;
  else
    raise exception 'invalid_target';
  end if;
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, original_body)
  values (actor, p_type::text, p_id, 'edit', nullif(btrim(coalesce(p_reason, '')), ''), old_body);
end $$;

create function public.mod_resolve_report(p_report_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('actioned', 'dismissed') then raise exception 'invalid_action'; end if;
  update public.reports set status = p_status, handled_by = (select auth.uid()), handled_at = now()
  where id = p_report_id and status = 'open';
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.mod_set_user_status(
  p_user uuid, p_status public.account_status, p_until timestamptz default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  target_role public.app_role;
begin
  if not public.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = actor then raise exception 'cannot_target_self'; end if;
  select role into target_role from public.user_flags where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if target_role <> 'user' and not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if target_role = 'admin' then raise exception 'cannot_target_admin'; end if;
  if p_status = 'suspended' and (p_until is null or p_until <= now()) then raise exception 'invalid_until'; end if;

  update public.user_flags
     set status = p_status,
         suspended_until = case when p_status = 'suspended' then p_until end,
         status_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where user_id = p_user;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code)
  values (actor, 'user', p_user,
          case p_status when 'banned' then 'ban' when 'suspended' then 'suspend' else 'restore_user' end,
          nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

create function public.admin_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) then raise exception 'cannot_target_self'; end if;
  update public.user_flags set role = p_role, updated_at = now() where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

-- Nicknames are locked for users; an admin can rename (e.g. offensive nickname).
create function public.admin_set_nickname(p_user uuid, p_nickname text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_nickname := btrim(p_nickname);
  if p_nickname !~ '^[A-Za-z0-9_.]{3,20}$' then raise exception 'nickname_invalid'; end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(p_nickname) and id <> p_user) then
    raise exception 'nickname_taken';
  end if;
  update public.profiles set nickname = p_nickname where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

-- Admin only. Every call is written to identity_audit_log.
create function public.admin_view_identity(p_type public.content_type, p_id uuid)
returns table (user_id uuid, nickname text, email text, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare subj uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type = 'post' then select author_id into subj from public.posts where id = p_id;
  elsif p_type = 'comment' then select author_id into subj from public.comments where id = p_id;
  else select author_id into subj from public.listings where id = p_id;
  end if;
  if subj is null then raise exception 'not_found'; end if;

  insert into public.identity_audit_log (admin_id, target_type, target_id, subject_user_id)
  values ((select auth.uid()), p_type, p_id, subj);

  return query
  select pr.id, pr.nickname, u.email::text, u.created_at
  from public.profiles pr join auth.users u on u.id = pr.id
  where pr.id = subj;
end $$;

-- ---------------------------------------------------------------------
-- Scheduled jobs (service role / pg_cron only)
-- ---------------------------------------------------------------------
create function public.refresh_trending() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.trending_scores where true;
  -- (reactions + 2 x comments), fading linearly to half weight at 7 days old.
  insert into public.trending_scores (post_id, score)
  select p.id,
         (p.reaction_count + 2 * p.comment_count)
           * (1 - 0.5 * extract(epoch from (now() - p.published_at)) / (7 * 86400))
  from public.posts p
  where p.status = 'published'
    and p.published_at > now() - interval '7 days'
    and (p.reaction_count + p.comment_count) > 0
  order by 2 desc
  limit 100;
end $$;

-- Retention: audit data and rejected/removed content (see app_settings).
create function public.purge_expired() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s record;
  n_audit int; n_actions int; n_reports int; n_posts int; n_comments int; n_listings int;
begin
  select * into s from public.app_settings where id = 1;

  delete from public.identity_audit_log where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_audit = row_count;
  delete from public.moderation_actions where created_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_actions = row_count;
  delete from public.reports where status <> 'open' and handled_at < now() - make_interval(days => s.audit_retention_days);
  get diagnostics n_reports = row_count;

  delete from public.posts where status in ('rejected', 'removed')
    and moderated_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_posts = row_count;
  delete from public.comments where status in ('rejected', 'removed')
    and moderated_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_comments = row_count;
  delete from public.listings where status in ('rejected', 'removed')
    and moderated_at < now() - make_interval(days => s.rejected_retention_days);
  get diagnostics n_listings = row_count;

  delete from public.moderation_holds h where not exists (
    select 1 from public.posts p where h.target_type = 'post' and p.id = h.target_id
    union all select 1 from public.comments c where h.target_type = 'comment' and c.id = h.target_id
    union all select 1 from public.listings l where h.target_type = 'listing' and l.id = h.target_id);

  return jsonb_build_object('audit_log', n_audit, 'moderation_actions', n_actions, 'reports', n_reports,
                            'posts', n_posts, 'comments', n_comments, 'listings', n_listings);
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('unm-refresh-trending', '*/5 * * * *', 'select public.refresh_trending()');
    perform cron.schedule('unm-purge-expired',    '17 3 * * *',  'select public.purge_expired()');
  else
    raise notice 'pg_cron is not enabled: enable it, then schedule refresh_trending() every 5 min and purge_expired() daily.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_flags          enable row level security;
alter table public.app_settings        enable row level security;
alter table public.keywords            enable row level security;
alter table public.posts               enable row level security;
alter table public.poll_options        enable row level security;
alter table public.poll_votes          enable row level security;
alter table public.listings            enable row level security;
alter table public.comments            enable row level security;
alter table public.reactions           enable row level security;
alter table public.user_blocks         enable row level security;
alter table public.moderation_holds    enable row level security;
alter table public.moderation_actions  enable row level security;
alter table public.reports             enable row level security;
alter table public.identity_audit_log  enable row level security;
alter table public.notifications       enable row level security;
alter table public.announcements       enable row level security;
alter table public.trending_scores     enable row level security;
alter table public.storage_cleanup_queue enable row level security;  -- no policies: service role only

-- profiles: nickname/avatar are public. Email is never here.
create policy profiles_read   on public.profiles for select to anon, authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy flags_read_own   on public.user_flags for select to authenticated using (user_id = (select auth.uid()));
create policy flags_read_staff on public.user_flags for select to authenticated using (public.is_staff());

create policy settings_read   on public.app_settings for select to anon, authenticated using (true);
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy keywords_staff on public.keywords for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy posts_read on public.posts for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or public.is_staff());

create policy poll_options_read on public.poll_options for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy poll_votes_own on public.poll_votes for select to anon, authenticated
  using (user_id = (select auth.uid()));

create policy listings_read on public.listings for select to anon, authenticated
  using (status = 'published' or author_id = (select auth.uid()) or public.is_staff());

create policy comments_read on public.comments for select to anon, authenticated
  using (
    author_id = (select auth.uid()) or public.is_staff()
    or (status = 'published' and (
         (post_id is not null    and exists (select 1 from public.posts p    where p.id = post_id    and p.status = 'published'))
      or (listing_id is not null and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published'))))
  );

create policy reactions_own on public.reactions for select to anon, authenticated
  using (user_id = (select auth.uid()));

create policy blocks_read   on public.user_blocks for select to authenticated using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.user_blocks for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy blocks_delete on public.user_blocks for delete to authenticated using (blocker_id = (select auth.uid()));

create policy holds_staff   on public.moderation_holds   for select to authenticated using (public.is_staff());
create policy actions_staff on public.moderation_actions for select to authenticated using (public.is_staff());
create policy reports_staff on public.reports            for select to authenticated using (public.is_staff());
create policy audit_admin   on public.identity_audit_log for select to authenticated using (public.is_admin());

create policy notifications_read   on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy announcements_read on public.announcements for select to anon, authenticated
  using ((starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_staff());
create policy announcements_staff_write on public.announcements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy trending_read on public.trending_scores for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Privileges: start from nothing, grant only what the app needs
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Readable by everyone (guests included). RLS still filters rows.
grant select (id, nickname, avatar_key, created_at) on public.profiles to anon, authenticated;
grant select (id, app_name, tagline, logo_path)      on public.app_settings to anon;
grant select on public.app_settings to authenticated;
grant select on public.posts, public.poll_options, public.listings, public.comments,
                public.announcements, public.trending_scores,
                public.reactions, public.poll_votes,
                public.feed_posts, public.feed_listings, public.thread_comments
  to anon, authenticated;

-- Signed-in only (RLS narrows to own rows or staff).
grant select on public.user_flags, public.user_blocks, public.notifications,
                public.keywords, public.moderation_holds, public.moderation_actions,
                public.reports, public.identity_audit_log
  to authenticated;

-- The few direct writes. Everything else goes through RPCs.
grant update (avatar_key)                          on public.profiles      to authenticated;
grant update (app_name, tagline, logo_path, moderation_mode, audit_retention_days, rejected_retention_days)
                                                   on public.app_settings  to authenticated;
grant insert, update, delete                       on public.keywords      to authenticated;
grant insert, update, delete                       on public.announcements to authenticated;
grant insert, delete                               on public.user_blocks   to authenticated;
grant update (read_at), delete                     on public.notifications to authenticated;

-- Functions: closed by default, then opened one by one.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_staff(), public.is_admin() to anon, authenticated;  -- used inside RLS policies
grant execute on function
  public.get_feed(timestamptz, uuid, int),
  public.get_trending(int),
  public.get_active_polls(int),
  public.get_listings(public.listing_kind, timestamptz, uuid, int),
  public.get_comments(public.content_type, uuid, timestamptz, uuid, int)
  to anon, authenticated;
grant execute on function
  public.set_nickname(text),
  public.create_post(public.post_kind, text, text, jsonb, text[], timestamptz),
  public.create_listing(public.listing_kind, text, text, numeric, text, text, date, jsonb),
  public.set_listing_closed(uuid, boolean),
  public.create_comment(public.content_type, uuid, text),
  public.set_reaction(uuid, public.reaction_type),
  public.vote_poll(uuid, uuid),
  public.report_content(public.content_type, uuid, text, text),
  public.mod_get_queue(int, timestamptz),
  public.mod_review(public.content_type, uuid, text, text, text),
  public.mod_edit_content(public.content_type, uuid, text, text),
  public.mod_resolve_report(uuid, text),
  public.mod_set_user_status(uuid, public.account_status, timestamptz, text),
  public.admin_set_role(uuid, public.app_role),
  public.admin_set_nickname(uuid, text),
  public.admin_view_identity(public.content_type, uuid)
  to authenticated;
-- refresh_trending() and purge_expired() stay service_role/cron only.

-- ---------------------------------------------------------------------
-- Realtime: new posts/comments for open screens, private notifications.
-- RLS applies, so held (pending) rows are only delivered to their author/staff.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.posts, public.comments,
      public.notifications, public.announcements;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage: 2 buckets. post-images is public-read (guests see the feed);
-- uploads must go under <auth.uid()>/. Size/type are enforced server-side.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-images', 'post-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('branding',    'branding',    true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "post-images: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "post-images: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and public.is_staff());
create policy "branding: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_staff());
create policy "branding: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_staff()) with check (bucket_id = 'branding' and public.is_staff());
create policy "branding: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_staff());

-- ---------------------------------------------------------------------
-- Bootstrap the first admin (run once in the SQL editor after signing up):
--   update public.user_flags set role = 'admin' where user_id = '<your auth user id>';
-- ---------------------------------------------------------------------
