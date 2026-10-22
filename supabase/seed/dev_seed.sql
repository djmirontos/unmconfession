-- =====================================================================
-- DEV SEED: ~40 test posts for the Feed (Module 2). NOT a migration.
-- Run once in the Supabase SQL editor (runs as postgres, so RLS and the
-- RPC-only write rule are bypassed on purpose). Remove with dev_seed_cleanup.sql.
--
-- Every seed row starts with "[seed] " so it can be found and deleted.
-- Posts are inserted oldest first, so the posts_stamp trigger hands out
-- #numbers in time order. Comments are inserted after their post; the
-- comments trigger adds them to comment_count on top of the seeded value.
-- No images: seeding Storage needs real uploads.
-- =====================================================================
do $$
declare
  v_email   text := 'you@example.com';   -- <<< EDIT: your admin account's email
  v_uid     uuid;
  v_post    uuid;
  v_poll    uuid;
  v_posted  timestamptz;
  r         record;
  i         int;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No auth user with email %. Edit v_email at the top.', v_email;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and nickname is not null) then
    raise exception 'User % has no nickname yet. Finish sign-up in the app first.', v_email;
  end if;
  if exists (select 1 from public.posts where body like '[seed] %') then
    raise exception 'Seed rows already exist. Run dev_seed_cleanup.sql first.';
  end if;

  -- ------------------------------------------------------------------
  -- 24 confessions + 8 shoutouts, spread over the last 72 hours.
  -- ------------------------------------------------------------------
  for r in
    select * from (values
      ('confession', 'I still have not returned the umbrella I borrowed in first year. It has been through three typhoons with me. I think it is mine now.', null, 71.5, 42, 3),
      ('confession', 'I pretend to take notes in lectures but I am actually drawing the prof as a cat. The cat is getting very detailed.', null, 69.0, 18, 1),
      ('shoutout',   'Thank you for sharing your umbrella and your notes during the storm last week. You are a legend.', 'Kuya at the BSA lobby', 66.2, 27, 2),
      ('confession', 'I failed my first quiz this sem and cried in the CR. Then I studied properly for the next one and got 48/50. Kaya pa pala.', null, 64.0, 96, 8),
      ('confession', 'The canteen adobo on Wednesdays is the only reason I attend my 7:30 class.', null, 60.7, 55, 6),
      ('shoutout',   'Happy birthday! Thank you for always lending me your calculator without asking questions.', 'Seatmate in Stat 101, Section B', 58.1, 12, 0),
      ('confession', 'I joined three orgs to make friends and now I have six group chats and zero sleep.', null, 55.3, 63, 4),
      ('confession', 'Every time the wifi drops in the library, a little part of my thesis dies with it.', null, 52.9, 31, 2),
      ('confession', 'Long one, sorry. I almost shifted courses last year because I thought I was not smart enough. I sat on the stairs near the gym every afternoon for two weeks trying to decide. A janitor I never got the name of asked me why I always looked so tired. I told him everything. He said he cleaned that same staircase for nineteen years and saw hundreds of students sit there with the same face, and most of them turned out fine, and some of them came back years later wearing a toga. I stayed in my course. I am graduating this March. If you are reading this, Manong, thank you. And to whoever is sitting on those stairs right now: it gets better, one quiz at a time.', null, 50.0, 210, 15),
      ('shoutout',   'You held the elevator for me when I was late for my defense. I passed! Thank you!', 'Girl in the yellow hoodie, Engineering bldg', 47.4, 44, 3),
      ('confession', 'I have been calling my blockmate by the wrong name for two semesters and it is too late to fix it now.', null, 45.0, 120, 11),
      ('confession', 'My dorm roommate sings in the shower at 5 AM. She is actually really good. I have never told her I listen.', null, 42.2, 38, 2),
      ('confession', 'I bought a planner in August. It is October. The planner is still in the plastic.', null, 40.1, 74, 5),
      ('shoutout',   'Thank you for the free extra rice every time. You do not know how much it helps at the end of the month.', 'Ate at the canteen', 37.6, 150, 9),
      ('confession', 'Group project update: I am the group.', null, 35.0, 88, 7),
      ('confession', 'I sat in the wrong classroom for 40 minutes before realizing it was a Masters class. I answered a question. I was right.', null, 32.4, 101, 6),
      ('confession', 'I miss the old benches near the field. The new ones are nice but they do not have our initials on them.', null, 29.8, 22, 1),
      ('shoutout',   'Best adviser ever. Thank you for believing in our thesis when we did not.', 'Ma''am of the CS department', 27.0, 67, 4),
      ('confession', 'I learned how to cook rice properly only this year. I am 21. Do not judge.', null, 24.5, 49, 3),
      ('confession', 'The jeepney driver on my route knows my stop by heart. I have never said para. Respect.', null, 22.0, 58, 2),
      ('confession', 'I told my parents I have a 7 AM class so they would let me stay in the dorm. I do have a 7 AM class. I just also do not want to wake up at 4.', null, 19.6, 34, 1),
      ('shoutout',   'Congratulations on topping the midterms! Libre naman diyan.', 'BSN 2-A', 17.2, 25, 2),
      ('confession', 'I have read every single post here since the first week and never commented. Hi.', null, 15.0, 81, 5),
      ('confession', 'My crush finally said hi to me today. I said thank you. Why did I say thank you.', null, 12.8, 175, 14),
      ('confession', 'I lost my ID and found it in the freezer. I do not remember putting it there.', null, 10.3, 66, 4),
      ('shoutout',   'You found my wallet and returned it with everything inside. Faith in humanity restored.', 'Guard at Gate 2', 8.9, 140, 6),
      ('confession', 'Sometimes I go to the chapel between classes not to pray but because it is the only quiet place with aircon. Sorry po.', null, 7.0, 47, 2),
      ('confession', 'Our block made a group chat for the field trip and it has more memes than plans.', null, 5.5, 19, 0),
      ('confession', 'I am the person who always asks "will this be in the exam?" and I want you all to know I ask for everyone.', null, 4.0, 92, 3),
      ('shoutout',   'Thank you for the encouraging note you left on my desk before finals. I kept it.', 'Whoever sits behind me in Room 204', 2.6, 33, 1),
      ('confession', 'First time posting. Hello UNM. Please be kind.', null, 1.2, 8, 0),
      ('confession', 'Just saw someone run to catch the last jeep and make it. The whole waiting shed cheered.', null, 0.3, 3, 0)
    ) as t (kind, body, target_name, hours_ago, reactions, comments)
    order by hours_ago desc
  loop
    insert into public.posts (kind, author_id, body, target_name, status, published_at, reaction_count, comment_count)
    values (r.kind::public.post_kind, v_uid, '[seed] ' || r.body, r.target_name, 'published',
            now() - r.hours_ago * interval '1 hour', r.reactions, r.comments);
  end loop;

  -- ------------------------------------------------------------------
  -- 4 polls (2 to 6 options), one already ended. Polls get no #number.
  -- ------------------------------------------------------------------
  for r in
    select * from (values
      ('Best study spot on campus?', 70.0, -6.0, array['Library 2nd floor', 'Canteen', 'Chapel steps', 'Gym bleachers'], array[34, 12, 9, 5], 20),
      ('Should the library open until 10 PM during finals week?', 43.0, 48.0, array['Yes please', 'No, 8 PM is fine'], array[88, 7], 31),
      ('What do you have for lunch most days?', 20.5, 72.0, array['Canteen rice meal', 'Baon from home', 'Fast food', 'Street food', 'Skip lunch', 'Coffee only'], array[40, 33, 11, 25, 6, 9], 12),
      ('Favorite org fair booth this year?', 3.0, 96.0, array['Music club', 'Robotics', 'Debate society'], array[2, 1, 0], 2)
    ) as t (question, hours_ago, ends_in_hours, labels, votes, reactions)
    order by hours_ago desc
  loop
    v_posted := now() - r.hours_ago * interval '1 hour';
    insert into public.posts (kind, author_id, body, status, published_at, ends_at, reaction_count, comment_count)
    values ('poll', v_uid, '[seed] ' || r.question, 'published', v_posted,
            now() + r.ends_in_hours * interval '1 hour', r.reactions, 0)
    returning id into v_poll;

    for i in 1 .. array_length(r.labels, 1) loop
      insert into public.poll_options (post_id, label, position, vote_count)
      values (v_poll, r.labels[i], (i - 1)::smallint, r.votes[i]);
    end loop;
  end loop;

  -- ------------------------------------------------------------------
  -- A few comments on the three newest confessions.
  -- ------------------------------------------------------------------
  for r in
    select p.id, p.published_at, row_number() over (order by p.published_at desc) as rn
    from public.posts p
    where p.author_id = v_uid and p.body like '[seed] %' and p.kind = 'confession'
    order by p.published_at desc
    limit 3
  loop
    for i in 1 .. (4 - r.rn::int) loop
      insert into public.comments (post_id, author_id, body, status, published_at)
      values (r.id, v_uid,
              '[seed] ' || (array['Same here honestly.', 'This made my day.', 'Hahaha relate!'])[i],
              'published', least(now(), r.published_at + i * interval '4 minutes'));
    end loop;
  end loop;

  -- ------------------------------------------------------------------
  -- One active announcement (pinned on top of the Feed).
  -- ------------------------------------------------------------------
  insert into public.announcements (title, body, created_by, starts_at, ends_at)
  values ('[seed] Welcome to UNM Freedom Confessions',
          '[seed] Be kind, keep names out of confessions, and report anything that crosses the line. Moderators review every report.',
          v_uid, now() - interval '1 hour', now() + interval '7 days');

  raise notice 'Seeded posts for % (%).', v_email, v_uid;
end $$;

-- Optional: fill Trending from the seeded counts (normally a cron job).
-- select public.refresh_trending();
