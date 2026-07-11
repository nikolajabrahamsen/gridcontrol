// GridControl service worker – håndterer push-notifikationer
// Denne fil SKAL ligge som selvstændig fil ved siden af appen (samme mappe) på GitHub.

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Modtag en push fra serveren og vis en notifikation
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "GridControl", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "GridControl";
  const options = {
    body: data.body || "",
    icon: data.icon || "gridcontrol-icon-192.png",
    badge: data.badge || "gridcontrol-icon-192.png",
    tag: data.tag || "gridcontrol-notif",
    data: { url: data.url || "." },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Åbn/fokusér appen når man trykker på notifikationen
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || ".";
  const isDoc = /^https?:\/\//.test(targetUrl) && !targetUrl.endsWith("/");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Er det et dokument-link (fx en PDF)? Åbn det direkte i en ny fane.
      if (isDoc && self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      // Ellers: fokusér appen hvis den er åben, og bed den navigere til rette sted.
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "notif-click", url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
