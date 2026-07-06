# Deploy policy

After finishing a code change in this repo and confirming it works (tested manually, or verified via lint/build when a manual check isn't possible), commit and push to `origin/main` automatically — do not ask for confirmation first. Netlify is connected to this repo and auto-deploys from `main` on push.

**Skip auto-push and ask the user first when:**
- The change touches RLS policies (`supabase/schema.sql`), auth, or role/permission logic — a mistake there can leak or lock out data.
- The change is destructive or hard to reverse (dropping/altering columns or tables, deleting data, force-push, rewriting history).
- It could not be fully tested in this environment (e.g. no way to run the dev server or verify the UI) and correctness is still uncertain.
- The user's intent or scope was ambiguous and the change involves any judgment call.

When in doubt, treat it as high-risk and ask.
