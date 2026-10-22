-- =====================================================================
-- Live nickname availability check for the sign-up / choose-nickname forms.
-- Supabase Auth hides handle_new_user()'s exception behind a generic
-- "Database error saving new user", so the client checks first.
-- =====================================================================

-- Delegates to _validate_nickname so the rules live in one place.
-- Returns false for invalid, reserved or taken; never raises.
create function public.is_nickname_available(p_nickname text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._validate_nickname(btrim(p_nickname));
  return true;
exception
  when raise_exception then
    return false;
end $$;

revoke all on function public.is_nickname_available(text) from public, service_role;
grant execute on function public.is_nickname_available(text) to anon, authenticated;
