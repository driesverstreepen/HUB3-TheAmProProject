# Login & WebSocket Troubleshooting

## "WebSocket is closed due to suspension" errors

Deze errors (`ws://localhost:3000/_next/webpack-hmr` en Supabase realtime WebSocket) zijn meestal **niet** veroorzaakt door code-issues, maar door browser/netwerk-omstandigheden:

### Veel voorkomende oorzaken

1. **Browser tab suspension (achtergrond tabs)**

   - Chrome/Safari pauzeren achtergrondtabs en sluiten WebSockets
   - **Fix**: werk in een actieve tab, of open incognito venster

2. **Mac slaapstand / wake-up**

   - Na wake-up uit slaapstand zijn netwerk-verbindingen vaak verbroken
   - **Fix**: herlaad de pagina volledig (Cmd+R of Cmd+Shift+R voor hard refresh)

3. **Dev-server herstart**

   - Als `npm run dev` herstart (code change, crash), worden HMR WebSockets verbroken
   - **Fix**: wacht tot de dev-server volledig opnieuw draait, herlaad pagina

4. **VPN / Netwerk switches**

   - VPN aan/uit, WiFi switch, netwerk instabiliteit
   - **Fix**: herlaad pagina, of stop/start dev-server

5. **Browser extensions (ad-blockers, privacy tools)**
   - Sommige extensions blokkeren WebSocket-verbindingen
   - **Fix**: test in incognito-modus zonder extensions

### Snelle fixes (probeer in deze volgorde)

```bash
# 1. Hard refresh in browser
# macOS: Cmd+Shift+R
# Windows/Linux: Ctrl+Shift+R

# 2. Stop en herstart dev-server
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
npm run dev

# 3. Test in nieuw incognito venster
# Chrome: Cmd+Shift+N
# Safari: Cmd+Shift+N

# 4. Check of dev-server echt draait
lsof -i :3000
curl http://localhost:3000/

# 5. Check browser console voor andere errors
# Open DevTools → Console → kijk naar rode errors vóór de WebSocket errors
```

### Als login nog steeds niet werkt

1. **Check Supabase tabellen bestaan**:

   - Run de migrations in `/supabase/migrations/` (vooral 045 en 046)
   - Controleer in Supabase SQL Editor:
     ```sql
     SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
     AND tablename IN ('user_roles', 'user_profiles', 'sub_profiles', 'studio_memberships');
     ```

2. **Check RLS policies**:

   - Als `user_roles` RLS enabled heeft, moet je migration 045 gedraaid hebben
   - Test query in Supabase SQL Editor (als admin):
     ```sql
     SELECT * FROM public.user_roles LIMIT 5;
     ```

3. **Check browser console logs**:

   - Login page print gedetailleerde `[Login]` debug logs
   - Kijk naar:
     - `[Login] signInWithPassword completed` → succesvol?
     - `[Login] Role data:` → is roleData null/undefined?
     - `[Login] Redirecting ...` → welke redirect gebeurt?

4. **Test credentials**:

   - Zorg dat je test-user bestaat in Supabase Auth (auth.users)
   - Check of de user een entry heeft in `user_roles` (run restore script als nodig)

5. **Check environment variables**:
   ```bash
   # In project root:
   cat .env.local
   # Moet bevatten:
   # NEXT_PUBLIC_SUPABASE_URL=https://...
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

### WebSocket errors negeren (development-only)

De WebSocket "suspension" errors **blokkeren de login niet** — ze betekenen alleen dat:

- HMR (hot reload) tijdelijk niet werkt → gewoon pagina herladen
- Supabase realtime (notifications) tijdelijk niet werkt → notificaties komen niet live binnen

Je kunt inloggen en de app gebruiken ondanks deze warnings.

---

## Login flow diagram (current)

```
User enters email + password
  ↓
supabase.auth.signInWithPassword()
  ↓ (success)
Check user_roles table (safeSelect)
  ↓
If role === 'super_admin' → redirect /admin
If role === 'studio_admin' → redirect /studio/{id}
Else → redirect /explore (default user)
```

Als `user_roles` niet bestaat of leeg is → fallback naar `/explore`.

---

## Laatste wijzigingen (relevant voor login issues)

- **045_enable_rls_user_roles.sql**: RLS enabled op `user_roles` + `admin_users` helper tabel
  -- **046_create_placeholder_memberships_and_dependents.sql**: placeholder tabellen voor `studio_memberships` en `sub_profiles`
- **lib/supabaseHelpers.ts**: `safeSelect` / `safeInsert` / `safeDelete` helpers die PGRST205 (missing table) errors afvangen
- **Login page**: gebruikt nu `safeSelect` voor `user_roles` query, met fallback naar `/explore` als tabel niet bestaat

Als je deze migrations **niet** hebt gedraaid, kan login falen met DB errors. Run ze in Supabase SQL Editor.
