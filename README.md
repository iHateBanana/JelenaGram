# JelenaGram

Private, two-person, Instagram-style viewer for iPhone albums. Expo (React Native + TypeScript), iOS + web, Supabase backend.

- Home feed shows **only the other person's** photos, with anything new at the top. Tap a photo to view it full screen (pinch to zoom, swipe between photos, swipe down to close), or double-tap to like it. Each post header shows its album; tap it to open the album profile (grid).
- Heart a photo as many times as you like (per-person counts shown) and leave comments.
- iOS: pick albums straight from your Photos library (`expo-media-library`). Web: pick photos manually (browsers can't read the Photos library).
- Photos are uploaded resized (max 1080px) to a **private** bucket and served with signed URLs.

## Setup

1. Create a Supabase project. In **Authentication > Providers > Email** turn off "Allow new users to sign up".
2. Create the two users (Authentication > Users, email + password).
3. Run `supabase/schema.sql`, then `supabase/upgrade-3.sql`, in the SQL editor, then insert both users into `allowed_users` (see the comment at the bottom).
4. `copy .env.example .env` and fill in the project URL and anon key.
5. `npm install`, then `npm run web` or `npm run ios` (Expo Go on an iPhone works).

Only the two users in `allowed_users` can read or write anything (Row Level Security).
