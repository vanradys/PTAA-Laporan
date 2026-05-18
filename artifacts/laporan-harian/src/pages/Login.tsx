import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const { refetchUser } = useAuth();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError("");
    try {
      await login.mutateAsync({ data });
      refetchUser();
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      setError(err?.data?.error ?? "Email atau password salah");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-lg mb-4">
            <Building2 className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Laporan Harian</h1>
          <p className="text-muted-foreground text-sm mt-1">Sistem Laporan Kerja Harian</p>
        </div>

        <Card className="border border-border shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Masuk ke Akun</CardTitle>
            <CardDescription>Masukkan email dan password Anda untuk melanjutkan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  {...register("email", { required: "Email diperlukan" })}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    {...register("password", { required: "Password diperlukan" })}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memproses...</>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>

            <div className="mt-5 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Akun Demo:</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">HR:</span> ahmad@perusahaan.com</p>
                <p><span className="font-medium text-foreground">Karyawan:</span> budi@perusahaan.com</p>
                <p><span className="font-medium text-foreground">Direktur:</span> eko@perusahaan.com</p>
                <p className="text-muted-foreground/70 mt-1">Password: password123 </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
