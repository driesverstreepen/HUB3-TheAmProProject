# Checkout Flows: Free vs Paid Programs

## Overzicht

Flow Manager ondersteunt twee checkout flows afhankelijk van de `accepts_payment` waarde van programma's in het winkelmandje:

### 1. **Gratis Checkout Flow** (standaard)
Voor programma's waar `accepts_payment = FALSE` (of niet ingesteld).

**Flow:**
```
Programma toevoegen → Winkelmandje → [Inschrijven] → Formulieren (indien gekoppeld) → Mijn Lessen
```

**Kenmerken:**
- Geen externe betaling vereist
- Direct enrollment creatie via server-side RPC (`complete_checkout`)
- Groene "Inschrijven (Gratis)" knop in checkout
- Geen betaalmethode selectie
- Redirect naar enrollment forms of direct naar /mijn-lessen

---

### 2. **Betaalde Checkout Flow**
Voor programma's waar `accepts_payment = TRUE`.

**Flow:**
```
Programma toevoegen → Winkelmandje → [Naar betaling] → Stripe Checkout → Webhook → Enrollments → Formulieren → Mijn Lessen
```

**Kenmerken:**
- Externe betaling via Stripe vereist
- Betaalmethode selectie (iDEAL, Credit Card)
- Blauwe "Betaal €X.XX" knop in checkout
- Stripe sessie start (nog te implementeren)
- Na succesvolle betaling: enrollment creatie via webhook of callback
- Redirect naar enrollment forms of /mijn-lessen

---

## Decision Logic

Het systeem bepaalt welke flow te gebruiken aan de hand van **winkelmandje-niveau checks**:

```typescript
// lib/cartPaymentUtils.ts
const requiresPayment = cartItems.some(item => item.program.accepts_payment === true);
```

**Regels:**
- ✅ **Alle items gratis** (`accepts_payment = false`) → Gebruik gratis flow
- ⚠️ **Minimaal 1 betaald item** (`accepts_payment = true`) → Gebruik betaalde flow (zelfs bij mixed carts)

---

## Implementatie Details

### Database Schema

**Migration:** `supabase/migrations/020_add_accepts_payment_to_programs.sql`

```sql
ALTER TABLE programs 
ADD COLUMN accepts_payment BOOLEAN NOT NULL DEFAULT FALSE;
```

**TypeScript Type:** `types/database.ts`

```typescript
export interface Program {
  // ... andere velden
  accepts_payment?: boolean; // Default: false
}
```

---

### Studio Admin UI

**Bestand:** `app/studio/[id]/programs/page.tsx`

Studio admins kunnen per programma instellen of betalingen geaccepteerd worden via een checkbox:

```tsx
<input
  type="checkbox"
  checked={formData.accepts_payment || false}
  onChange={(e) => setFormData({ ...formData, accepts_payment: e.target.checked })}
/>
```

**Label tekst:**
- ✅ Aangevinkt: "Deelnemers moeten online betalen via Stripe voordat ze zich kunnen inschrijven"
- ⬜ Niet aangevinkt: "Dit programma is gratis - deelnemers kunnen direct inschrijven zonder betaling"

---

### Checkout Page Logic

**Bestand:** `app/checkout/[cartId]/page.tsx`

De checkout pagina gebruikt `checkCartRequiresPayment()` helper functie om de flow te bepalen:

```typescript
const paymentInfo = await checkCartRequiresPayment(cartId);

if (paymentInfo.requiresPayment) {
  // Toon betaalmethode selectie + "Betaal" knop
  processPaidCheckout();
} else {
  // Toon groene "Inschrijven (Gratis)" knop
  processFreeCheckout();
}
```

**Free Checkout Handler:**
```typescript
const processFreeCheckout = async () => {
  const res = await fetch('/api/checkout/complete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cartId }),
  });
  
  // Redirect naar formulieren of /mijn-lessen
};
```

**Paid Checkout Handler (TODO):**
```typescript
const processPaidCheckout = async () => {
  // TODO: Start Stripe Checkout sessie
  // const session = await stripe.checkout.sessions.create({ ... });
  // window.location.href = session.url;
  
  // Na payment success webhook:
  // - Call /api/checkout/complete
  // - Redirect naar formulieren of /mijn-lessen
};
```

---

## Stripe Integration (TO-DO)

### Wat nog moet gebeuren voor betalingen:

1. **Stripe account setup:**
   - Maak Stripe account aan
   - Haal API keys op (publishable + secret)
   - Sla keys op in `.env.local`:
     ```
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
     STRIPE_SECRET_KEY=sk_test_...
     ```

2. **Install Stripe SDK:**
   ```bash
   npm install stripe @stripe/stripe-js
   ```

