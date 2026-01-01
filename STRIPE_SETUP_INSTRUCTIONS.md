# Stripe Subscription Setup Instructies

## Stap 1: Producten en Prijzen aanmaken in Stripe Dashboard

Ga naar je Stripe Dashboard (https://dashboard.stripe.com) en maak de volgende producten aan:

### 1. HUB3 Basic
- **Product naam:** HUB3 Basic
- **Beschrijving:** Basic tier voor studio management
- **Prijzen toevoegen:**
  - **Maandelijks:** €5.00 EUR, recurring monthly
  - **Jaarlijks:** €50.00 EUR, recurring yearly

### 2. HUB3 Plus
- **Product naam:** HUB3 Plus
- **Beschrijving:** Plus tier met extra features
- **Prijzen toevoegen:**
  - **Maandelijks:** €10.00 EUR, recurring monthly
  - **Jaarlijks:** €100.00 EUR, recurring yearly

### 3. HUB3 Pro
- **Product naam:** HUB3 Pro
- **Beschrijving:** Pro tier met alle features
- **Prijzen toevoegen:**
  - **Maandelijks:** €15.00 EUR, recurring monthly
  - **Jaarlijks:** €120.00 EUR, recurring yearly

## Stap 2: Price IDs verzamelen

Na het aanmaken krijg je **Price IDs** voor elke prijs. Deze beginnen met `price_`.

Bijvoorbeeld:
- Basic Monthly: `price_1234567890abcdef`
- Basic Yearly: `price_0987654321fedcba`
- etc.

## Stap 3: Price IDs toevoegen aan .env

Update je `.env` bestand met de echte Price IDs:

```env
STRIPE_PRICE_BASIC_MONTHLY=price_xxx_basic_monthly
STRIPE_PRICE_BASIC_YEARLY=price_xxx_basic_yearly
STRIPE_PRICE_PLUS_MONTHLY=price_xxx_plus_monthly
STRIPE_PRICE_PLUS_YEARLY=price_xxx_plus_yearly
STRIPE_PRICE_PRO_MONTHLY=price_xxx_pro_monthly
STRIPE_PRICE_PRO_YEARLY=price_xxx_pro_yearly
```

## Stap 4: Webhook configureren

1. Ga naar **Developers** → **Webhooks** in Stripe Dashboard
2. Klik op **Add endpoint**
3. Endpoint URL: `https://jouw-domain.com/api/stripe/webhook`
4. Selecteer events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Kopieer de **Signing secret** (begint met `whsec_`)
6. Update `STRIPE_WEBHOOK_SECRET` in je `.env` bestand

## Stap 5: Testen in development

Voor lokaal testen gebruik de Stripe CLI:

```bash
# Installeer Stripe CLI (eenmalig)
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks naar lokale server
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

De CLI geeft een webhook signing secret voor development. Gebruik deze in je lokale `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxx_development
```

## Stap 6: Flow testen

### Trial flow (geen betaling):
1. Start signup als studio
2. Vul gegevens in
3. Kies "14 dagen gratis proberen"
4. Account wordt aangemaakt
5. Studio krijgt Pro features voor 14 dagen

### Betaalde plan flow:
1. Start signup als studio
2. Vul gegevens in
3. Kies "Direct een plan kiezen"
4. Selecteer tier (Basic/Plus/Pro) en periode (maandelijks/jaarlijks)
5. Klik "Account aanmaken"
6. **Je wordt doorgestuurd naar Stripe Checkout**
7. Vul test creditcard gegevens in:
   - Card: `4242 4242 4242 4242`
   - Datum: Elke toekomstige datum
   - CVC: Elke 3 cijfers
8. Na succesvolle betaling wordt je doorgestuurd naar studio dashboard
9. Webhook update subscription status naar 'active'

## Database Schema

De subscription kolommen zijn al toegevoegd aan de `studios` tabel (zie `add_studio_subscriptions.sql`):

- `subscription_tier`: 'basic' | 'plus' | 'pro'
- `subscription_status`: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
- `subscription_period`: 'monthly' | 'yearly'
- `trial_end_date`: Timestamp voor trial einde
- `stripe_customer_id`: Stripe Customer ID
- `stripe_subscription_id`: Stripe Subscription ID

## Test Cards

Voor development/test mode gebruik deze kaarten:

- **Succesvol:** `4242 4242 4242 4242`
- **Betaling mislukt:** `4000 0000 0000 0002`
- **3D Secure vereist:** `4000 0027 6000 3184`
- **iDEAL (NL):** Selecteer iDEAL als betaalmethode in Checkout

## Belangrijke URLs

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs/payments/checkout
- Test Cards: https://stripe.com/docs/testing

## Troubleshooting

### "Stripe Price IDs not configured" error
- Controleer of alle Price IDs in `.env` correct zijn ingevuld
- Herstart de development server na het updaten van `.env`

### Webhook events komen niet aan
- Check Stripe Dashboard → Developers → Webhooks → Logs
- Voor development: zorg dat `stripe listen` draait
- Voor production: check of de webhook URL correct is en bereikbaar

### Subscription status niet geupdate
- Check webhook logs in Stripe Dashboard
- Check console logs in je applicatie
- Controleer of `STRIPE_WEBHOOK_SECRET` correct is
