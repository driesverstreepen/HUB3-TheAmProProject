# Next.js Best Practices voor HUB3

Dit document bevat belangrijke best practices en veelvoorkomende fouten om te voorkomen in dit Next.js project.

## 🔥 Kritieke Issues

### 1. `cookies()` is een Promise in Next.js 15+

**❌ FOUT - Dit werkt NIET:**
```typescript
import { cookies } from 'next/headers';

function createClient() {
  const cookieStore = cookies(); // ❌ cookies() retourneert een Promise!
  
  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value; // ❌ Compile error!
      },
    },
  });
}
```

**✅ CORRECT - Gebruik altijd `await`:**
```typescript
import { cookies } from 'next/headers';

async function createClient() {
  const cookieStore = await cookies(); // ✅ Await de Promise
  
  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value; // ✅ Werkt!
      },
    },
  });
}

// In je API route:
export async function POST(request: Request) {
  const supabase = await createClient(); // ✅ Await ook hier
  // ... rest van je code
}
```

### 2. `params` is ook een Promise in Next.js 15+

**❌ FOUT:**
```typescript
export async function GET(
  req: Request,
  { params }: { params: { studioId: string } }
) {
  const studioId = params.studioId; // ❌ Params is een Promise!
}
```

**✅ CORRECT:**
```typescript
export async function GET(
  req: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params; // ✅ Await de params
  // ... rest van je code
}
```

## 📋 Checklist voor nieuwe API Routes

Voordat je een nieuwe API route maakt, check het volgende:

- [ ] Gebruik je `cookies()`? → Zorg dat je functie `async` is en `await cookies()`
- [ ] Gebruik je `params`? → Declareer als `Promise<{ ... }>` en `await params`
- [ ] Maak je een Supabase client? → Gebruik `await createClient()`
- [ ] Gebruik je Stripe? → Gebruik API version `"2025-10-29.clover"`
- [ ] Test je de route lokaal voordat je commit?

## 🛠️ Stripe Configuration

**Correcte Stripe API versie:**

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-10-29.clover", // ✅ Use this version
});
```

**❌ FOUT - Verouderde API versie:**
```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia", // ❌ Dit veroorzaakt compile errors
});
```

## 🛠️ Supabase Client Pattern

**Aanbevolen patroon voor API routes:**

```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, '', options);
        },
      },
    },
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    // ... rest van je code
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## 🔍 Veelvoorkomende Errors

### Type error: Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'

**Oorzaak:** Je probeert `.get()` te gebruiken op een Promise zonder eerst `await` te gebruiken.

**Oplossing:** Voeg `await` toe voor `cookies()` en maak je functie `async`.

### Cannot read properties of undefined (reading 'studioId')

**Oorzaak:** Je probeert `params.studioId` te lezen zonder eerst `await params` te doen.

**Oplossing:** Declareer params als `Promise<{...}>` en gebruik `const { studioId } = await params`.

### Type '"2024-11-20.acacia"' is not assignable to type '"2025-10-29.clover"'

**Oorzaak:** Je gebruikt een verouderde Stripe API versie.

**Oplossing:** Update naar `apiVersion: "2025-10-29.clover"` in je Stripe instantie.

## 📚 Meer informatie

- [Next.js 15 Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading/version-15)
- [Dynamic APIs require awaiting](https://nextjs.org/docs/messages/sync-dynamic-apis)
- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)

---

**Laatste update:** 25 november 2025
