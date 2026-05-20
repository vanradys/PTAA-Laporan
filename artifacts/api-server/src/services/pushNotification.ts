import { db, deviceTokensTable, eq } from "@workspace/db";
import { sendFirebaseMessage } from "../lib/firebaseAdmin";
import { logger } from "../lib/logger";

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export async function sendPushNotificationToUser(options: {
  userId: number;
  title: string;
  message: string;
  type: string;
  url?: string;
}) {
  const tokens = await db
    .select({ id: deviceTokensTable.id, token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(eq(deviceTokensTable.userId, options.userId));

  let successCount = 0;
  let failedCount = 0;
  let removedInvalidTokenCount = 0;

  for (const item of tokens) {
    const result = await sendFirebaseMessage({
      token: item.token,
      webpush: {
        fcmOptions: {
          link: options.url ?? "/notifikasi",
        },
      },
      data: {
        title: options.title,
        message: options.message,
        type: options.type,
        url: options.url ?? "/notifikasi",
      },
    });

    if (result.success) {
      successCount += 1;
      continue;
    }

    failedCount += 1;

    const code = getFirebaseErrorCode(result.error);
    if (code && INVALID_TOKEN_ERROR_CODES.has(code)) {
      await db.delete(deviceTokensTable).where(eq(deviceTokensTable.id, item.id));
      removedInvalidTokenCount += 1;
      logger.info({ tokenId: item.id, code }, "Token Firebase tidak valid dihapus dari database");
    }
  }

  return {
    totalToken: tokens.length,
    successCount,
    failedCount,
    removedInvalidTokenCount,
  };
}
