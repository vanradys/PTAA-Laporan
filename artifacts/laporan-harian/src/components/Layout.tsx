import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useListNotifications } from "@workspace/api-client-react";
import {
  LayoutDashboard, FileText, BarChart2, Bell, LogOut, ChevronRight, Building2, CalendarClock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/laporan-saya", label: "Laporan Saya", icon: FileText },
  { href: "/monitoring", label: "Monitoring Laporan", icon: BarChart2 },
  { href: "/jadwal-project", label: "Jadwal Project & PO", icon: CalendarClock },
  { href: "/notifikasi", label: "Notifikasi", icon: Bell },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, clearUser } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { data: notifications } = useListNotifications();
  const unreadCount = Array.isArray(notifications) ? notifications.filter((n: { isRead: boolean }) => !n.isRead).length : 0;

  const handleLogout = async () => {
    await logout.mutateAsync(undefined as unknown as void);
    clearUser();
    queryClient.clear();
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  const roleLabel: Record<string, string> = {
    karyawan: "Karyawan",
    hr: "HR",
    admin: "Admin",
    direktur: "Direktur",
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Laporan Harian</p>
              <p className="text-xs text-muted-foreground">Sistem HR</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer relative",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/notifikasi" && unreadCount > 0 && (
                  <Badge className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5 bg-destructive text-destructive-foreground border-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
                {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                {user?.avatarInitials ?? "??"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel[user?.role ?? ""] ?? user?.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              title="Keluar"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
