Canonical routes for /studio

This folder contains multiple routes and client components related to studio pages (both admin and public). The purpose of this file is to document the canonical route choices and clarify which files are for admin vs public usage.

Existing routes (current codebase)

- /studio/public/[id]
  - File: `app/studio/public/[id]/page.tsx`
  - Purpose: visitor-facing public studio page. Used by the Explore page and intended for all users (no admin sidebar). Shows studio info, program lists, signup flow and contact info.
  - Render mode: client component (uses `useParams`, `useEffect`) and fetches Supabase on the client.

- /studio/[id]/public
  - File: `app/studio/[id]/public/page.tsx`
  - Purpose: server-side page under the `studio` admin tree. Loads `StudioPublicProfile` and returns server-rendered `StudioPublicProfile` component. Because this file lives under `app/studio/[id]` it inherits the admin layout and sidebar.
  - Render mode: server component (calls Supabase on the server via `createSupabaseClient`). Intended for admin preview or admin-specific views.

- /studio/[id]/public-profile
  - File: `app/studio/[id]/public-profile/page.tsx`
  - Purpose: client-side admin page for editing the public profile (form, save, preview). It lives under the admin layout and is reachable from the `StudioSidebar`.
  - Render mode: client component (edit form, preview toggle).

Why this is confusing

- The names are very similar (`public`, `public-profile`, and `public/[id]`) and appear in different positions of the route tree. That leads to unclear expectations about which route a link should target (visitor vs admin).
- `app/explore` currently navigates to `/studio/public/${studio.id}` (visitor route), which is correct, but there are admin routes under `/studio/${id}/...` that look similar and could be mistaken for the public page.
- The admin layout (`app/studio/[id]/layout.tsx`) wraps pages under `/studio/:id/*`, which means pages there will show the sidebar and admin UI.

Recommended canonical structure (low-risk)

1. Keep the visitor-facing route as `/studio/public/[id]` (current `app/studio/public/[id]/page.tsx`). This is what Explore should link to. It has the correct content for visitors (programs, enroll flows, contact info).

2. Keep admin pages under `/studio/[id]/*`:
   - `/studio/[id]/public` for server-side admin preview if you need a server view.
   - `/studio/[id]/public-profile` for client-side editing and preview controls.

3. Make the naming explicit where possible:
   - If you prefer a clearly different name for the visitor route, consider `/studio/view/[id]` or `/studio/:id/view` but this is optional.

Safe changes you can make now

- Find all links that should go to the visitor page and ensure they point to `/studio/public/${studio.id}` (not `/studio/${studio.id}/public` or `/studio/${studio.id}/public-profile`).
- Keep admin links (sidebar, management screens) pointing to `/studio/${studioId}/public-profile` or `/studio/${studioId}/public` as appropriate.
- Optionally add a short comment at the top of `app/studio/[id]/public/page.tsx` and `app/studio/public/[id]/page.tsx` clarifying intended audience (admin vs visitor).

Files I found that navigate to studio public pages (these are good candidates to double-check/update)

- `app/explore/page.tsx` — uses `router.push(`/studio/public/${studio.id}`)` (visitor route)  ✅ correct for visitors
- `components/studio/StudioSidebar.tsx` — links to `/studio/${studioId}/public-profile` (admin link) ✅ correct for admin
- `app/studio/[id]/public-profile/page.tsx` — uses `router.push(`/studio/${studioId}`)` for cancel/return (admin navigation) ✅ admin

If you want me to automatically update links (Option A)

- I can list every file that contains `studio/public` or `public-profile` and propose an exact set of replacements (show diff preview) and then apply them.
- This is low risk when we only replace incorrect visitor/admin inversions (for example, if a non-admin page links to `/studio/${id}/public` — we should swap it to `/studio/public/${id}`).

Next steps I can take for you

- A: Run a targeted search and show a precise list of files that currently link to `/studio/${studioId}/public` (or similar) and mark which should be changed to the visitor route. I already did a quick search; I can now show the concrete list and apply changes if you approve.
- B: Add redirect/guard logic to any admin route so non-admins visiting `/studio/:id/public` get forwarded to the visitor page (optional — alters runtime behavior).
- C: Add comments to the top of the two key files clarifying intent (visitor vs admin) — minimal change.

Laat me weten welke actie je wilt: A (lijst + vervang-optie), B (redirect/guard), of C (comment README + comments in code). Ik heb al `app/studio/README.md` toegevoegd met deze uitleg.