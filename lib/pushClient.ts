function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported() {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false
  if (!('Notification' in window)) return false

  // Some browsers (notably Safari/iOS variations) may not expose `PushManager` on `window`
  // even though `registration.pushManager` exists.
  const hasPushManagerOnWindow = 'PushManager' in window
  const hasPushManagerOnRegistration =
    typeof (window as any).ServiceWorkerRegistration !== 'undefined' &&
    'pushManager' in (window as any).ServiceWorkerRegistration.prototype

  return hasPushManagerOnWindow || hasPushManagerOnRegistration
}

export async function ensureServiceWorker() {
  if (!isPushSupported()) return null
  return navigator.serviceWorker.register('/sw.js')
}

export async function getExistingSubscription() {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push not supported in this browser')

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  if (!publicKey) {
    throw new Error(
      'Push-config ontbreekt: NEXT_PUBLIC_VAPID_PUBLIC_KEY (herstart `npm run dev` nadat je .env(.local) aanpaste)'
    )
  }

  await ensureServiceWorker()

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted')
  }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  return subscription
}

export async function saveSubscription(subscription: PushSubscription) {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Failed to save subscription (${res.status})`)
  }
}

export async function deleteSubscription(endpoint: string) {
  const res = await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })

  if (res.ok) return

  // Some deployments/proxies don't allow DELETE and return 404/405.
  if (res.status === 404 || res.status === 405) {
    const fallback = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })

    if (fallback.ok) return

    const body = await fallback.json().catch(() => ({}))
    throw new Error(body?.error || `Failed to delete subscription (${fallback.status})`)
  }

  // If it's already gone, treat it as success.
  if (res.status === 410) return

  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error || `Failed to delete subscription (${res.status})`)
}
