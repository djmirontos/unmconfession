-- Module 7e: more keyword categories (adult_content, violence, hate_speech, gambling).
-- The category is only checked by this constraint; no function reads it.
alter table public.keywords drop constraint keywords_category_check;
alter table public.keywords add constraint keywords_category_check
  check (category = any (array['abuse','doxxing','prohibited_item','spam','adult_content','violence','hate_speech','gambling','other']));
