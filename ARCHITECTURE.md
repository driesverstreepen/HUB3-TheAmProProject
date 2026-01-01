# Flow Manager - Architectuur Documentatie

## Overzicht

Flow Manager is een full-stack web applicatie gebouwd met moderne JavaScript technologieën. De applicatie volgt een serverless architectuur met Supabase als backend-as-a-service.

## Tech Stack Details

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Taal**: TypeScript 5.x
- **Styling**: Tailwind CSS 4.x
- **State Management**: React Hooks + Supabase Real-time
- **Routing**: Next.js App Router (file-based routing)

### Backend
- **BaaS**: Supabase
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **Storage**: (Toekomstig: Supabase Storage voor afbeeldingen)

### Development Tools
- **Package Manager**: npm
- **Linter**: ESLint (Next.js config)
- **Type Checking**: TypeScript
- **Build Tool**: Next.js (Turbopack)

## Database Schema Architectuur

### Tabellen Relaties

```
auth.users (Supabase Auth)
    ↓
users (public)
    ↓
    ├── studios (eigenaar_id)
    │   ↓
    │   programs (studio_id)
    │       ↓
    │       ├── lessons (program_id)
    │       └── inschrijvingen (program_id)
    │
    └── inschrijvingen (user_id)
```

### Row Level Security (RLS)

#### Users Tabel
- **SELECT**: Users kunnen hun eigen profiel zien + iedereen kan alle users zien (voor public profiles)
- **UPDATE**: Users kunnen alleen hun eigen profiel updaten

#### Studios Tabel
- **SELECT**: Publiek toegankelijk (iedereen kan studios zien)
-- **INSERT**: Alleen studio_admin role
- **UPDATE**: Alleen eigenaar van de studio

#### Programs Tabel
- **SELECT**: Publiek toegankelijk
- **ALL**: Alleen eigenaar van het gekoppelde studio

#### Lessons Tabel
- **SELECT**: Publiek toegankelijk
- **ALL**: Alleen eigenaar van het gekoppelde studio (via programs)

#### Inschrijvingen Tabel
- **SELECT**: Alleen eigen inschrijvingen + studio admins van gekoppelde programma's
- **INSERT**: Alle ingelogde users
- **UPDATE**: Alleen eigen inschrijvingen

## Folder Structuur

```
/app
  /api                    # Server-side API routes
    /studios              # Studio CRUD endpoints
    /programs             # Program CRUD endpoints
    /inschrijvingen       # Inschrijving CRUD endpoints
  /auth                   # Authenticatie flows
    /login                # Login pagina
    /registreer           # Registratie pagina
  /studio                 # Studio gerelateerde pagina's
    /[id]                 # Dynamische studio detail pagina
  page.tsx                # Homepage (re-exports `WelcomePage.tsx`)
  /studio
    page.tsx              # Studio overzicht
  /programmas             # Programma overzicht pagina
  layout.tsx              # Root layout met navigatie
  WelcomePage.tsx         # Homepage component (rendered via `app/page.tsx`)
  globals.css             # Globale styling

/lib
  supabase.ts             # Supabase client configuratie

/types
  database.ts             # TypeScript type definities

/supabase
  /migrations             # Database migration scripts
    001_initial_schema.sql

/components               # Herbruikbare React componenten (leeg voor nu)
```

## Data Flow

### Authenticatie Flow

1. **Registratie**:
   ```
   User Input → Supabase Auth signUp() → auth.users record
   → Trigger user record in public.users
   ```

2. **Login**:
   ```
   User Input → Supabase Auth signInWithPassword()
   → Session Cookie → User redirect
   ```

3. **Authorization**:
   ```
   Request → Supabase Client → RLS Check → Data Return/Deny
   ```

### Data Fetching Pattern

#### Client Components (CSR)
```typescript
'use client'
// Uses Supabase client directly
const { data } = await supabase.from('studios').select('*')
```

#### API Routes (SSR)
```typescript
// Uses createSupabaseClient helper
const supabase = createSupabaseClient()
const { data } = await supabase.from('studios').select('*')
```

## API Routes

### RESTful Design

```
GET    /api/studios              - Lijst alle studios
POST   /api/studios              - Maak nieuwe studio
GET    /api/programs             - Lijst alle actieve programma's
POST   /api/programs             - Maak nieuw programma
GET    /api/inschrijvingen       - Lijst inschrijvingen (gefilterd op user)
POST   /api/inschrijvingen       - Maak nieuwe inschrijving
```

### Response Format

Succesvolle responses:
```json
{
  "studios": [...],
  // of
  "studio": {...}
}
```

Error responses:
```json
{
  "error": "Error message"
}
```

## State Management

De applicatie gebruikt een simpele state management strategie:

1. **Local State**: React useState voor UI state
2. **Server State**: Direct fetching van Supabase
3. **Auth State**: Supabase Auth session management

