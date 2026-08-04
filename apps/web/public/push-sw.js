/* global self, clients */
self.addEventListener("push", (event) => {
  let data = { title: "TripLedger", body: "Trip updated", tripId: null };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data?.text() || data.body;
    } catch {
      /* ignore */
    }
  }

  const base = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || "TripLedger", {
      body: data.body || "Trip updated",
      icon: `${base}pwa-192x192.png`,
      badge: `${base}pwa-192x192.png`,
      data: {
        tripId: data.tripId,
        url: data.tripId ? `trips/${data.tripId}` : "",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tripId = event.notification.data?.tripId;
  const scope = self.registration.scope;
  const target = tripId ? new URL(`trips/${tripId}`, scope).href : scope;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    }),
  );
});
