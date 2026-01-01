# Migration 053 - Database Normalisatie Samenvatting

## ✅ Wat is aangepast

### 1. Nieuwe Migratie
**053_normalize_profile_tables.sql** gemaakt:
- Kopieert personal data van studio_admin_profiles naar user_profiles
- Verwijdert ALLE personal fields uit studio_admin_profiles
- studio_admin_profiles bevat nu ALLEEN: user_id, studio_id, organization_name

### 2. Code Aanpassingen

#### app/api/studios/create/route.ts
- Maakt nu user_profiles entry met personal data (first_name, last_name, email, phone)
- Maakt studio_admin_profiles entry met ALLEEN organization_name + studio_id
- Geen duplicatie meer van personal data

#### supabase/migrations/050_consolidate_profile_tables.sql
- studio_admin_profiles schema aangepast: ALLEEN organization_name + studio_id
- Geen personal fields meer (first_name, last_name, etc. verwijderd)

#### components/StudioProfilePage.tsx
- Gesplitst in twee state objecten:
  - `userProfile` (UserProfile type): personal data uit user_profiles
  - `studioProfile` (StudioAdminProfile type): studio-specific data uit studio_admin_profiles
- loadProfile() laadt beide tabellen apart
- handleSave() slaat beide tabellen apart op
- UI toont personal fields uit userProfile, studio fields uit studioProfile

### 3. Documentatie Updates
- MIGRATION_CLEANUP_INSTRUCTIONS.md: toegevoegd 053, uitleg genormaliseerde structuur
- DATABASE_CLEANUP_COMPLETED.md: alle verwijzingen naar oude structuur aangepast

## 📊 Nieuwe Data Structuur

### Voor ALLE users (inclusief studio admins)
**user_profiles**:
- user_id (PK)
- first_name, last_name
- date_of_birth, phone, email
- street, house_number, postal_code, city
- profile_completed
- created_at, updated_at

### Alleen voor studio admins (extensie op user_profiles)
**studio_admin_profiles**:
- user_id (PK)
- studio_id (FK)
- organization_name
- created_at, updated_at

### Role management
**user_roles**:
- user_id (PK)
- role ('user', 'studio_admin', 'teacher', 'super_admin')
- studio_id (nullable FK)
- created_at, updated_at

## 🎯 Voordelen van deze aanpak

1. **Geen duplicatie**: Personal data staat OP ÉÉN PLEK (user_profiles)
2. **Eenvoudig onderhoud**: Update first_name/last_name ÉÉN keer, niet in meerdere tabellen
3. **Consistent**: Alle users (regulier + studio admin) hebben zelfde data structuur
4. **Schaalbaar**: Als user later studio admin wordt, hoef je geen data te kopiëren

## 🚀 Next Steps

1. **Run migraties in volgorde**:
   - 050_consolidate_profile_tables.sql
   - 051_migrate_profile_data_from_user_roles.sql
   - 052_cleanup_user_roles.sql
   - **053_normalize_profile_tables.sql** ← NIEUW!

2. **Test je recente studio signup**:
   - Check Supabase: user_profiles moet first_name/last_name hebben
   - Check Supabase: studio_admin_profiles moet ALLEEN organization_name hebben (geen first_name!)
   - Test profile page: moet personal data tonen uit user_profiles

3. **Debug 500 errors**:
   - Check browser console Network tab voor response body
   - Check dev server logs (`npm run dev` terminal)
   - Waarschijnlijk oorzaak: oude code verwacht personal fields in studio_admin_profiles die nu niet meer bestaan

## 🔍 Verificatie Queries

Na migraties, run deze queries in Supabase SQL Editor:

```sql
-- Check of studio_admin_profiles GEEN personal fields meer heeft
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'studio_admin_profiles';
-- Should only show: user_id, studio_id, organization_name, created_at, updated_at

-- Check of alle users een user_profiles entry hebben
SELECT au.id, au.email, up.user_id as has_user_profile
FROM auth.users au
LEFT JOIN public.user_profiles up ON au.id = up.user_id
WHERE up.user_id IS NULL;
-- Should return 0 rows

-- Check je eigen studio admin data
SELECT 
  up.first_name, up.last_name, up.email,  -- from user_profiles
  sap.organization_name,                    -- from studio_admin_profiles
  ur.role, ur.studio_id                     -- from user_roles
FROM auth.users au
JOIN public.user_profiles up ON au.id = up.user_id
LEFT JOIN public.studio_admin_profiles sap ON au.id = sap.user_id
LEFT JOIN public.user_roles ur ON au.id = ur.user_id
WHERE au.email = 'jouw@email.com';  -- vervang met jouw email
```

## ⚠️ Breaking Changes

**Voor bestaande code die studio_admin_profiles gebruikt**:
- `first_name`, `last_name`, `email`, `phone`, `date_of_birth` zijn VERWIJDERD
- Deze velden komen nu uit `user_profiles` (JOIN required)
- Alleen `organization_name` blijft in `studio_admin_profiles`

**Componenten die update nodig hebben**:
- ✅ StudioProfilePage.tsx (DONE)
- ❓ Andere componenten die studio_admin_profiles direct lezen

**Voor nieuwe code**: Altijd personal data uit user_profiles halen, ongeacht of het een regular user of studio admin is.
