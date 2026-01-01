# Database Cleanup - Voltooide Aanpassingen

## ✅ Wat is er gedaan?

### Nieuwe Migraties (4 bestanden)
1. **050_consolidate_profile_tables.sql** - Maakt schone user_profiles + studio_admin_profiles (studio-specific fields only)
2. **051_migrate_profile_data_from_user_roles.sql** - Verhuist bestaande data naar juiste tabellen
3. **052_cleanup_user_roles.sql** - Verwijdert profile kolommen uit user_roles
4. **053_normalize_profile_tables.sql** - **BELANGRIJK**: Elimineert duplicatie door personal data uit studio_admin_profiles te verwijderen

### 2. Oude Migraties Aangepast
- **009_create_user_roles.sql**: Verwijderd first_name, last_name kolommen + FK naar auth.users
- **042_fix_user_roles_composite_key.sql**: Verwijderd first_name, last_name kolommen + FK naar auth.users
- **033_create_studio_admin_profiles.sql**: Aangepast naar single PK (user_id) ipv composite key

### 3. Code Aangepast

#### app/WelcomePage.tsx
**handleSignup():**
- Bij studio signup zonder immediate session: sla pendingStudio op in localStorage
- Bij studio signup met immediate session: direct studio aanmaken via API

**handleLogin():**
- Check localStorage voor pendingStudio
- Als gevonden: maak studio aan via API met user_id + access_token
- Clear localStorage na succesvolle creatie

#### app/api/studios/create/route.ts
**Nieuwe functionaliteit:**
- Accepteert nu `user_id` direct (naast bestaande `access_token` flow)
- Maakt `studio_admin_profiles` entry aan met personal data
- `user_roles` entry bevat nu GEEN profile velden meer (alleen user_id, role, studio_id)

## 📋 Nieuwe Table Structuur

### auth.users (Supabase managed)
```sql
id (uuid PK)
email
created_at
```

### public.user_profiles (reguliere gebruikers + studio admins)
```sql
user_id (uuid PK → auth.users.id)
first_name, last_name
date_of_birth, phone, email
street, house_number, house_number_addition
postal_code, city
profile_completed (boolean)
created_at, updated_at
```

### public.studio_admin_profiles (ALLEEN studio-specifieke data)
```sql
user_id (uuid PK → auth.users.id)
studio_id (uuid FK → studios.id)
organization_name
created_at, updated_at
```
**LET OP**: GEEN first_name, last_name, email etc. - die staan in user_profiles!

### public.user_roles (ALLEEN relaties)
```sql
user_id (uuid PK → auth.users.id)
role (text: 'user', 'studio_admin', 'teacher', 'super_admin')
studio_id (uuid nullable FK → studios.id)
created_at, updated_at
```

## 🔄 Signup & Login Flows

### User Signup Flow
1. User vult signup form in (signupMode='user')
2. supabase.auth.signUp() → maakt auth.users entry
3. Insert in user_profiles (first_name, last_name, birthDate, email)
4. Insert in user_roles (role='user')
5. Record GDPR consents in user_consents
6. Open login modal met prefilled email

### Studio Signup Flow (met immediate session)
1. User vult signup form in (signupMode='studio') + studio velden
2. supabase.auth.signUp() → maakt auth.users entry
3. Insert in user_profiles (first_name, last_name, email, phone) ← personal data
4. getSession() → heeft access_token
5. POST /api/studios/create met access_token + studio data
6. Server:
   - Validates token
   - Inserts studio
   - Upserts user_roles (role='studio_admin', studio_id)
   - Upserts studio_admin_profiles (organization_name, studio_id) ← ALLEEN studio data
   - Ensures user_profiles exists met personal data
7. Record GDPR consents
8. Open login modal

### Studio Signup Flow (zonder immediate session - email confirmation)
1-3. Zelfde als hierboven
4. getSession() → GEEN access_token (email confirmation required)
5. Save pendingStudio in localStorage:
   ```json
   {
     "studio": { "name": "...", "location": "...", "email": "...", "phoneNumber": "..." },
     "firstName": "...",
     "lastName": "..."
   }
   ```
