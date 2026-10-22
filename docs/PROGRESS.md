# Progress log

## Module 1: Foundation, auth, registration, theme, tab shell (2026-10-22)

**Built**
- `/mobile`: Expo SDK 57, Expo Router (typed routes), strict TS (`noUncheckedIndexedAccess`), NativeWind v4, Supabase JS (PKCE, AsyncStorage session), TanStack Query v5 with a persisted cache (AsyncStorage, 30-min maxAge, allowlist `app-settings` and `profile`), Zustand, expo-image, Ionicons, Zod 4, ESLint (`eslint-config-expo`, `no-explicit-any` set to error).
- `PersistQueryClientProvider` wraps the whole app, outside every gate. The session is read in the background. Guests have no session and no anonymous sign-in.
- `useRequireAuth()` + `<SignInSheet/>`. The Create tab is already gated for guests.
- Email sign-up (email, nickname, password, Terms checkbox) with live debounced nickname availability and a pre-submit check, then email OTP verify (resend with a 60 s cooldown). Also sign-in, forgot password via recovery OTP, set new password, and Google OAuth (`signInWithOAuth` + `openAuthSessionAsync` + PKCE code exchange).
- Choose-nickname screen (`rpc('set_nickname')`). A `Stack.Protected` guard keeps users without a nickname on it.
- `lib/errors.ts` maps DB and Auth error codes to user-facing text.
- Theme: LyriaHub "Dark Studio" tokens for dark and an inverse palette for light (`theme/colors.ts`), exposed as Tailwind tokens via CSS variables. The system/light/dark preference is stored in Zustand + AsyncStorage.
- Tabs: Feed, Trending, Create, Buy & Sell, Profile, each a placeholder with a Reanimated shimmer `Skeleton` (static under reduced motion). `PostCardSkeleton` and `ListingCardSkeleton` are ready for later modules.
- Branding: `useAppSettings()` (persisted) + `<AppLogo/>` with a placeholder until `app_settings` loads.
- Profile tab: nickname, avatar picker (`avatar_01`..`avatar_12` as icon badges, optimistic `profiles.avatar_key` update), theme switch, logout. Guests get a sign-in call to action.
- New migration `20261022000000_nickname_check.sql`: `is_nickname_available(text)`, which delegates to `_validate_nickname`. Tests added to `supabase/tests/run.sh`, which now applies every migration.

**Verified**
- `tsc --noEmit`: 0 errors. `expo lint`: 0 problems. `expo-doctor`: 21/21 checks pass.
- `expo export` bundles Android and iOS. The NativeWind token classes compile to `rgb(var(--color-*))`.
- Metro starts and generates the typed routes.
- `npm run gen:types` works against the linked project (it returned empty types because the remote schema is not applied yet).

**Not verified**
- The app has not run on a device or emulator; there is no Android SDK or device on the dev machine.
- No auth flow has been exercised end to end, because the remote project has no schema yet.
- `types/database.ts` is hand-written to match the SQL. Regenerate it after applying the migrations.
- The new SQL tests were not run (no local Postgres).

**Pending**
- Verification code screen must be rebuilt to the six-box spec in the PRD (not done yet).

**Left / setup:** see the module 1 handoff (apply migrations, regenerate types, Supabase email templates with `{{ .Token }}`, Google OAuth client, redirect URLs, dev build).

**Deviations from the PRD**
- Settings "Edit information": the nickname is not editable (locked decision). Email and password editing are not built yet.
- ~~Keyset pagination uses `(published_at, id)` per the schema, not `(created_at, id)` as the PRD says.~~ Resolved: the schema's `(published_at, id)` is correct and the PRD has been fixed.
- Terms and Privacy are draft placeholder copy in `app/legal/[doc].tsx`.
