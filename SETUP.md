# Setup Handleiding voor Flow Manager

Deze handleiding helpt je om Flow Manager lokaal te installeren en te configureren.

## Vereisten

- Node.js 18+ geïnstalleerd
- Een Supabase account (gratis op [supabase.com](https://supabase.com))
- Git

## Stap 1: Clone het Project

```bash
git clone https://github.com/driesverstreepen/Flow-Manager.git
cd Flow-Manager
```

## Stap 2: Installeer Dependencies

```bash
npm install
```

## Stap 3: Supabase Project Aanmaken

1. Ga naar [supabase.com](https://supabase.com) en log in
2. Klik op "New Project"
3. Vul de project details in:
   - Naam: Flow Manager (of naar keuze)
   - Database wachtwoord: Kies een sterk wachtwoord
   - Regio: Kies de dichtsbijzijnde regio

## Stap 4: Database Schema Opzetten

1. In je Supabase dashboard, ga naar de **SQL Editor**
2. Klik op **New Query**
3. Kopieer de volledige inhoud van `supabase/migrations/001_initial_schema.sql`
4. Plak de SQL in de editor
5. Klik op **Run** om het schema aan te maken

Dit creëert alle tabellen, indexen, RLS policies en triggers die nodig zijn.

## Stap 5: API Keys Ophalen

1. In je Supabase dashboard, ga naar **Settings** > **API**
2. Zoek de volgende waarden:
   - **Project URL** (onder "Project API keys")
   - **anon/public key** (onder "Project API keys")

## Stap 6: Environment Variables Configureren

1. Kopieer het `.env.example` bestand naar `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` en vul je Supabase credentials in:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://jouwproject.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key-hier
   ```

## Stap 7: Development Server Starten

```bash
npm run dev
```

De applicatie is nu beschikbaar op [http://localhost:3000](http://localhost:3000)

## Stap 8: Test de Applicatie

### Account Aanmaken
1. Ga naar [http://localhost:3000/auth/registreer](http://localhost:3000/auth/registreer)
2. Maak een test account aan
3. Kies "Studio Beheerder" als je studio's wilt beheren

### Studio Aanmaken (via Supabase Dashboard)
Voor nu moet je studios handmatig aanmaken via Supabase:

1. Ga naar **Table Editor** in je Supabase dashboard
2. Selecteer de **studios** tabel
3. Klik op **Insert row**
4. Vul de studio details in:
   - naam: (verplicht)
   - beschrijving: (optioneel)
   - stad, postcode, telefoon, etc.: (optioneel)
   - eigenaar_id: Kopieer je user ID van de users tabel
5. Klik op **Save**

### Programma Aanmaken (via Supabase Dashboard)
1. Ga naar de **programs** tabel
2. Klik op **Insert row**
3. Vul de programma details in:
   - studio_id: ID van je studio
   - naam: (verplicht)
   - type: 'cursus' of 'workshop'
   - prijs, max_deelnemers, etc.: (optioneel)
   - actief: true
4. Klik op **Save**

Nu kun je:
- Studio's bekijken op `/studio`
- Programma's bekijken op `/programmas`
- Inschrijven voor programma's (als ingelogde gebruiker)

## Veelvoorkomende Problemen

### "Failed to fetch from Supabase"
- Controleer of je `.env.local` bestand correct is ingevuld
- Verifieer dat je Supabase project actief is
- Controleer of de API keys correct zijn

### "Permission denied" errors
- Controleer of RLS policies correct zijn opgezet
- Verifieer dat je user record bestaat in de `users` tabel
- Check je user role (studio_admin of user)

### Build errors
- Run `npm install` opnieuw

## Push notificaties (Web Push)

### Stap A: VAPID keys + env vars

Zet deze in `.env.local`:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

En kies zelf een sterke secret voor cron endpoints:

- `PUSH_CRON_SECRET` (bv. een random string van 32+ chars)

### Stap B: Supabase tabellen

Run in Supabase SQL Editor:

- [supabase/sql/push_subscriptions.sql](supabase/sql/push_subscriptions.sql)
- [supabase/sql/push_notification_log.sql](supabase/sql/push_notification_log.sql)

### Stap C: Testen

1. Log in en zet push aan in het meldingen-paneel.
2. Test push: `POST /api/push/test` (ingelogd).

### Stap D: Cron endpoints

Deze endpoints vereisen header `Authorization: Bearer <PUSH_CRON_SECRET>`:

- `POST /api/push/workshop-reminders`
- `POST /api/push/teacher-attendance-nudge`
- Verwijder `node_modules` en `.next` folders en installeer opnieuw
- Controleer Node.js versie (18+)

## Productie Deployment

### Vercel (Aanbevolen)
1. Push je code naar GitHub
2. Ga naar [vercel.com](https://vercel.com)
3. Import je GitHub repository
4. Voeg environment variables toe in de Vercel dashboard
5. Deploy!

### Andere Platforms
De applicatie kan ook gedeployed worden op:
- Netlify
- Railway
- Render
- DigitalOcean App Platform

Zorg ervoor dat je altijd de environment variables configureert!

## Volgende Stappen

- Voeg een admin dashboard toe voor studio beheerders
- Implementeer file uploads voor studio en programma afbeeldingen
- Voeg email notificaties toe
- Implementeer een betaalsysteem
- Bouw een kalender view voor lessen

## Support

Voor vragen en problemen, open een issue op GitHub of contacteer de maintainers.
