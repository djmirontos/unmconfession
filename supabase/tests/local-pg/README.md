# Local Postgres SQL test suites (UNM)

These bash suites build a throwaway Postgres 16 database, apply `supabase/migrations/*.sql` in order
(a Supabase stub in `00_supabase_stub.sql` provides auth.users, auth.uid(), roles, pg_cron/pg_net stand-ins),
then check behaviour as `anon`, `authenticated` and the SQL-editor user.

Each suite applies only the migrations that come BEFORE its own migration, then applies its own migration in
ONE transaction (exactly like the Supabase SQL editor), then runs checks. Output: PASS/FAIL lines and a total.

Run (Linux/macOS or WSL, Postgres 16 server tools installed, a scratch cluster on port 54329):
    export PGHOST=/path/to/socket_dir PGPORT=54329 PGUSER=postgres
    ./qa_posts.sh        # one suite
    for t in *.sh; do ./$t | tail -1; done

Known time-dependent case: badges.sh fails 2 checks between 00:00 and 03:59 Asia/Manila
(the Nocturnal badge is awarded to the test users themselves). It passes in daytime.

Suites for v1.0.2/v1.0.3: staff_mobile, staff_alerts, soft_update, app_versions, qa_posts, qa_upvotes, helpful_badge.
Place this folder in the repo as supabase/tests/local-pg/ (do not overwrite supabase/tests/run.sh).
