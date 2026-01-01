import webpush from 'web-push'

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

export function getVapidConfig() {
  return {
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
    publicKey: requiredEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    privateKey: requiredEnv('VAPID_PRIVATE_KEY'),
  }
}

export function configureWebPush() {
  const { subject, publicKey, privateKey } = getVapidConfig()
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return webpush
}

export type PushPayload = {
  title: string
  body?: string
  url?: string
}

export async function sendPush(subscription: any, payload: PushPayload) {
  const wp = configureWebPush()
  return wp.sendNotification(subscription, JSON.stringify(payload))
}
