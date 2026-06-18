import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import LaporanSaya from "@/pages/LaporanSaya";
import Monitoring from "@/pages/Monitoring";
import DetailLaporan from "@/pages/DetailLaporan";
import Notifikasi from "@/pages/Notifikasi";
import JadwalProject from "@/pages/JadwalProject";
import CustomerTracking from "@/pages/CustomerTracking";
import MonitoringKeseluruhan from "@/pages/MonitoringKeseluruhan";
import UserManagement from "@/pages/UserManagement";
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
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/laporan-saya" component={LaporanSaya} />
      <Route path="/monitoring" component={Monitoring} />
      <Route path="/monitoring-keseluruhan" component={MonitoringKeseluruhan} />
      <Route path="/user-management" component={UserManagement} />
      <Route path="/laporan/:id" component={DetailLaporan} />
      <Route path="/jadwal-project" component={JadwalProject} />
      <Route path="/notifikasi" component={Notifikasi} />
      <Route>
        <Dashboard />
      </Route>
    </Switch>
  );
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