Voor toekomstige uitbreiding kan overwogen worden:
- React Query/SWR voor caching
- Zustand/Jotai voor global state
- Supabase Real-time subscriptions

## Security Overwegingen

### Implemented
✅ Row Level Security (RLS) op alle tabellen
✅ Type checking met TypeScript
✅ Environment variables voor secrets
✅ Input validation via database constraints
✅ HTTPS enforcement (via Supabase)

### Todo
⚠️ Rate limiting op API routes
⚠️ CSRF protection
⚠️ Input sanitization op frontend
⚠️ File upload validation
⚠️ Audit logging

## Performance Optimizatie

### Current
- Static page generation waar mogelijk
- Server-side rendering voor dynamische content
- Tailwind CSS voor minimal CSS bundle

### Future Optimizations
- Image optimization (next/image)
- Code splitting per route
- Database indexing optimalisatie
- CDN voor static assets
- Caching strategies (SWR/React Query)
- Lazy loading van componenten

## Testing Strategy (Todo)

Aanbevolen test setup:
```
- Unit tests: Vitest
- Integration tests: Playwright
- E2E tests: Playwright/Cypress
- API tests: Supertest
```

## Deployment

### Development
```bash
npm run dev        # Start dev server op localhost:3000
```

### Production Build
```bash
npm run build      # Build voor productie
npm start          # Start production server
```

### Recommended Hosting
- **Frontend**: Vercel (native Next.js support)
- **Backend**: Supabase (managed PostgreSQL)
- **CDN**: Vercel Edge Network

## Environment Variables

### Required
```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anonymous key
```

### Optional (Future)
```
SUPABASE_SERVICE_ROLE_KEY     # Voor admin operaties
SMTP_HOST                     # Email service
STRIPE_SECRET_KEY             # Betalingen
```

## Lokale Stripe webhook testing (aanbevolen: Stripe CLI)

Tijdens ontwikkeling is het handig om Stripe webhooks lokaal te testen zonder een publieke tunnel zoals ngrok. De aanbevolen manier is de Stripe CLI die events veilig naar je lokale dev-server doorstuurt.

Stappen (Stripe CLI):

1. Zorg dat je dev server draait:

```bash
npm run dev
```

2. Login bij Stripe en start de forwarder:

```bash
stripe login
stripe listen --forward-to http://localhost:3000/api/stripe/webhook --events checkout.session.completed,payment_intent.succeeded
```

3. De CLI geeft een webhook signing secret (whsec_...) weer. Kopieer die waarde en voeg deze toe aan je lokale omgeving (`.env.local`) of plak hem in de Super Admin UI onder Stripe → Webhook Secret:

```
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

4. Trigger een test event (optioneel) om je webhook te controleren:

```bash
stripe trigger checkout.session.completed
```

Belangrijke opmerkingen:
- Je hoeft met Stripe CLI geen publieke HTTPS URL in de Dashboard te registreren — de CLI forwardt events rechtstreeks naar je lokale endpoint.
- Zorg dat `SUPABASE_SERVICE_ROLE_KEY` beschikbaar is in je dev-omgeving omdat de webhook handler server-side writes uitvoert.
- Gebruik test-keys (`sk_test_...`, `pk_test_...`) tijdens ontwikkeling. Plaats secrets in `.env.local` en commit deze nooit.

Als je liever ngrok of een staging-server gebruikt, kun je in plaats daarvan een publieke HTTPS URL registreren in de Stripe Dashboard (bv. `https://abcd1234.ngrok.app/api/stripe/webhook`).


## Monitoring & Logging (Todo)

Aanbevolen tools:
- **Error tracking**: Sentry
- **Analytics**: Vercel Analytics / Google Analytics
- **Performance**: Lighthouse CI
- **Uptime**: UptimeRobot
- **Logs**: Supabase Logs / Vercel Logs

## Toekomstige Architectuur Overwegingen

### Microservices
Als de applicatie groeit, kunnen specifieke features worden uitgesplitst:
- Payment service (Stripe integration)
- Email service (SendGrid/Mailgun)
- Notification service (Push notifications)
- Analytics service (Custom reporting)

### Caching Layer
- Redis voor session management
- CDN caching voor static assets
- Database query caching

### Search Optimization
- Full-text search in PostgreSQL
- Elasticsearch voor advanced search
- Algolia voor instant search

## Code Conventies

### Naming
- **Componenten**: PascalCase (e.g., `StudioCard.tsx`)
- **Files**: kebab-case (e.g., `studio-card.tsx`)
- **Variables**: camelCase (e.g., `studioName`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_PROGRAMS`)

### TypeScript
- Altijd expliciete types voor functie parameters
- Gebruik interfaces voor object shapes
- Vermijd `any` type

### React
- Use functional components
- Use hooks voor state en side effects
- Keep components small en focused

### CSS (Tailwind)
- Gebruik utility classes
- Maak custom components voor herhaalde patterns
- Volg mobile-first approach
