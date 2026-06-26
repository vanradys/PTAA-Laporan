import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useFeatureVisibility } from "@/hooks/use-feature-visibility";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import LaporanSaya from "@/pages/LaporanSaya";
import Monitoring from "@/pages/Monitoring";
import DetailLaporan from "@/pages/DetailLaporan";
import Notifikasi from "@/pages/Notifikasi";
import JadwalProject from "@/pages/JadwalProject";
import KomentarProject from "@/pages/KomentarProject";
import PanduanWebsite from "@/pages/PanduanWebsite";
import ToDoList from "@/pages/ToDoList";
import CustomerTracking from "@/pages/CustomerTracking";
import MonitoringKeseluruhan from "@/pages/MonitoringKeseluruhan";
import UserManagement from "@/pages/UserManagement";
import Attendance from "@/pages/Attendance";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import NotificationPermissionPrompt from "@/components/NotificationPermissionPrompt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30000,
    },
  },
});

function AppRoutes() {
  const { user, isLoading } = useAuth();

  const [location] = useLocation();

  if (
    location === "/customer-tracking" ||
    location.startsWith("/customer-tracking/")
  ) {
    return <CustomerTracking />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Switch>
      <Route path="/">
        {() => (
          <FeatureGate featureKey="dashboard">
            <Dashboard />
          </FeatureGate>
        )}
      </Route>
      <Route path="/dashboard">
        {() => (
          <FeatureGate featureKey="dashboard">
            <Dashboard />
          </FeatureGate>
        )}
      </Route>
      <Route path="/laporan-saya">
        {() => (
          <FeatureGate featureKey="daily_reports">
            <LaporanSaya />
          </FeatureGate>
        )}
      </Route>
      <Route path="/to-do-list">
        {() => (
          <FeatureGate featureKey="todo_list">
            <ToDoList />
          </FeatureGate>
        )}
      </Route>
      <Route path="/monitoring">
        {() => (
          <FeatureGate featureKey="monitoring_reports">
            <Monitoring />
          </FeatureGate>
        )}
      </Route>
      <Route path="/monitoring-keseluruhan">
        {() => (
          <FeatureGate featureKey="overall_monitoring">
            <MonitoringKeseluruhan />
          </FeatureGate>
        )}
      </Route>
      <Route path="/user-management" component={UserManagement} />
      <Route path="/absensi">
        {() => (
          <FeatureGate featureKey="attendance">
            <Attendance />
          </FeatureGate>
        )}
      </Route>
      <Route path="/laporan/:id" component={DetailLaporan} />
      <Route path="/jadwal-project">
        {() => (
          <FeatureGate featureKey="project_schedule">
            <JadwalProject />
          </FeatureGate>
        )}
      </Route>
      <Route path="/komentar-project">
        {() => (
          <FeatureGate featureKey="project_comments">
            <KomentarProject />
          </FeatureGate>
        )}
      </Route>
      <Route path="/panduan-website">
        {() => (
          <FeatureGate featureKey="website_guide">
            <PanduanWebsite />
          </FeatureGate>
        )}
      </Route>
      <Route path="/notifikasi">
        {() => (
          <FeatureGate featureKey="notifications">
            <Notifikasi />
          </FeatureGate>
        )}
      </Route>
      <Route>
        <Dashboard />
      </Route>
    </Switch>
  );
}

function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: string;
  children: ReactNode;
}) {
  const { canViewFeature } = useFeatureVisibility();

  if (!canViewFeature(featureKey, true)) {
    return (
      <Layout>
        <div className="page-shell">
          <Card>
            <CardContent className="p-8 text-center text-sm text-red-600">
              Halaman ini belum diaktifkan untuk profile atau departemen akun Anda.
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <NotificationPermissionPrompt />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
