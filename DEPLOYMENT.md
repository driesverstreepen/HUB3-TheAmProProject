# Deployment Handleiding - Flow Manager

## Deployment naar Vercel (Aanbevolen)

Vercel is de aanbevolen hosting provider voor Next.js applicaties.

### Stap 1: Bereid je project voor

1. Zorg dat alle wijzigingen zijn gecommit en gepushed naar GitHub:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push
   ```

### Stap 2: Vercel Account

1. Ga naar [vercel.com](https://vercel.com)
2. Log in met je GitHub account
3. Klik op "Add New..." → "Project"

### Stap 3: Import Project

1. Selecteer je GitHub repository: `driesverstreepen/Flow-Manager`
2. Vercel detecteert automatisch dat het een Next.js project is
3. Klik op "Import"

### Stap 4: Configureer Environment Variables

Voeg de volgende environment variables toe:

```
NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key
```

**Hoe vind je deze waarden:**
1. Ga naar je Supabase project dashboard
2. Klik op Settings → API
3. Kopieer de "Project URL" en "anon public" key

### Stap 5: Deploy

1. Klik op "Deploy"
2. Wacht tot de build compleet is (±2 minuten)
3. Je app is nu live! 🎉

### Stap 6: Custom Domain (Optioneel)

1. Ga naar je project settings in Vercel
2. Klik op "Domains"
3. Voeg je custom domain toe
4. Volg de instructies om DNS in te stellen

---

## Deployment naar Netlify

### Stap 1: Netlify Account

1. Ga naar [netlify.com](https://netlify.com)
2. Log in met GitHub

### Stap 2: New Site

1. Klik "Add new site" → "Import an existing project"
2. Selecteer GitHub
3. Kies je repository

### Stap 3: Build Settings

```
Build command: npm run build
Publish directory: .next
```

### Stap 4: Environment Variables

Voeg toe onder "Site settings" → "Environment variables":
```
NEXT_PUBLIC_SUPABASE_URL=jouw-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-key
```

### Stap 5: Deploy

Klik "Deploy site" en wacht tot het klaar is.

---

## Deployment naar Railway

### Stap 1: Railway Account

1. Ga naar [railway.app](https://railway.app)
2. Log in met GitHub

### Stap 2: New Project

1. Klik "New Project"
2. Kies "Deploy from GitHub repo"
3. Selecteer je repository

### Stap 3: Environment Variables

Railway detecteert Next.js automatisch. Voeg environment variables toe:
```
NEXT_PUBLIC_SUPABASE_URL=jouw-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-key
```

### Stap 4: Deploy

Railway start automatisch met deployen.

---

## Deployment naar Render

### Stap 1: Render Account

1. Ga naar [render.com](https://render.com)
2. Maak een account aan

### Stap 2: New Web Service

1. Klik "New +" → "Web Service"
2. Connect je GitHub repository

### Stap 3: Configuratie

```
Name: flow-manager
Environment: Node
Build Command: npm install && npm run build
Start Command: npm start
```

### Stap 4: Environment Variables

Voeg toe:
```
NEXT_PUBLIC_SUPABASE_URL=jouw-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-key
NODE_VERSION=18
```

### Stap 5: Deploy

Klik "Create Web Service"

---

## Post-Deployment Checklist

Na succesvolle deployment:

- [ ] Test de live URL
- [ ] Verifieer dat authenticatie werkt
- [ ] Test studio pagina's
- [ ] Test programma pagina's
- [ ] Test inschrijvingsfunctionaliteit
- [ ] Controleer of alle afbeeldingen laden
- [ ] Test op verschillende apparaten
- [ ] Controleer browser console voor errors
- [ ] Verifieer dat Supabase connectie werkt

---

## Troubleshooting

### Build Fails

**Problem**: Build failed with errors
**Solution**: 
```bash
# Test lokaal eerst
npm run build
# Fix errors en push opnieuw
```

### Environment Variables Niet Gevonden

**Problem**: "NEXT_PUBLIC_SUPABASE_URL is not defined"
**Solution**: 
- Controleer dat je environment variables correct hebt toegevoegd
- Let op spelling en hoofdletters
- Redeploy na toevoegen variables

### 404 Errors

**Problem**: Pagina's geven 404 errors
**Solution**: 
- Controleer dat je Next.js App Router gebruikt
- Verifieer dat het publish directory correct is (`.next`)

### Database Connection Issues

**Problem**: Kan niet verbinden met Supabase
**Solution**:
- Verifieer Supabase credentials
- Check of je Supabase project actief is
- Controleer RLS policies in Supabase

### Slow Performance

**Problem**: App laadt traag
**Solution**:
- Enable caching in Vercel/Netlify
- Optimize afbeeldingen met next/image
- Check database query performance

---

## Monitoring

### Aanbevolen Tools

1. **Vercel Analytics** (gratis voor Vercel deployments)
   - Real-time traffic monitoring
   - Performance metrics
   - Error tracking

2. **Supabase Dashboard**
   - Database metrics
   - API usage
   - Auth metrics

3. **Sentry** (optioneel)
   - Error tracking
   - Performance monitoring
   - User feedback

### Setup Vercel Analytics

1. Ga naar je project in Vercel
2. Klik "Analytics" tab
3. Enable analytics
4. Done! Automatisch tracking actief

---

## CI/CD Workflow

Met Vercel/Netlify krijg je automatisch CI/CD:

```
Push naar GitHub
    ↓
Automatische build
    ↓
Automatische tests
    ↓
Preview deployment (branches)
    ↓
Production deployment (main)
```

**Preview URLs**: Elke branch krijgt een eigen preview URL voor testing.

---

## Kosten Overzicht

### Gratis Tier (Hobby)

**Vercel**:
- ✅ Onbeperkte deployments
- ✅ 100GB bandwidth
- ✅ Custom domains
- ✅ SSL certificates
- ✅ Analytics

**Supabase**:
- ✅ 500MB database
- ✅ 2GB file storage
- ✅ 50,000 monthly active users
- ✅ 2GB bandwidth

**Perfect voor:**
- Development
- Kleine projecten
- MVP's
- Hobby projecten

### Upgrade Overwegingen

Upgrade naar Pro wanneer je:
- Meer database storage nodig hebt
- Hogere traffic verwacht (>100GB/maand)
- Meer compute power nodig hebt
- Team features wilt

---

## Backup & Maintenance

### Database Backups (Supabase)

**Automatisch**:
- Dagelijkse backups op Pro plan
- Point-in-time recovery

**Handmatig**:
```bash
# Export via Supabase dashboard
# Settings → Database → Backups
```

### Code Backups

Je code staat veilig in GitHub. Zorg voor:
- Regular commits
- Beschrijvende commit messages
- Branches voor features

---

## Support & Resources

- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Next.js**: [nextjs.org/docs](https://nextjs.org/docs)

---

**🚀 Succes met je deployment!**
