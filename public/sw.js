/* Web Push service worker (very small + framework-agnostic) */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'HUB3', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'HUB3';
  const options = {
    body: payload.body || '',
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if ('focus' in client) {
          try {
            await client.focus();
            client.navigate(url);
            return;
          } catch {
            // ignore
          }
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(url);
      }
    })(),
  );
});
