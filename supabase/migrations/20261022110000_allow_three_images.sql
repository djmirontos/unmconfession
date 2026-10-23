-- =====================================================================
-- Allow up to 3 images per post and per listing (was 2).
-- Polls still cannot carry images (enforced in create_post).
-- =====================================================================

alter table public.posts drop constraint posts_images_max2;
alter table public.posts add constraint posts_images_max3
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 3);

alter table public.listings drop constraint listings_images_max2;
alter table public.listings add constraint listings_images_max3
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 3);

-- Same function as before with the limit raised to 3. CREATE OR REPLACE keeps
-- the existing privileges (it is internal; only create_post/create_listing call it).
create or replace function public._check_images(p_images jsonb, p_uid uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  el  jsonb;
  out jsonb := '[]'::jsonb;
begin
  if p_images is null or jsonb_typeof(p_images) <> 'array' then raise exception 'invalid_images'; end if;
  if jsonb_array_length(p_images) > 3 then raise exception 'too_many_images'; end if;
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
