// This is the service worker file (sw.js)

// Listener for incoming push notifications from a server
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let data = {};
  if (event.data) {
    try {
      // Attempt to parse the data as JSON
      data = event.data.json();
    } catch (e) {
      // If parsing fails, treat it as text
      data = { title: 'New Notification', body: event.data.text() };
    }
  }

  const title = data.title || 'New Notification';
  const options = {
    body: data.body || 'You have a new message.',
    icon: '/icon.png', // Optional: Path to an icon image
    badge: '/badge.png', // Optional: Path to a badge image
  };

  // Show the notification
  event.waitUntil(self.registration.showNotification(title, options));
});

// Listener for clicks on notifications
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
        // A more robust check for the client URL might be needed depending on the app's routing
        if ('focus' in client) {
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

// Listener for messages from the client (e.g., from App.tsx)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_TEST_NOTIFICATION') {
    console.log('[Service Worker] Received request to show a test notification.');
    event.waitUntil(
      self.registration.showNotification('Test Notification', {
        body: 'This is a test notification triggered from the app!',
        icon: '/icon.png',
      })
    );
  }
});
