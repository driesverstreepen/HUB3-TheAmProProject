# Quick Fixes - Migration 051 & Consent Registratie

## ✅ Issue 1: Migration 051 Error Opgelost

**Probleem**: 
```
ERROR: column "first_name" of relation "studio_admin_profiles" does not exist
```

**Oorzaak**: 
Migratie 050 had `first_name`, `last_name` etc. al verwijderd uit `studio_admin_profiles`, maar migratie 051 probeerde die kolommen nog te vullen.

**Oplossing**:
051 aangepast zodat:
- ALLE user data (ook studio admins) naar `user_profiles` gaat
- `studio_admin_profiles` krijgt ALLEEN `user_id` + `studio_id` (geen personal data)
- Geen `first_name`, `last_name` meer in studio_admin_profiles insert

**Run nu opnieuw**:
1. 050_consolidate_profile_tables.sql
2. **051_migrate_profile_data_from_user_roles.sql** (FIXED!)
3. 052_cleanup_user_roles.sql
4. 053_normalize_profile_tables.sql

---

## ✅ Issue 2: Consent Registratie Verbeterd

**Probleem**: 
Consent checkbox wordt aangevinkt bij signup, maar wordt alleen geregistreerd als er active `legal_documents` zijn in de database.

**Oplossing**:
`app/WelcomePage.tsx` aangepast:
- ✅ Consent registratie werkt nu voor BEIDE signup modes (user + studio)
- ✅ Als geen legal_documents in DB: registreert generic consents (v1.0)
- ✅ Logging toegevoegd om te verifiëren dat consents worden opgeslagen
- ✅ Alleen als `agreedToTermsModal === true` worden consents geregistreerd

**Verificatie na signup**:
```sql
-- Check of jouw consent is geregistreerd
SELECT * FROM public.user_consents 
WHERE user_id = 'jouw-user-id'
ORDER BY created_at DESC;

-- Expected result: 2 rows
-- 1. document_type='terms_of_service', consent_given=true
-- 2. document_type='privacy_policy', consent_given=true
```

---

## 🧪 Test Procedure

### Test 1: User Signup met Consent
```
1. Open welcome page
2. Click "Join as member"
3. Fill form + check consent checkbox
4. Submit
5. Check browser console: "Consents recorded for user: [id] Documents: 2"
6. Check Supabase user_consents table: should have 2 rows
```

### Test 2: Studio Signup met Consent
```
1. Open welcome page
2. Click "Create your studio"
3. Toggle to studio mode + fill studio fields
4. Check consent checkbox
5. Submit
6. Check browser console: "Consents recorded for user: [id] Documents: 2"
7. Check Supabase user_consents table: should have 2 rows
8. Check user_profiles: should have personal data
9. Check studio_admin_profiles: should have ONLY organization_name + studio_id
```

### Test 3: Signup ZONDER Consent Checkbox
```
1. Open welcome page
2. Fill signup form
3. DON'T check consent checkbox
4. Try to submit
5. Should show error: "Je moet akkoord gaan met de Terms of Service..."
6. Should NOT create user or record consents
```

---

## 📊 Verwachte Database State na Migraties + Signup

### user_profiles (ALL users)
```sql
user_id | first_name | last_name | email | phone | ... | profile_completed
--------|------------|-----------|-------|-------|-----|------------------
uuid-1  | John       | Doe       | j@... | ...   | ... | true
```

### studio_admin_profiles (studio admins only)
```sql
user_id | studio_id | organization_name | created_at
--------|-----------|-------------------|------------
uuid-1  | studio-1  | My Dance Studio   | 2025-11-01
```
**LET OP**: GEEN first_name, last_name, email, phone!

### user_roles (relationships)
```sql
user_id | role          | studio_id | created_at
--------|---------------|-----------|------------
uuid-1  | studio_admin  | studio-1  | 2025-11-01
```
**LET OP**: GEEN first_name, last_name!

### user_consents (GDPR)
```sql
user_id | document_type     | document_version | consent_given | created_at
--------|-------------------|------------------|---------------|------------
uuid-1  | terms_of_service  | 1.0              | true          | 2025-11-01
uuid-1  | privacy_policy    | 1.0              | true          | 2025-11-01
```

---

## 🔍 Debug Commands

Als signup faalt, check deze dingen:

**1. Browser Console Logs**:
```
[WelcomePage] Consents recorded for user: [id] Documents: 2
[WelcomePage] studio created successfully
```

**2. Supabase SQL Queries**:
```sql
-- Check if user was created
SELECT * FROM auth.users WHERE email = 'test@example.com';

-- Check if user_profiles entry exists
SELECT * FROM public.user_profiles WHERE user_id = '[id]';

-- Check if consents were recorded
SELECT * FROM public.user_consents WHERE user_id = '[id]';

-- Check if studio was created (for studio signup)
SELECT * FROM public.studios WHERE eigenaar_id = '[id]';

-- Check if studio_admin_profiles entry exists (for studio signup)
SELECT * FROM public.studio_admin_profiles WHERE user_id = '[id]';
```

**3. Dev Server Logs**:
```bash
# In terminal where npm run dev is running
# Look for:
[/api/studios/create] Success!
[/api/studios/create] studio_admin_profiles upsert error: ...
```

---

## 🚀 Next Steps

1. ✅ Run alle 4 migraties (050, 051, 052, 053)
2. ✅ Test signup flows (user + studio)
3. ✅ Verify consents worden geregistreerd in user_consents
4. ✅ Verify data landed in correct tables (user_profiles vs studio_admin_profiles)
5. ❓ Debug de 500 errors (check Network tab + server logs)
