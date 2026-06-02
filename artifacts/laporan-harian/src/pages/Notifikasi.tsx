import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification,
} from "@workspace/api-client-react";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { cn } from "@/lib/utils";

interface NotifItem {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  relatedReportId: number | null | undefined;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  review: "bg-green-100 text-green-700",
  revision: "bg-orange-100 text-orange-700",
  info: "bg-blue-100 text-blue-700",
};

function getNotificationTarget(notif: NotifItem) {
  const searchableText = `${notif.type} ${notif.title} ${notif.message}`.toLowerCase();

  if (notif.relatedReportId) return `/laporan/${notif.relatedReportId}`;
  if (
    searchableText.includes("po") ||
    searchableText.includes("project") ||
    searchableText.includes("delivery") ||
    searchableText.includes("deadline")
  ) {
    return "/jadwal-project";
  }
  if (
    searchableText.includes("review") ||
    searchableText.includes("revisi") ||
    searchableText.includes("revision") ||
    searchableText.includes("laporan harian baru") ||
    searchableText.includes("report_created")
  ) {
    return "/monitoring";
  }
  if (
    searchableText.includes("daily_report") ||
    searchableText.includes("laporan") ||
    searchableText.includes("report")
  ) {
    return "/laporan-saya";
  }

  return "/dashboard";
}

export default function Notifikasi() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();

  const notifs: NotifItem[] = Array.isArray(notifications) ? (notifications as NotifItem[]) : [];
  const unreadCount = notifs.filter(n => !n.isRead).length;

  const handleMarkRead = async (id: number) => {
    await markRead.mutateAsync({ notifId: id });
    queryClient.invalidateQueries();
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync(undefined as unknown as void);
    queryClient.invalidateQueries();
    toast({ title: "Semua notifikasi ditandai sudah dibaca" });
  };

  const handleDeleteNotification = async (id: number) => {
    await deleteNotification.mutateAsync({ notifId: id });
    queryClient.invalidateQueries();
    toast({ title: "Notifikasi dihapus" });
  };

  const handleOpenNotification = async (notif: NotifItem) => {
    const target = getNotificationTarget(notif);

    if (!notif.isRead) {
      await markRead.mutateAsync({ notifId: notif.id });
      queryClient.invalidateQueries();
    }

    if (target) {
      setLocation(target);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-5 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Notifikasi</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} belum dibaca` : "Semua sudah dibaca"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
              {markAllRead.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
              Tandai Semua Dibaca
            </Button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bell className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Belum ada notifikasi.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((notif) => {
              const target = getNotificationTarget(notif);

              return (
              <Card
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenNotification(notif)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpenNotification(notif);
                  }
                }}
                className={cn(
                  "border border-border transition-colors",
                  "cursor-pointer hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !notif.isRead && "bg-primary/5 border-primary/20"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {!notif.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={cn("text-sm font-medium", !notif.isRead ? "text-foreground" : "text-muted-foreground")}>
                            {notif.title}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(notif.createdAt).toLocaleDateString("id-ID", {
                              weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit"
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7"
                            title="Hapus Notifikasi"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteNotification(notif.id);
                            }}
                            disabled={deleteNotification.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {!notif.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7"
                              title="Tandai Dibaca"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleMarkRead(notif.id);
                              }}
                              disabled={markRead.isPending}
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
