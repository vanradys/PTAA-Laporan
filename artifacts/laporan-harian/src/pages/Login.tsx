import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

const logoSrc = new URL("../assets/adiyasa-logo.png", import.meta.url).href;

interface LoginForm {
  email: string;
  password: string;
}

export default function Login() {
  const { refetchUser } = useAuth();
  const login = useLogin();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError("");
    try {
      await login.mutateAsync({ data });
      refetchUser();
    } catch (e: unknown) {
      const err = e as {
        data?: { error?: string; message?: string; detail?: string };
        message?: string;
        status?: number;
      };
      const backendMessage =
        err.data?.error ??
        err.data?.message ??
        err.data?.detail ??
        err.message;
      setError(
        backendMessage ||
          (err.status === 401
            ? "Email atau password salah"
            : "Tidak dapat terhubung ke server. Silakan coba lagi."),
      );
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F8FAFC" }}>
      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12 relative overflow-hidden"
        style={{ backgroundColor: "#001E8A" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: "#E30613" }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full opacity-10"
          style={{ backgroundColor: "#E30613" }}
        />
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10"
          style={{ backgroundColor: "#ffffff" }}
        />

        <div className="relative z-10 flex flex-col items-center mt-20">
          <img
            src={logoSrc}
            alt="Adiyasa logo"
            className="w-[390px] h-[390px] object-contain mx-auto"
          />

          <div className="mt-10 text-center">
            <p className="text-white text-2xl font-semibold tracking-[0.24em] uppercase">
              Manajemen Laporan Harian
            </p>
            <p
              className="text-lg font-bold tracking-[0.32em] uppercase mt-3"
              style={{ color: "#E30613" }}
            >
              PT Adiyasa Abadi
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div
            className="w-12 h-1 mb-4"
            style={{ backgroundColor: "#E30613" }}
          />
          <h2 className="text-2xl font-bold text-white leading-snug mb-3">
            Sistem Laporan Kerja Harian
          </h2>
          <p className="text-blue-200 text-sm leading-relaxed">
            Aplikasi laporan kerja harian terintegrasi untuk tim dan project
            PTAA.
          </p>
        </div>

        <div className="relative z-10 border-t border-white/20 pt-6">
          <p className="text-blue-300 text-xs">
            PT Adiyasa Abadi &copy; 2026. Hak cipta dilindungi.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <img
              src={logoSrc}
              alt="Adiyasa logo"
              className="mx-auto w-24 h-24 object-contain"
            />
            <div
              className="text-3xl font-black tracking-widest"
              style={{ color: "#001E8A" }}
            >
              LAPORAN
            </div>
            <div
              className="text-sm font-bold tracking-widest"
              style={{ color: "#E30613" }}
            >
              HARIAN
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
            <div className="mb-6">
              <div
                className="w-8 h-1 mb-4"
                style={{ backgroundColor: "#E30613" }}
              />
              <h1 className="text-2xl font-bold text-gray-900">
                Masuk ke Sistem
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Masukkan email dan password Anda
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="email"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  {...register("email", { required: "Email diperlukan" })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                  autoComplete="email"
                />
                {errors.email && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="password"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="Masukkan password"
                  {...register("password", {
                    required: "Password diperlukan",
                  })}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                  autoComplete="current-password"
                />
                {errors.password && (
                  <p className="text-xs text-red-600 mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3.5 py-2.5 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={login.isPending}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-70 mt-2"
                style={{ backgroundColor: "#E30613" }}
              >
                {login.isPending ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </span>
                ) : (
                  "Masuk"
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                Gunakan email terdaftar. Hubungi admin jika mengalami kendala
                akses.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
