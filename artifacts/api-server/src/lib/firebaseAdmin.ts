import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { logger } from "./logger";

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getFirebaseServiceAccount(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

function getFirebaseApp() {
  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount) {
    logger.warn("Firebase Admin belum aktif karena env FIREBASE_* backend belum lengkap");
    return null;
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export function isFirebaseAdminEnabled(): boolean {
  return getFirebaseServiceAccount() !== null;
}

export async function sendFirebaseMessage(message: Message) {
  const app = getFirebaseApp();
  if (!app) {
    return { success: false, error: "Firebase Admin belum dikonfigurasi" };
  }

  try {
    const messageId = await getMessaging(app).send(message);
    return { success: true, messageId };
  } catch (error) {
    logger.warn({ error }, "Gagal mengirim Firebase push notification");
    return { success: false, error };
  }
}
