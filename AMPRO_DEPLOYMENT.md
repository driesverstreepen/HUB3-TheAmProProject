# AmProProject – Separate deploy (APP_MODE=ampro)

Doel: een publiek AmPro gedeelte (performances), met een login-gated dancer portal, volledig gescheiden van HUB3.

## Wat is geïmplementeerd

- Route-separatie via `proxy.ts`:
  - `APP_MODE=ampro`:
    - `/` redirect → `/ampro`
    - alleen `/ampro/*` en `/api/ampro/*` zijn bereikbaar
    - alle andere routes redirecten naar `/ampro` (of 404 voor `/api/*`)
  - `APP_MODE=hub3` (default):
    - `/ampro/*` en `/api/ampro/*` geven 404
- AmPro pages:
  - `/ampro` (landing)
  - `/ampro/programmas` (publiek)
  - `/ampro/login` + `/ampro/signup` (Supabase auth)
  - `/ampro/user` (login vereist; client-side session check)
  - `/ampro/admin` (placeholder; login vereist)

## Database (AmPro Supabase project)

Er staat een starter migratie klaar in:
- `supabase/migrations/200_ampro_init.sql`

### Migratie toepassen (simpelste)

1. Ga in je nieuwe Supabase project naar **SQL Editor**
2. Plak de volledige inhoud van `supabase/migrations/200_ampro_init.sql`
3. Run de query

### Eerste admin instellen

Maak eerst een account aan via `/ampro/signup` (in de AmPro deploy). Daarna:

1. Supabase → **Authentication** → Users → kopieer je `id` (uuid)
2. SQL Editor:

```sql
insert into public.ampro_user_roles (user_id, role)
values ('<PASTE_USER_UUID_HERE>', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Daarna kunnen we de echte admin UI bouwen (performances/forms/review/updates).

## Vereiste env vars

Gebruik voor AmPro een **aparte Supabase project** (zodat dancers later niet op HUB3 kunnen inloggen).

### HUB3 deploy (bestaand)
- `APP_MODE=hub3`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

### AmPro deploy (nieuw)
- `APP_MODE=ampro`
- `NEXT_PUBLIC_AMPRO_SUPABASE_URL`
- `NEXT_PUBLIC_AMPRO_SUPABASE_ANON_KEY`
- `AMPRO_SUPABASE_SERVICE_ROLE_KEY` (server-only; enkel nodig voor admin-only server reads)

## Deploy advies

- Maak een **tweede Vercel project** dat naar dezelfde repo wijst.
- Zet in dat project `APP_MODE=ampro` + de AmPro Supabase env vars.
- Zet in de HUB3 deployment `APP_MODE=hub3` (of laat default).

## Security notes

- Commit nooit echte secrets in `.env`.
- Rotate je Supabase service-role key en Stripe keys als ze ooit publiek zijn geweest.
