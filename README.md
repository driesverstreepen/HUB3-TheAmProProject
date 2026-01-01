# HUB3

HUB3 is een Nederlandse webapp voor studio management gebouwd met Next.js en Supabase. Het platform stelt studio's in staat om cursussen en workshops te beheren, terwijl gebruikers zich kunnen registreren en inschrijven voor programma's.

## Functionaliteiten

- **Authenticatie**: Volledige authenticatie via Supabase Auth met drie rollen:
  - `studio_owner`: Eigenaars van een studio profiel
  - `studio_admin`: Beheerders die studio's en programma's kunnen aanmaken en beheren
  - `user`: Gebruikers die zich kunnen inschrijven voor programma's

- **Studio Management**: 
  - Studio profielpagina's met volledige informatie
  - Overzicht van alle beschikbare studio's
  - Studio-specifieke programma lijsten

- **Programma's (Cursussen & Workshops)**:
  - Twee types: Cursussen en Workshops
  - Uitgebreide programma informatie (beschrijving, prijs, data, max deelnemers)
  - Filter functionaliteit op programma type

- **Inschrijvingen**:
  - Gebruikers kunnen zich inschrijven voor programma's
  - Status tracking (actief, geannuleerd, voltooid)
  - Automatische validatie via database constraints

## Tech Stack

- **Frontend**: Next.js 16 (App Router) met TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL database + Auth)
- **ORM**: Supabase Client

## Database Schema

De applicatie gebruikt de volgende database tabellen:

1. **users** - Gebruikersprofielen (uitbreiding van auth.users)
2. **studios** - Studio informatie en profielen
3. **programs** - Cursussen en workshops
4. **lessons** - Individuele lessen binnen programma's
5. **inschrijvingen** - Programma inschrijvingen door gebruikers

Het volledige SQL schema is beschikbaar in `supabase/migrations/001_initial_schema.sql`

## Project Structuur

```
Flow-Manager/
├── app/
│   ├── api/               # API routes
│   │   ├── studios/       # Studio endpoints
│   │   ├── programs/      # Program endpoints
│   │   └── inschrijvingen/ # Inschrijving endpoints
│   ├── auth/              # Authenticatie pagina's
│   │   ├── login/         # Login pagina
│   │   └── registreer/    # Registratie pagina
│   ├── studio/            # Studio pagina's
│   │   └── [id]/          # Studio detail pagina
│   ├── programmas/        # Programma overzicht
│   ├── layout.tsx         # Root layout met navigatie
│   ├── page.tsx           # Homepage
│   └── globals.css        # Globale styles
├── components/            # Herbruikbare componenten
├── lib/
│   └── supabase.ts        # Supabase client configuratie
├── types/
│   └── database.ts        # TypeScript type definities
├── supabase/
│   └── migrations/        # Database migrations
│       └── 001_initial_schema.sql
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Setup Instructies

### 1. Installeer Dependencies

```bash
npm install
```

### 2. Supabase Project Setup

1. Maak een nieuw project aan op [supabase.com](https://supabase.com)
2. Ga naar SQL Editor in je Supabase dashboard
3. Kopieer en voer de SQL uit `supabase/migrations/001_initial_schema.sql` uit
4. Kopieer je Project URL en Anon Key van Settings > API

### 3. Environment Variables

Maak een `.env.local` bestand aan in de root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=jouw-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in je browser.

## Gebruik

### Voor Gebruikers

1. **Registreren**: Ga naar `/auth/registreer` en maak een account aan als "Gebruiker"
2. **Inloggen**: Log in via `/auth/login`
3. **Bekijk Studios**: Ga naar `/studio` om alle studios te bekijken
4. **Bekijk Programma's**: Ga naar `/programmas` voor een overzicht van alle programma's
5. **Inschrijven**: Klik op "Schrijf je in" bij een programma

### Voor Studio Admins

1. **Registreren**: Maak een account aan als "Studio Beheerder"
2. **Studio Aanmaken**: Gebruik de Supabase interface of API om een studio aan te maken
3. **Programma's Beheren**: Voeg cursussen en workshops toe aan je studio
4. **Inschrijvingen Bekijken**: Bekijk wie zich heeft ingeschreven voor je programma's

## API Endpoints

### Studios
- `GET /api/studios` - Haal alle studios op
- `POST /api/studios` - Maak een nieuwe studio aan

### Programs
- `GET /api/programs` - Haal alle actieve programma's op
- `POST /api/programs` - Maak een nieuw programma aan

### Inschrijvingen
- `GET /api/inschrijvingen?user_id={id}` - Haal inschrijvingen op (optioneel gefilterd op user)
- `POST /api/inschrijvingen` - Maak een nieuwe inschrijving aan

## Security

De applicatie gebruikt Supabase Row Level Security (RLS) om data te beschermen:

- Gebruikers kunnen alleen hun eigen profiel en inschrijvingen bekijken/updaten
- Studio admins kunnen alleen hun eigen studio's en programma's beheren
- Alle gebruikers kunnen publieke studio's en programma's bekijken
- Inschrijvingen zijn beschermd per gebruiker

## Development

### Build voor Productie

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Toekomstige Uitbreidingen

- Dashboard voor studio admins
- Betaling integratie
- Email notificaties
- Kalender weergave voor lessen
- Review en rating systeem
- Upload en beheer van afbeeldingen
- Zoekfunctionaliteit

## Licentie

ISC