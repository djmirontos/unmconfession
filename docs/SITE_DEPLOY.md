# Deploying the public website (unm.klasmeyt.com)

The site in `site/` is static: it needs no environment variables, database or secrets. Google Play needs its `/delete-account` page to be public before the app is published.

## Vercel: first deploy

1. In Vercel, choose **Add New → Project** and import the same GitHub repository (`unmconfession`).
2. Configure the project:
   - **Root Directory:** `site`
   - **Framework Preset:** Next.js (detected). Leave the build command (`next build`), the output settings and the install command as they are.
   - **Environment Variables:** none.
3. Click **Deploy**. Open the `*.vercel.app` URL and check every page loads.

Optional: Settings → Git → **Ignored Build Step**, so commits that touch only `mobile/` or `admin/` do not rebuild the site. Use the command `git diff --quiet HEAD^ HEAD -- .` (in the `site` root, it skips the build when nothing in `site/` changed).

## Domain

1. In the Vercel project, go to **Settings → Domains → Add** and enter `unm.klasmeyt.com`.
2. Vercel shows the DNS record it needs: a CNAME, usually `cname.vercel-dns.com`, but use exactly the value shown.
3. In GoDaddy, go to **My Products → klasmeyt.com → DNS → Add New Record**:
   - **Type:** CNAME
   - **Name:** `unm`
   - **Value:** the value Vercel showed
   - **TTL:** default (1 hour)

   Save the record. Do not change the existing records for `@`, `www` or `admin`.
4. Wait until Vercel shows the domain as **Valid Configuration**. This takes minutes, sometimes up to an hour. Vercel then issues the HTTPS certificate automatically.

## Verify

Open each page and check it loads over HTTPS:
- https://unm.klasmeyt.com
- `/privacy`, `/terms`, `/rules`, `/child-safety` and `/delete-account`
- `/robots.txt` (allows all, and lists the sitemap)
- `/sitemap.xml` (lists the six pages)
- a missing page such as `/nope`, which should show "Page not found" with status 404

Check the headers:

```sh
curl -sI https://unm.klasmeyt.com/
```

The response must include:
- `Content-Security-Policy` (with `frame-ancestors 'none'`)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy`
- `Strict-Transport-Security` (added by Vercel)

It must have no `Set-Cookie` and no `X-Powered-By`.

Finally, on `/delete-account`, tap the email link and check that a new mail opens to `support@klasmeyt.com` with the subject "Delete my account". Then enter the URL `https://unm.klasmeyt.com/delete-account` in Google Play Console (App content → Data safety → Data deletion).

## Download links

The "Get the app" buttons show "Coming soon" until their URLs are set. Set `PLAY_STORE_URL` (the Play listing) and `APK_RELEASES_URL` (the GitHub releases page) in `site/lib/site.ts`, then commit and push. Vercel redeploys the site. Check that each button on the home page opens its page: Google Play in the same tab, GitHub in a new tab.

Both URLs are set: Google Play is `https://play.google.com/store/apps/details?id=com.unmfreedom.confessions` (package `com.unmfreedom.confessions`, as in `mobile/app.json`), GitHub is the latest release of `djmirontos/unm-releases`.

Keep the Google Play badge and the GitHub mark unmodified (no recolouring, cropping, stretching or effects; keep their proportions and clear space). See `site/README.md`.

## Roll back

- **A bad deploy:** in Vercel, go to **Deployments**, open the last good deployment, then **⋯ → Promote to Production** (or **Instant Rollback**). The domain switches at once, with no DNS change.
- **A bad commit:** revert it in git and push. Vercel builds and promotes the reverted version.
- **Taking the domain off the site:** remove `unm.klasmeyt.com` under **Settings → Domains**, and delete the `unm` CNAME in GoDaddy. The Play Store deletion URL then stops working, so do this only if the page is replaced elsewhere.
