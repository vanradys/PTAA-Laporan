import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, X } from "lucide-react";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { apiRequest } from "@/lib/apiRequest";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  canUseFirebaseMessaging,
  listenFirebaseForegroundMessages,
  requestFirebaseNotificationToken,
} from "@/lib/firebaseMessaging";

const PROMPT_DELAY_DAYS = 2;
const PROMPT_STATUS_PREFIX = "ptaa_notification_prompt_status_";
const PROMPT_LATER_PREFIX = "ptaa_notification_prompt_later_until_";

function getPlatformName(): string {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("android")) {
    return "android-web";
  }

  if (userAgent.includes("edg")) {
    return "desktop-edge";
  }

  if (userAgent.includes("chrome")) {
    return "desktop-chrome";
  }

  return "web";
}

function getLaterUntilDate(): string {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + PROMPT_DELAY_DAYS);
  return nextDate.toISOString();
}

export default function NotificationPermissionPrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isVisible, setIsVisible] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isActivating, setIsActivating] = useState(false);

  const storageKeys = useMemo(() => {
    if (!user?.id) {
      return null;
    }

    return {
      status: `${PROMPT_STATUS_PREFIX}${user.id}`,
      laterUntil: `${PROMPT_LATER_PREFIX}${user.id}`,
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    async function checkPromptVisibility() {
      if (!user || !storageKeys) {
        setIsVisible(false);
        setIsChecking(false);
        return;
      }

      const supported = await canUseFirebaseMessaging();
      if (!isMounted) {
        return;
      }

      if (!supported || Notification.permission === "granted" || Notification.permission === "denied") {
        setIsVisible(false);
        setIsChecking(false);
        return;
      }

      const savedStatus = localStorage.getItem(storageKeys.status);
      if (savedStatus === "enabled") {
        setIsVisible(false);
        setIsChecking(false);
        return;
      }

      const laterUntilValue = localStorage.getItem(storageKeys.laterUntil);
      const laterUntil = laterUntilValue ? new Date(laterUntilValue).getTime() : 0;
      if (laterUntil > Date.now()) {
        setIsVisible(false);
        setIsChecking(false);
        return;
      }

      setIsVisible(true);
      setIsChecking(false);
    }

    checkPromptVisibility();

    return () => {
      isMounted = false;
    };
  }, [storageKeys, user]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    listenFirebaseForegroundMessages((payload) => {
      const title = payload.notification?.title ?? payload.data?.title ?? "Notifikasi baru";
      const description = payload.notification?.body ?? payload.data?.message ?? "Ada notifikasi baru di aplikasi.";

      toast({ title, description });
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    }).then((handler) => {
      if (!isMounted) {
        handler();
        return;
      }

      unsubscribe = handler;
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [queryClient, toast]);

  const handleActivate = async () => {
    if (!storageKeys) {
      return;
    }

    try {
      setIsActivating(true);
      const token = await requestFirebaseNotificationToken();

      if (!token) {
        localStorage.setItem(storageKeys.laterUntil, getLaterUntilDate());
        toast({
          title: "Notifikasi browser tidak aktif",
          description: "Anda tetap akan menerima notifikasi di aplikasi.",
        });
        setIsVisible(false);
        return;
      }

      await apiRequest("/api/notifications/register-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          platform: getPlatformName(),
        }),
      });

      localStorage.setItem(storageKeys.status, "enabled");
      localStorage.removeItem(storageKeys.laterUntil);
      toast({ title: "Notifikasi berhasil diaktifkan." });
      setIsVisible(false);
    } catch (error) {
      localStorage.setItem(storageKeys.laterUntil, getLaterUntilDate());
      toast({
        title: "Notifikasi browser tidak aktif",
        description: "Anda tetap akan menerima notifikasi di aplikasi.",
      });
      setIsVisible(false);
    } finally {
      setIsActivating(false);
    }
  };

  const handleLater = () => {
    if (!storageKeys) {
      return;
    }

    localStorage.setItem(storageKeys.laterUntil, getLaterUntilDate());
    setIsVisible(false);
  };

  if (isChecking || !isVisible) {
    return null;
  }

  return (
    <Card className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] border-slate-200 bg-white shadow-2xl">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E30613]/10 text-[#E30613]">
            <BellRing className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">Aktifkan notifikasi</p>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={handleLater}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Aktifkan notifikasi agar Anda tidak lupa mengisi laporan harian.
            </p>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                className="h-9 bg-[#E30613] px-3 text-sm font-semibold text-white hover:bg-[#c80010]"
                onClick={handleActivate}
                disabled={isActivating}
              >
                {isActivating ? "Mengaktifkan..." : "Aktifkan Notifikasi"}
              </Button>
              <Button type="button" variant="outline" className="h-9 px-3 text-sm" onClick={handleLater}>
                Nanti Saja
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