6. Record GDPR consents
7. Open login modal

### Login Flow (met pendingStudio)
1. User logt in
2. Check localStorage voor pendingStudio
3. Als gevonden:
   - Get access_token from session
   - POST /api/studios/create met access_token + user_id + pendingStudio data
   - Remove pendingStudio from localStorage
4. Check user_roles voor role + studio_id
5. Redirect naar /studio/[id] of /explore

## 🧪 Testen

### Test 1: User Signup
```
1. Open welcome page
2. Click "Join as member" 
3. Fill in form (signupMode blijft 'user')
4. Submit
5. Verify: user_profiles entry created
6. Verify: user_roles entry met role='user'
7. Login
8. Verify: redirect naar /explore
```

### Test 2: Studio Signup (met immediate session)
```
1. Open welcome page
2. Click "Create your studio"
3. Fill in form + toggle naar 'studio'
4. Fill in studio fields
5. Submit
6. Verify console: "studio created successfully"
7. Verify: studios entry created
8. Verify: user_profiles entry met first_name, last_name, email, phone
9. Verify: studio_admin_profiles entry met ALLEEN organization_name + studio_id
10. Verify: user_roles entry met role='studio_admin' + studio_id
11. Login
12. Verify: redirect naar /studio/[id]
```

### Test 3: Studio Signup (zonder session - pendingStudio)
```
1. In Supabase Auth settings: enable email confirmation
2. Open welcome page in incognito
3. Click "Create your studio"
4. Fill in form + toggle naar 'studio'
5. Fill in studio fields
6. Submit
7. Verify console: "No access token after signup; saving studio data"
8. Verify localStorage: pendingStudio object present
9. Confirm email (click link in inbox)
10. Return to site and login
11. Verify console: "Found pending studio, creating now..."
12. Verify: studio created, user_roles + studio_admin_profiles entries
13. Verify localStorage: pendingStudio removed
14. Verify: redirect naar /studio/[id]
```

## 🚀 Volgende Stappen

### Voor jou:
1. ✅ Run migraties in Supabase SQL Editor (volg MIGRATION_CLEANUP_INSTRUCTIONS.md) - **inclusief 053!**
2. ✅ Test alle signup/login flows
3. ✅ Verify data lands in correct tables (user_profiles voor ALL users, studio_admin_profiles ALLEEN organization_name)
4. ✅ Commit en push naar git

### Als je errors ziet:
- Check browser console voor detailed logs
- Check Supabase logs in dashboard
- Check RLS policies (alle nieuwe tables hebben RLS enabled)
- Voor policy DELETE issues: dev-only debug dump in SettingsClient.tsx helpt

### Future improvements:
- Update alle profile pages om personal data te halen uit user_profiles (voor ALLE users, ook studio admins)
- Update alle studio admin queries: personal data uit user_profiles, studio data uit studio_admin_profiles
- Update alle admin/studio queries om user_roles alleen voor role checks te gebruiken
- Add automated tests voor signup/login flows
- Add email templates voor email confirmation flow

## 📝 Notes

- **public.users table**: Deze bestaat nog steeds in oude migraties maar is DEPRECATED. Nieuwe code gebruikt auth.users + user_profiles. Mogelijk in toekomst verwijderen na migratie van oude data.

- **RLS policies**: Alle nieuwe tables hebben strict RLS - users kunnen alleen eigen profiles zien/bewerken. Studio admins kunnen profiles van andere admins in zelfde studio zien.

- **localStorage pendingStudio**: Cleared na succesvolle studio creation. Als login faalt, blijft het in localStorage totdat login succesvol is.

- **Error handling**: Server endpoint logged alle errors naar console. Client logged naar browser console. Voor productie: implementeer proper error tracking (Sentry, etc.)
