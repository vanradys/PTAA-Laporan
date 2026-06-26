import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout, useListNotifications } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  FileText,
  BarChart2,
  Bell,
  LogOut,
  ChevronRight,
  CalendarClock,
  ClipboardList,
  Activity,
  Menu,
  X,
  UsersRound,
  Fingerprint,
  HelpCircle,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import NotificationBell from "@/components/NotificationBell";
import { getRoleDisplayName } from "@/lib/roleDisplay";

const logoSrc = new URL("../assets/adiyasa-logo.png", import.meta.url).href;

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/laporan-saya", label: "Laporan Harian", icon: FileText },
  { href: "/to-do-list", label: "To Do List", icon: ClipboardList },
  { href: "/monitoring", label: "Monitoring Laporan", icon: BarChart2 },
  { href: "/jadwal-project", label: "Jadwal Project", icon: CalendarClock },
  { href: "/komentar-project", label: "Komentar Project", icon: MessagesSquare },
  { href: "/absensi", label: "Absensi", icon: Fingerprint },
  { href: "/panduan-website", label: "Panduan Website", icon: HelpCircle },
  { href: "/notifikasi", label: "Notifikasi", icon: Bell },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, clearUser } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { data: notifications } = useListNotifications();

  const unreadCount = Array.isArray(notifications)
    ? notifications.filter((n: { isRead: boolean }) => !n.isRead).length
    : 0;

  const handleLogout = async () => {
    await logout.mutateAsync(undefined as unknown as void);
    clearUser();
    queryClient.clear();
    window.location.href = import.meta.env.BASE_URL || "/";
  };

  const closeMobileSidebar = () => {
    setSidebarOpen(false);
  };

  const displayedRole = getRoleDisplayName(
    user?.role,
    user?.departmentCode,
    user?.departmentName,
  );
  const userRole = String(user?.role ?? "").toLowerCase();
  const canViewOverallMonitoring = ["admin", "monitoring_dummy"].includes(userRole);
  const userDepartmentCode = String(user?.departmentCode ?? "").toUpperCase();
  const userDepartmentName = String(user?.departmentName ?? "").toLowerCase();
  const canViewProjectComments =
    ["admin", "direktur", "director", "monitoring_dummy"].includes(userRole) ||
    userDepartmentCode === "ENG" ||
    userDepartmentName.includes("engineering");
  const visibleNavItems = [
    ...navItems.slice(0, 5),
    ...(canViewProjectComments ? [navItems[5]] : []),
    ...(canViewOverallMonitoring
      ? [{
          href: "/monitoring-keseluruhan",
          label: "Monitoring Keseluruhan",
          icon: Activity,
        }]
      : []),
    ...(userRole === "admin"
      ? [{
          href: "/user-management",
          label: "User Management",
          icon: UsersRound,
        }]
      : []),
    ...navItems.slice(6),
  ];

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-50 text-slate-950">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[270px] shrink-0 flex-col bg-[#06258d] text-white transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="Adiyasa logo"
              className="h-16 w-16 shrink-0 object-contain"
            />
            <div className="leading-tight">
              <p className="text-2xl font-black tracking-[0.16em]">ADIYASA</p>
              <p className="text-xs font-bold tracking-[0.22em] text-red-500">
                PTAA
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            title="Tutup menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location === item.href ||
              (item.href !== "/dashboard" &&
                location.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileSidebar}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-semibold transition-all",
                  isActive
                    ? "bg-[#ef0012] text-white shadow-lg shadow-red-950/20"
                    : "text-blue-100 hover:bg-white/10 hover:text-white",
                )}
              >
                
                <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{item.label}</span>      

                {item.href === "/notifikasi" && unreadCount > 0 && (
                  <Badge className="border-none bg-white px-1.5 text-xs font-bold text-[#ef0012]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}

                {isActive && <ChevronRight className="h-4 w-4 opacity-80" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-blue-200">
          PT Adiyasa Abadi v1.0
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[58px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-slate-700 lg:hidden"
              onClick={() => setSidebarOpen((open) => !open)}
              title="Buka menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <ClipboardList className="hidden h-4 w-4 text-[#06258d] sm:block" />
            <span className="truncate">Sistem Laporan Harian</span>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-5">
            <NotificationBell />

            <div className="flex items-center gap-2 sm:gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-indigo-600 text-sm font-bold text-white">
                  {user?.avatarInitials ?? "AP"}
                </AvatarFallback>
              </Avatar>

              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-bold text-slate-900">
                  {user?.name ?? "Admin PTAA"}
                </p>
                <p className="text-xs text-slate-500">
                  {displayedRole}
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500"
                onClick={handleLogout}
                title="Keluar"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