3. **Create Checkout Session API route:**
   ```typescript
   // app/api/checkout/create-session/route.ts
   export async function POST(req: Request) {
     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
     const { cartId } = await req.json();
     
     // Load cart items
     // Create Stripe checkout session
     const session = await stripe.checkout.sessions.create({
       mode: 'payment',
       line_items: [...],
       success_url: `${process.env.NEXT_PUBLIC_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
       cancel_url: `${process.env.NEXT_PUBLIC_URL}/checkout/${cartId}`,
     });
     
     return Response.json({ url: session.url });
   }
   ```

4. **Update processPaidCheckout:**
   ```typescript
   const processPaidCheckout = async () => {
     const res = await fetch('/api/checkout/create-session', {
       method: 'POST',
       body: JSON.stringify({ cartId }),
     });
     const { url } = await res.json();
     window.location.href = url; // Redirect to Stripe
   };
   ```

5. **Stripe Webhook endpoint:**
   ```typescript
   // app/api/webhooks/stripe/route.ts
   export async function POST(req: Request) {
     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
     const sig = req.headers.get('stripe-signature')!;
     const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
     
     if (event.type === 'checkout.session.completed') {
       const session = event.data.object;
       // Extract cartId from metadata
       // Call complete_checkout RPC
     }
     
     return Response.json({ received: true });
   }
   ```

6. **Configure Stripe Dashboard:**
   - Ga naar Developers → Webhooks
   - Voeg webhook endpoint toe: `https://yourdomain.com/api/webhooks/stripe`
   - Selecteer event: `checkout.session.completed`

---

## Testing Checklist

### Scenario 1: Gratis programma (free flow)
- [ ] Admin maakt programma aan met `accepts_payment = false` (default)
- [ ] User voegt programma toe aan cart
- [ ] Checkout toont "Gratis programma's" banner
- [ ] Checkout knop is groen: "Inschrijven (Gratis)"
- [ ] Na klik: enrollment wordt direct aangemaakt
- [ ] Redirect naar formulieren (indien gekoppeld) of /mijn-lessen

### Scenario 2: Betaald programma (paid flow)
- [ ] Admin maakt programma aan met `accepts_payment = true`
- [ ] User voegt programma toe aan cart
- [ ] Checkout toont betaalmethode selectie (iDEAL/CC)
- [ ] Checkout knop is blauw: "Betaal €X.XX"
- [ ] Na klik: alert "Stripe nog niet geïmplementeerd" (voor nu)
- [ ] Na Stripe integratie: redirect naar Stripe, betaal, enrollment aangemaakt

### Scenario 3: Mixed cart (1+ betaald item)
- [ ] User voegt 1 gratis + 1 betaald programma toe
- [ ] Checkout detecteert betaalde flow vereist
- [ ] Checkout toont betaalmethode selectie
- [ ] Totaal toont prijs van betaalde programma's
- [ ] Na betaling: enrollments voor ALLE items aangemaakt

---

## API Endpoints

### POST `/api/checkout/complete`
Atomische enrollment creatie + cart completion.

**Request:**
```json
{
  "cartId": "uuid"
}
```

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "inserted": [
    { "id": "uuid", "program_id": "uuid", "status": "actief" | "pending_forms" }
  ]
}
```

**Gebruikt voor:**
- Gratis checkout (direct na knop klik)
- Betaalde checkout (na Stripe webhook/callback)

---

## Database RPC Function

**Function:** `complete_checkout(p_cart_id uuid, p_user_id uuid, p_enrollments jsonb)`

**Logica:**
1. Valideer cart ownership (`cart.user_id = p_user_id`)
2. Insert enrollments vanuit `p_enrollments` array
3. Update cart status naar `'completed'`
4. Return inserted enrollment records

**Locatie:** `supabase/migrations/003_complete_checkout.sql`

---

## Samenvatting

| Aspect | Gratis Flow | Betaalde Flow |
|--------|-------------|---------------|
| **Trigger** | `accepts_payment = false` (default) | `accepts_payment = true` |
| **Button** | "Inschrijven (Gratis)" (groen) | "Betaal €X.XX" (blauw) |
| **Payment UI** | Verborgen | Betaalmethode selectie |
| **External Service** | Geen | Stripe Checkout |
| **Enrollment Timing** | Direct na knop klik | Na betaling callback |
| **Server Endpoint** | `/api/checkout/complete` | `/api/checkout/complete` (na Stripe) |
| **Status** | ✅ Geïmplementeerd | ⚠️ Placeholder (Stripe TO-DO) |

---

## Volgende Stappen

1. ✅ Database migration uitvoeren (`020_add_accepts_payment_to_programs.sql`)
2. ✅ Testen: maak gratis programma's aan en test checkout flow
3. ⏳ Stripe account aanmaken en configureren
4. ⏳ Stripe SDK installeren en checkout session API bouwen
5. ⏳ Webhook endpoint implementeren voor payment completion
6. ⏳ End-to-end testen met betaalde programma's

---

**Laatst bijgewerkt:** 30 oktober 2025  
**Auteur:** GitHub Copilot
