-- SmartFridge Supabase Auth + RLS setup
-- Run this once in Supabase SQL Editor after the tables exist.

-- 1) Convert public.users into a profile table linked to Supabase Auth.
alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

-- Passwords are now managed by Supabase Auth, not public.users.
alter table public.users
  alter column password_hash drop not null;

update public.users
set password_hash = null;

-- 2) Enable RLS.
alter table public.users enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_state_entries enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_removal_history enable row level security;
alter table public.shopping_items enable row level security;
alter table public.notifications enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_likes enable row level security;
alter table public.recipe_saves enable row level security;
alter table public.follows enable row level security;
alter table public.price_records enable row level security;

-- 2.1) Grant table/sequence privileges to the roles used by Supabase APIs.
-- RLS decides which rows are allowed; grants decide whether the API roles may
-- attempt the operation at all. Without these, PostgREST returns
-- "permission denied for table ...".
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.user_state_entries to authenticated;
grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.ingredient_removal_history to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.recipe_steps to authenticated;
grant select, insert, update, delete on public.recipe_likes to authenticated;
grant select, insert, update, delete on public.recipe_saves to authenticated;
grant select, insert, update, delete on public.follows to authenticated;
grant select on public.price_records to anon, authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Grant all necessary permissions to service_role for CRON jobs and system operations.
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.user_settings to service_role;
grant select, insert, update, delete on public.user_state_entries to service_role;
grant select, insert, update, delete on public.ingredients to service_role;
grant select, insert, update, delete on public.ingredient_removal_history to service_role;
grant select, insert, update, delete on public.shopping_items to service_role;
grant select, insert, update, delete on public.notifications to service_role;
grant select, insert, update, delete on public.recipes to service_role;
grant select, insert, update, delete on public.recipe_ingredients to service_role;
grant select, insert, update, delete on public.recipe_steps to service_role;
grant select, insert, update, delete on public.recipe_likes to service_role;
grant select, insert, update, delete on public.recipe_saves to service_role;
grant select, insert, update, delete on public.follows to service_role;
grant select, insert, update, delete on public.price_records to service_role;

grant usage, select on all sequences in schema public to service_role;

-- 3) Replace existing policies created by earlier experiments.
drop policy if exists "users_select_profiles" on public.users;
drop policy if exists "users_insert_own_profile" on public.users;
drop policy if exists "users_update_own_profile" on public.users;

drop policy if exists "user_settings_owner_all" on public.user_settings;
drop policy if exists "user_state_entries_owner_all" on public.user_state_entries;
drop policy if exists "ingredients_owner_all" on public.ingredients;
drop policy if exists "ingredient_removal_history_owner_all" on public.ingredient_removal_history;
drop policy if exists "shopping_items_owner_all" on public.shopping_items;
drop policy if exists "notifications_owner_all" on public.notifications;

drop policy if exists "recipes_select_visible" on public.recipes;
drop policy if exists "recipes_insert_own" on public.recipes;
drop policy if exists "recipes_update_own" on public.recipes;
drop policy if exists "recipes_delete_own" on public.recipes;

drop policy if exists "recipe_ingredients_select_visible" on public.recipe_ingredients;
drop policy if exists "recipe_ingredients_write_own_recipe" on public.recipe_ingredients;
drop policy if exists "recipe_steps_select_visible" on public.recipe_steps;
drop policy if exists "recipe_steps_write_own_recipe" on public.recipe_steps;

drop policy if exists "recipe_likes_select_visible" on public.recipe_likes;
drop policy if exists "recipe_likes_write_own" on public.recipe_likes;
drop policy if exists "recipe_saves_select_own" on public.recipe_saves;
drop policy if exists "recipe_saves_write_own" on public.recipe_saves;

drop policy if exists "follows_select_own" on public.follows;
drop policy if exists "follows_write_own" on public.follows;

drop policy if exists "price_records_read_all" on public.price_records;

-- 4) Profile policies.
-- Authenticated users may read public profile fields for community recipe authors.
create policy "users_select_profiles"
on public.users
for select
to authenticated
using (true);

create policy "users_insert_own_profile"
on public.users
for insert
to authenticated
with check (auth_user_id = (select auth.uid()));

create policy "users_update_own_profile"
on public.users
for update
to authenticated
using (auth_user_id = (select auth.uid()))
with check (auth_user_id = (select auth.uid()));

-- 5) Owner-only table policies.
create policy "user_settings_owner_all"
on public.user_settings
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = user_settings.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = user_settings.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "user_state_entries_owner_all"
on public.user_state_entries
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = user_state_entries.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = user_state_entries.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "ingredients_owner_all"
on public.ingredients
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = ingredients.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = ingredients.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "ingredient_removal_history_owner_all"
on public.ingredient_removal_history
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = ingredient_removal_history.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = ingredient_removal_history.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "shopping_items_owner_all"
on public.shopping_items
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = shopping_items.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = shopping_items.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "notifications_owner_all"
on public.notifications
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = notifications.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = notifications.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

-- 6) Recipes and community content.
create policy "recipes_select_visible"
on public.recipes
for select
to authenticated
using (
  is_public = true
  or exists (
    select 1 from public.users u
    where u.id = recipes.author_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipes_insert_own"
on public.recipes
for insert
to authenticated
with check (
  exists (
    select 1 from public.users u
    where u.id = recipes.author_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipes_update_own"
on public.recipes
for update
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = recipes.author_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = recipes.author_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipes_delete_own"
on public.recipes
for delete
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = recipes.author_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipe_ingredients_select_visible"
on public.recipe_ingredients
for select
to authenticated
using (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_ingredients.recipe_id
      and (r.is_public = true or u.auth_user_id = (select auth.uid()))
  )
);

create policy "recipe_ingredients_write_own_recipe"
on public.recipe_ingredients
for all
to authenticated
using (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_ingredients.recipe_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_ingredients.recipe_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipe_steps_select_visible"
on public.recipe_steps
for select
to authenticated
using (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_steps.recipe_id
      and (r.is_public = true or u.auth_user_id = (select auth.uid()))
  )
);

create policy "recipe_steps_write_own_recipe"
on public.recipe_steps
for all
to authenticated
using (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_steps.recipe_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_steps.recipe_id
      and u.auth_user_id = (select auth.uid())
  )
);

-- 7) Likes, saves, follows.
create policy "recipe_likes_select_visible"
on public.recipe_likes
for select
to authenticated
using (
  exists (
    select 1 from public.recipes r
    join public.users u on u.id = r.author_id
    where r.id = recipe_likes.recipe_id
      and (r.is_public = true or u.auth_user_id = (select auth.uid()))
  )
);

create policy "recipe_likes_write_own"
on public.recipe_likes
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = recipe_likes.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = recipe_likes.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipe_saves_select_own"
on public.recipe_saves
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = recipe_saves.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "recipe_saves_write_own"
on public.recipe_saves
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = recipe_saves.user_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = recipe_saves.user_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "follows_select_own"
on public.follows
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = follows.follower_id
      and u.auth_user_id = (select auth.uid())
  )
);

create policy "follows_write_own"
on public.follows
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = follows.follower_id
      and u.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = follows.follower_id
      and u.auth_user_id = (select auth.uid())
  )
);

-- 8) Market price records are public read-only from the browser.
create policy "price_records_read_all"
on public.price_records
for select
to anon, authenticated
using (true);
