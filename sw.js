// This is the service worker file (sw.js)

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let data = {};
  if (event.data) {
    try {
      // Attempt to parse the data as JSON
      data = event.data.json();
    } catch (e) {
      // If parsing fails, treat it as text
      data = { title: 'Nova Notificação', body: event.data.text() };
    }
  }

  const title = data.title || 'Nova Notificação';
  const options = {
    body: data.body || 'Você tem uma nova mensagem.',
    icon: '/icon.png', // Optional: Path to an icon image
    badge: '/badge.png', // Optional: Path to a badge image
  };

  // Show the notification
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');

  // Close the notification pop-up
  event.notification.close();

  // Focus the existing window or open a new one
  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    }).then((clientList) => {
      // If a window for this app is already open, focus it
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});