/* eslint-disable no-undef */
// File ini auto-generated dari scripts/generate-firebase-sw.mjs.
// Jangan isi FIREBASE_PRIVATE_KEY di frontend. Frontend hanya pakai VITE_FIREBASE_*.

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifikasi";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const firebaseConfig = {
  "apiKey": "",
  "authDomain": "",
  "projectId": "",
  "storageBucket": "",
  "messagingSenderId": "",
  "appId": ""
};
const isFirebaseConfigured = false;

if (isFirebaseConfigured) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || "Notifikasi Laporan Harian";
    const options = {
      body: notification.body || data.message || "Ada notifikasi baru.",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data,
    };

    self.registration.showNotification(title, options);
  });
} else {
  console.info("Firebase Messaging SW belum aktif karena VITE_FIREBASE_* belum lengkap.");
}
