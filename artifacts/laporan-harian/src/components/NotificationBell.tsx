import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useDeleteNotification,
} from "@workspace/api-client-react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  relatedReportId?: number | null;
  relatedTodoId?: number | null;
  createdAt: string;
}

function getNotificationTarget(item: NotificationItem) {
  const searchableText = `${item.type} ${item.title} ${item.message}`.toLowerCase();

  if (item.relatedTodoId) return `/to-do-list?task=${item.relatedTodoId}`;
  if (item.relatedReportId) return `/laporan/${item.relatedReportId}`;
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

export default function NotificationBell() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: notifications } = useListNotifications({
    query: {
      queryKey: getListNotificationsQueryKey(),
      refetchInterval: 15000,
    },
  });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();

  const items: NotificationItem[] = Array.isArray(notifications) ? (notifications as NotificationItem[]) : [];
  const unreadCount = items.filter((item) => !item.isRead).length;
  const latestItems = items.slice(0, 5);

  const refreshNotifications = () => {
    queryClient.invalidateQueries();
  };

  const handleDeleteNotification = async (notificationId: number) => {
    await deleteNotification.mutateAsync({ notifId: notificationId });
    refreshNotifications();
  };

  const handleMarkRead = async (notificationId: number) => {
    await markRead.mutateAsync({ notifId: notificationId });
    refreshNotifications();
  };

  const handleOpenNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markRead.mutateAsync({ notifId: item.id });
      refreshNotifications();
    }

    setLocation(getNotificationTarget(item));
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync(undefined as unknown as void);
    refreshNotifications();
    toast({ title: "Semua notifikasi ditandai sudah dibaca" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-slate-600 hover:text-[#001E8A]">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center border-2 border-white bg-[#E30613] px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0 text-sm font-bold text-slate-900">Notifikasi</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-[#001E8A]"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Tandai Semua Dibaca
            </Button>
          )}
        </div>

        <DropdownMenuSeparator />

        {latestItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center text-sm text-slate-500">
            <Bell className="mb-2 h-8 w-8 text-slate-300" />
            Belum ada notifikasi.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {latestItems.map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <div
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-3 focus:bg-slate-50",
                    !item.isRead && "bg-red-50/70",
                  )}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenNotification(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenNotification(item);
                    }
                  }}
                >
                  <span className={cn("mt-2 h-2 w-2 rounded-full bg-slate-300", !item.isRead && "bg-[#E30613]")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!item.isRead && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Tandai dibaca"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMarkRead(item.id);
                        }}
                        disabled={markRead.isPending}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Hapus notifikasi"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteNotification(item.id);
                      }}
                      disabled={deleteNotification.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        <DropdownMenuSeparator />
        <Link href="/notifikasi">
          <Button variant="ghost" className="h-10 w-full rounded-none text-sm font-semibold text-[#001E8A]">
            Lihat Semua Notifikasi
          </Button>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
