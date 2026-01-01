# Flow Manager - Quick Start Guide

## Voor Nieuwe Developers

### Minimale Setup (5 minuten)

1. **Clone & Install**
   ```bash
   git clone https://github.com/driesverstreepen/Flow-Manager.git
   cd Flow-Manager
   npm install
   ```

2. **Supabase Setup**
   - Ga naar [supabase.com](https://supabase.com)
   - Maak nieuw project aan
   - Run SQL in `supabase/migrations/001_initial_schema.sql`
   - Kopieer Project URL en Anon Key

3. **Environment**
   ```bash
   cp .env.example .env.local
   # of (soms handiger lokaal):
   # cp .env.example .env
   # Vul je Supabase credentials in (NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY)
   ```

4. **Start**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

### Belangrijke Bestanden

```
📁 Flow-Manager/
├── 📄 README.md              ← Start hier voor complete info
├── 📄 SETUP.md               ← Gedetailleerde setup instructies
├── 📄 ARCHITECTURE.md        ← Technische details
├── 📄 PROJECT_SUMMARY.md     ← Deliverables overzicht
│
├── 📁 app/
│   ├── WelcomePage.tsx       ← Homepage (app/page.tsx re-exports this)
│   ├── layout.tsx            ← Root layout met navigatie
│   ├── 📁 auth/              ← Login & registratie
│   ├── 📁 studio/            ← Studio pagina's
│   ├── 📁 programmas/        ← Programma overzicht
│   └── 📁 api/               ← Backend API routes
│
├── 📁 lib/
│   └── supabase.ts           ← Supabase configuratie
│
├── 📁 types/
│   └── database.ts           ← TypeScript types
│
├── 📁 supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  ← Database schema
│
└── 📁 components/
    └── ProgramCard.tsx       ← Voorbeeld component
```

## Common Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build voor productie
npm start            # Start productie server
npm run lint         # Run linter

# Database (in Supabase dashboard)
# Ga naar SQL Editor en run migrations
```

## Snelle Test Flow

1. **Start app**: `npm run dev`
2. **Maak account**: http://localhost:3000/auth/registreer
3. **Login**: http://localhost:3000/auth/login
4. **Bekijk studios**: http://localhost:3000/studio
5. **Bekijk programma's**: http://localhost:3000/programmas

*Note: Je moet eerst test data aanmaken in Supabase dashboard*

## Test Data Aanmaken

### Studio (in Supabase Table Editor)
```
Table: studios
- naam: "Yoga Studio Amsterdam"
- beschrijving: "Beste yoga studio in Amsterdam"
- stad: "Amsterdam"
- eigenaar_id: [je user id]
```

### Programma (in Supabase Table Editor)
```
Table: programs
- studio_id: [je studio id]
- naam: "Beginners Yoga"
- type: "cursus"
- prijs: 150.00
- actief: true
```

## Hulp Nodig?

- 📖 **Uitgebreide documentatie**: Zie README.md
- 🔧 **Setup problemen**: Zie SETUP.md
- 🏗️ **Architectuur vragen**: Zie ARCHITECTURE.md
- 📊 **Project overzicht**: Zie PROJECT_SUMMARY.md

## Database Schema (Snel Overzicht)

```
 users (profiel + role)
  ↓
studios (naam, info, eigenaar)
  ↓
programs (cursus/workshop)
  ↓
  ├── lessons (lessen)
  └── inschrijvingen (met users)
```

## API Endpoints

```http
GET  /api/studios              # Lijst alle studios
POST /api/studios              # Maak studio
GET  /api/programs             # Lijst programma's
POST /api/programs             # Maak programma
GET  /api/inschrijvingen       # Lijst inschrijvingen
POST /api/inschrijvingen       # Maak inschrijving
```

## Deployment (1-Click)

### Vercel (Aanbevolen)
1. Push naar GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy! ✅

## Tech Stack (Snel)

- **Frontend**: Next.js 16 + TypeScript + Tailwind
- **Backend**: Supabase (PostgreSQL + Auth)
- **Deployment**: Vercel recommended

---

**Happy Coding! 🚀**
