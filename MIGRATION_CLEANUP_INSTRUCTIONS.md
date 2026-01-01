# Database Cleanup Migratie Instructies

## Probleem
De database bevat profile data verspreid over meerdere tabellen (user_roles, user_profiles, studio_admin_profiles). Dit veroorzaakt verwarring en bugs bij signup/login flows.

## Oplossing
Vier migraties die de data scheiden en normaliseren:
- **050_consolidate_profile_tables.sql**: Maakt schone versies van user_profiles en studio_admin_profiles
- **051_migrate_profile_data_from_user_roles.sql**: Verhuist bestaande profile data uit user_roles naar juiste tabel
- **052_cleanup_user_roles.sql**: Verwijdert profile kolommen uit user_roles
- **053_normalize_profile_tables.sql**: Elimineert duplicatie - user_profiles wordt single source voor ALL personal data

## Uitvoer Volgorde (in Supabase SQL Editor)

### Stap 1: Backup maken
```sql
-- Optioneel: export huidige data
SELECT * FROM public.user_roles;
SELECT * FROM public.user_profiles;
SELECT * FROM public.studio_admin_profiles;
```

### Stap 2: Run migraties in volgorde

**A. Run 050_consolidate_profile_tables.sql**
- Dit drop en recreate `user_profiles` en `studio_admin_profiles` met correcte schema
- `user_profiles`: voor reguliere gebruikers (user_id PK → auth.users)
- `studio_admin_profiles`: voor studio owners (user_id PK → auth.users, studio_id FK)

**B. Run 051_migrate_profile_data_from_user_roles.sql**
- Kopieert first_name, last_name van `user_roles` naar:
  - `studio_admin_profiles` voor users met role='studio_admin'
  - `user_profiles` voor alle andere users
- Maakt lege user_profiles entries aan voor users die nog geen profiel hebben

**C. Run 052_cleanup_user_roles.sql**
- Verwijdert `first_name` en `last_name` kolommen uit `user_roles`
- user_roles bevat nu ALLEEN role relaties (user_id, role, studio_id)

**D. Run 053_normalize_profile_tables.sql**
- Kopieert alle personal data naar user_profiles (als nog niet aanwezig)
- Verwijdert ALLE personal fields uit studio_admin_profiles
- studio_admin_profiles bevat nu ALLEEN studio-specifieke velden (organization_name, studio_id)
- **Resultaat**: user_profiles = single source of truth voor ALL users (regulier + studio admins)

### Stap 3: Verificatie

Na migraties, check of data correct is verdeeld:

```sql
-- Check user_roles (should have NO first_name/last_name columns)
SELECT * FROM public.user_roles LIMIT 5;

-- Check user_profiles (regular users)
SELECT * FROM public.user_profiles LIMIT 5;

-- Check studio_admin_profiles (studio owners)
SELECT * FROM public.studio_admin_profiles LIMIT 5;

-- Verify no orphaned users
SELECT au.id, au.email,
       up.user_id as in_user_profiles,
       sap.user_id as in_studio_admin_profiles
FROM auth.users au
LEFT JOIN public.user_profiles up ON au.id = up.user_id
LEFT JOIN public.studio_admin_profiles sap ON au.id = sap.user_id
WHERE up.user_id IS NULL AND sap.user_id IS NULL;
```

## Oude Migraties Aangepast

De volgende oude migraties zijn aangepast om consistent te zijn:
- **009_create_user_roles.sql**: Verwijderd first_name, last_name kolommen
- **042_fix_user_roles_composite_key.sql**: Verwijderd first_name, last_name kolommen
- **033_create_studio_admin_profiles.sql**: Geüpdate naar single PK (user_id) ipv composite key

**LET OP:** Als je een bestaande database hebt die deze oude migraties al draaide, zullen de oude versies profile velden hebben aangemaakt. De nieuwe migraties 050-052 fixen dit.

## Nieuwe Table Structuur

### auth.users
Beheerd door Supabase Auth - raak niet aan
- id (uuid PK)
- email
- created_at
- etc.

### public.user_profiles
Voor ALLE gebruikers (reguliere users + studio admins)
- user_id (uuid PK → auth.users.id)
- first_name, last_name, date_of_birth, phone, email
- street, house_number, postal_code, city
- profile_completed (boolean)
- created_at, updated_at

### public.studio_admin_profiles
Voor studio account eigenaren - ALLEEN studio-specifieke data
- user_id (uuid PK → auth.users.id)
- studio_id (uuid FK → studios.id)
- organization_name
- created_at, updated_at

**BELANGRIJK**: Personal data (first_name, last_name, etc.) staat NIET in studio_admin_profiles.
Voor studio admins: haal personal data uit user_profiles, studio-specifieke data uit studio_admin_profiles.

### public.user_roles
ALLEEN role relaties - GEEN profile data
- user_id (uuid PK → auth.users.id)
- role (text: 'user', 'studio_admin', 'teacher', 'super_admin')
- studio_id (uuid nullable FK → studios.id)
- created_at, updated_at

## Code Aanpassingen Nodig

Na het runnen van de migraties moet de app code aangepast worden:

1. **Signup flows** (`app/WelcomePage.tsx`):
   - Bij user signup: maak entry in user_profiles (personal data) + user_roles (role='user')
   - Bij studio signup: maak entry in user_profiles (personal data) + studio_admin_profiles (organization_name) + user_roles (role='studio_admin')

2. **API endpoints** (`app/api/studios/create/route.ts`):
   - Maak user_profiles entry met personal data
   - Maak studio_admin_profiles entry met ALLEEN organization_name + studio_id
   - Maak user_roles entry met role='studio_admin' + studio_id

3. **Profile pages**:
   - Haal personal data uit user_profiles (voor ALLE users, ook studio admins)
   - Voor studio admins: haal studio-specifieke data uit studio_admin_profiles
   - Check role via user_roles

**BELANGRIJK**: Studio admins hebben data in 3 tabellen:
- user_profiles: first_name, last_name, email, phone, etc.
- studio_admin_profiles: organization_name, studio_id
- user_roles: role='studio_admin', studio_id

## Troubleshooting

**"relation user_profiles already exists"**
- Normale waarschuwing als migratie 020/022 al gerund was
- Migration 050 drop/recreate zorgt voor schone staat

**"foreign key constraint violation"**
- Check of alle user_ids in user_roles bestaan in auth.users
- Run: `DELETE FROM public.user_roles WHERE user_id NOT IN (SELECT id FROM auth.users);`

**"profile data is missing after migration"**
- Controleer of migratie 051 succesvol was
- Check of user_roles nog steeds first_name/last_name had voor de migratie

## Volgende Stappen

Na succesvolle migratie:
1. Test signup flow (user + studio)
2. Test profile pages
3. Test studio settings
4. Commit en push nieuwe migraties naar git
