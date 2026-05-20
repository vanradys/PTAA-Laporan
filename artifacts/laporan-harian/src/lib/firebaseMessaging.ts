import { initializeApp, getApps } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

const firebaseVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";

export function isFirebaseMessagingConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      firebaseVapidKey,
  );
}

function getFirebaseApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

function getFirebaseServiceWorkerUrl(): string {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBaseUrl}/firebase-messaging-sw.js` || "/firebase-messaging-sw.js";
}

export async function canUseFirebaseMessaging(): Promise<boolean> {
  if (!isFirebaseMessagingConfigured()) {
    return false;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return false;
  }

  return isSupported().catch(() => false);
}

export async function requestFirebaseNotificationToken(): Promise<string | null> {
  const supported = await canUseFirebaseMessaging();
  if (!supported) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.register(getFirebaseServiceWorkerUrl());
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration,
  });

  return token || null;
}

export async function listenFirebaseForegroundMessages(
  callback: (payload: MessagePayload) => void,
): Promise<() => void> {
  const supported = await canUseFirebaseMessaging();
  if (!supported || Notification.permission !== "granted") {
    return () => {};
  }

  const messaging = getMessaging(getFirebaseApp());
  return onMessage(messaging, callback);
}
