# Force update

Blocks old app versions with a full-screen "Update required" screen until the user installs a newer build.

## How it works

- `app_settings` has three columns: `min_app_version` (`'0.0.0'` = nobody is blocked), `update_url` (must start with `https://`) and `update_message` (up to 200 characters). Neither the app nor the panel can change them; set them in the Supabase SQL editor.
- At launch, and each time the app returns to the foreground (at most once every 5 minutes), the app calls `get_app_requirements()`. Guests can call it too. The last good answer is cached on the phone.
- If the installed version is lower than `min_app_version`, the screen covers everything, including the tabs and any open sheet, and Android's back button does nothing. "Update now" opens `update_url`. Without a valid `https://` link the button is hidden and the screen says "Please update the app from where you installed it."
- If the check fails (offline, timeout, server error, bad data), the app uses the cached answer. If nothing is cached, it never blocks.
- The screen goes away on its own once a later check finds the requirement met, for example after the minimum is lowered.

Code: `mobile/lib/versionGate.ts` (pure logic, tested by `npm run test:version`), `mobile/lib/appRequirements.ts` (fetch and cache), `mobile/hooks/useAppRequirements.ts`, `mobile/components/layout/ForceUpdateGate.tsx`.

## Turn it on

In the Supabase SQL editor:

```sql
update public.app_settings set min_app_version = '1.0.1', update_url = 'https://github.com/djmirontos/unm-releases/releases/latest', update_message = 'Please install the latest version to continue.' where id = 1;
```

## Turn it off

```sql
update public.app_settings set min_app_version = '0.0.0', update_url = null, update_message = null where id = 1;
```

## Versions

- The installed version is `"version"` in `mobile/app.json`, baked into each build.
- EAS Updates (OTA) keep the same version (`runtimeVersion` policy `appVersion`), so an OTA update **never** satisfies a forced update. Only a new build with a higher `version` does.
- Every build must carry the right `version`. A build published with an old version number stays blocked after it is installed.

> **Warning:** never set `min_app_version` higher than the newest build people can actually download. That locks everyone out, including people who just installed the latest build, until you lower it again.

## Testing

1. Set a high minimum, e.g. `update public.app_settings set min_app_version = '99.0.0' where id = 1;`
2. Open the app, or send it to the background and bring it back after at least 5 minutes, or restart it. The "Update required" screen appears. Check that back does nothing and that "Update now" opens the link (if one is set).
3. Set it back: run the "Turn it off" SQL above. Restart the app (or wait 5 minutes and bring it back to the foreground); the screen disappears.
