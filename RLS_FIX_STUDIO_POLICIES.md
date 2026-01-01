# Fix: Studio Policies RLS Error (42501)

## Probleem
Bij het genereren van een policy template krijg je de error:
```
new row violates row-level security policy for table "studio_policies"
Error code: 42501
```

## Oorzaak
De originele RLS policy in migratie 048 gebruikte `FOR ALL` met dezelfde conditie voor zowel `USING` als `WITH CHECK`. Dit kan problemen veroorzaken bij INSERT operaties omdat:
1. `USING` wordt gecheckt VOOR de operatie (of de user toegang heeft)
2. `WITH CHECK` wordt gecheckt NADAT de row is aangemaakt (of de nieuwe row voldoet aan de policy)

## Oplossing
Migratie 049 splitst de policy op in 4 aparte policies:
- `studio_policies_studio_admin_select` - Voor SELECT operaties
- `studio_policies_studio_admin_insert` - Voor INSERT operaties (alleen WITH CHECK)
- `studio_policies_studio_admin_update` - Voor UPDATE operaties (USING + WITH CHECK)
- `studio_policies_studio_admin_delete` - Voor DELETE operaties

## Uitvoeren Fix

### Stap 1: Run Migratie in Supabase
1. Open Supabase Dashboard → SQL Editor
2. Copy de inhoud van `supabase/migrations/049_fix_studio_policies_rls.sql`
3. Run de query
4. Verify: Check dat de oude policy `studio_policies_studio_admin_all` is verwijderd en 4 nieuwe policies zijn aangemaakt

### Stap 2: Test Generate Template
1. Ga naar Settings → Legal & Policies
2. Klik op "Generate Template"
3. Confirm de modal
4. Template zou nu moeten worden aangemaakt zonder RLS error

## Verificatie User Roles
Je logs laten zien dat:
- ✅ User is authenticated: `aac9dd28-3b67-4f17-a093-dfa4947a73fa`
- ✅ User heeft 1 role in user_roles table
- ✅ Studio ID: `d517cb28-f65f-4785-a2d6-18c62cd3d115`

Na het uitvoeren van migratie 049 zou alles moeten werken!

## Debug Info
Als het nog steeds niet werkt na de migratie, check in Supabase:

```sql
-- Check user roles
SELECT * FROM user_roles 
WHERE user_id = 'aac9dd28-3b67-4f17-a093-dfa4947a73fa';

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'studio_policies';

-- Test INSERT permission directly
SELECT auth.uid(); -- Should return your user ID
SELECT * FROM user_roles WHERE user_id = auth.uid();
```
