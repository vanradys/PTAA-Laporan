import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  isActive: boolean;
};

type Department = { id: number; name: string; code: string };
type NameChangeRequest = {
  id: number;
  userId: number;
  currentName: string;
  requestedName: string;
  status: string;
  createdAt: string;
};

type PasswordLookup = {
  userId: number;
  name: string;
  email: string;
  canView: boolean;
  password: string | null;
  source: "default_seed" | "stored_plaintext" | "hashed";
  message?: string;
};

type CreateAccountForm = {
  name: string;
  email: string;
  password: string;
  role: string;
  departmentId: string;
  isActive: boolean;
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "direktur", label: "Direktur" },
  { value: "karyawan", label: "Karyawan" },
  { value: "admin_marketing", label: "Admin Marketing 2" },
  { value: "marketing_specialist", label: "Marketing Specialist" },
  { value: "monitoring_dummy", label: "Monitoring Laporan" },
];

export default function UserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [viewingPasswordUserId, setViewingPasswordUserId] = useState<number | null>(null);
  const [passwordLookup, setPasswordLookup] = useState<PasswordLookup | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAccountForm>({
    name: "",
    email: "",
    password: "",
    role: "karyawan",
    departmentId: "none",
    isActive: true,
  });
  const { data: users, isLoading, error: usersError } = useQuery({
    queryKey: ["user-management"],
    queryFn: () => apiRequest<UserRow[]>("/api/users"),
    enabled: user?.role === "admin",
  });
  const { data: departments, error: departmentsError } = useQuery({
    queryKey: ["departments-user-management"],
    queryFn: () => apiRequest<Department[]>("/api/user-management/departments"),
    enabled: user?.role === "admin",
  });
  const { data: nameRequests } = useQuery({
    queryKey: ["name-change-requests"],
    queryFn: () => apiRequest<NameChangeRequest[]>("/api/name-change-requests"),
    enabled: user?.role === "admin",
  });

  const reviewNameRequest = async (id: number, action: "approve" | "reject") => {
    await apiRequest(`/api/name-change-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["name-change-requests"] }),
      queryClient.invalidateQueries({ queryKey: ["user-management"] }),
    ]);
    toast({ title: action === "approve" ? "Nama disetujui" : "Pengajuan ditolak" });
  };

  const updateUser = async (id: number, changes: Partial<UserRow>) => {
    if (updatingUserId !== null) return false;
    setUpdatingUserId(id);
    try {
      await apiRequest(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      await queryClient.invalidateQueries({ queryKey: ["user-management"] });
      if (id === user?.id) {
        await queryClient.invalidateQueries({
          queryKey: getGetCurrentUserQueryKey(),
        });
      }
      toast({ title: "Berhasil", description: "Data user dan hak akses diperbarui." });
      return true;
    } catch (error) {
      toast({
        title: "Gagal memperbarui user",
        description: error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan data user.",
        variant: "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["user-management"] });
      return false;
    } finally {
      setUpdatingUserId(null);
    }
  };

  const viewPassword = async (item: UserRow) => {
    if (viewingPasswordUserId !== null) return;
    setViewingPasswordUserId(item.id);
    try {
      const result = await apiRequest<PasswordLookup>(`/api/users/${item.id}/password`);
      setPasswordLookup(result);
      setPasswordDialogOpen(true);
    } catch (error) {
      toast({
        title: "Gagal melihat password",
        description:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengambil password akun.",
        variant: "destructive",
      });
    } finally {
      setViewingPasswordUserId(null);
    }
  };

  const deleteUser = async (item: UserRow) => {
    if (updatingUserId !== null) return;
    if (
      !window.confirm(
        `Hapus permanen akun ${item.name} (${item.email}) dari database? Aksi ini tidak bisa dibatalkan.`,
      )
    ) {
      return;
    }

    setUpdatingUserId(item.id);
    try {
      await apiRequest(`/api/users/${item.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["user-management"] });
      toast({ title: "Berhasil", description: "Akun berhasil dihapus permanen." });
    } catch (error) {
      toast({
        title: "Akun tidak bisa dihapus permanen",
        description:
          error instanceof Error
            ? error.message
            : "Nonaktifkan akun jika user sudah punya histori data.",
        variant: "destructive",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const setCreateField = <Key extends keyof CreateAccountForm>(
    key: Key,
    value: CreateAccountForm[Key],
  ) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: "",
      email: "",
      password: "",
      role: "karyawan",
      departmentId: "none",
      isActive: true,
    });
  };

  const createAccount = async () => {
    const name = createForm.name.trim();
    const email = createForm.email.trim().toLowerCase();
    const password = createForm.password.trim();

    if (!name || !email || !password) {
      toast({
        title: "Data belum lengkap",
        description: "Nama, email, dan password wajib diisi.",
        variant: "destructive",
      });
      return;
    }

    setCreatingAccount(true);
    try {
      await apiRequest("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role: createForm.role,
          departmentId:
            createForm.departmentId === "none"
              ? null
              : Number(createForm.departmentId),
          isActive: createForm.isActive,
        }),
      });
      resetCreateForm();
      await queryClient.invalidateQueries({ queryKey: ["user-management"] });
      toast({ title: "Berhasil", description: "Akun baru berhasil dibuat." });
    } catch (error) {
      toast({
        title: "Gagal membuat akun",
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan saat membuat akun.",
        variant: "destructive",
      });
    } finally {
      setCreatingAccount(false);
    }
  };

  if (user?.role !== "admin") {
    return <Layout><div className="page-shell text-sm text-red-600">Halaman ini hanya dapat diakses Admin.</div></Layout>;
  }

  return (
    <Layout>
      <div className="page-shell space-y-5">
        <div>
          <h1 className="text-xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">Kelola nama, role, departemen, dan status akun.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Add / Create Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="space-y-1 xl:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Nama
                </label>
                <Input
                  value={createForm.name}
                  onChange={(event) => setCreateField("name", event.target.value)}
                  placeholder="Nama user"
                  disabled={creatingAccount}
                />
              </div>
              <div className="space-y-1 xl:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateField("email", event.target.value)}
                  placeholder="user@adiyasa.com"
                  disabled={creatingAccount}
                />
              </div>
              <div className="space-y-1 xl:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Password
                </label>
                <Input
                  type="text"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateField("password", event.target.value)
                  }
                  placeholder="Minimal 6 karakter"
                  disabled={creatingAccount}
                />
              </div>
              <div className="space-y-1 xl:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Role
                </label>
                <Select
                  value={createForm.role}
                  disabled={creatingAccount}
                  onValueChange={(role) => setCreateField("role", role)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 xl:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Departemen
                </label>
                <Select
                  value={createForm.departmentId}
                  disabled={creatingAccount}
                  onValueChange={(departmentId) =>
                    setCreateField("departmentId", departmentId)
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa Departemen</SelectItem>
                    {(departments ?? []).map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {["direktur", "admin_marketing", "marketing_specialist", "monitoring_dummy"].includes(createForm.role) && (
                  <p className="text-[11px] text-muted-foreground">
                    Departemen akan disesuaikan otomatis sesuai role.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2 xl:col-span-2">
                <Select
                  value={createForm.isActive ? "active" : "inactive"}
                  disabled={creatingAccount}
                  onValueChange={(value) =>
                    setCreateField("isActive", value === "active")
                  }
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={createAccount} disabled={creatingAccount}>
                  {creatingAccount ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Buat Akun
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetCreateForm}
                  disabled={creatingAccount}
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {(nameRequests ?? []).some((item) => item.status === "pending") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pengajuan Perubahan Nama</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(nameRequests ?? []).filter((item) => item.status === "pending").map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
                  <div className="flex-1 text-sm">
                    <span className="font-semibold">{item.currentName}</span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="font-semibold">{item.requestedName}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewNameRequest(item.id, "approve")}>Setujui</Button>
                    <Button size="sm" variant="outline" onClick={() => reviewNameRequest(item.id, "reject")}>Tolak</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Daftar User</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : usersError || departmentsError ? (
              <div className="px-5 py-10 text-center text-sm text-red-600">
                Gagal memuat data User Management. Muat ulang halaman atau periksa koneksi backend.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead><tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left">Nama</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Departemen</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Aksi</th>
                  </tr></thead>
                  <tbody>
                    {(users ?? []).map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Input
                            defaultValue={item.name}
                            disabled={updatingUserId !== null}
                            onBlur={async (event) => {
                              const name = event.target.value.trim();
                              if (name && name !== item.name) {
                                const saved = await updateUser(item.id, { name });
                                if (!saved) event.target.value = item.name;
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.email}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={item.role}
                            disabled={updatingUserId !== null || item.id === user.id}
                            onValueChange={(role) => void updateUser(item.id, { role })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={String(item.departmentId ?? "none")}
                            disabled={updatingUserId !== null}
                            onValueChange={(value) => void updateUser(item.id, { departmentId: value === "none" ? null : Number(value) })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Tanpa Departemen</SelectItem>
                              {(departments ?? []).map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant={item.isActive ? "outline" : "destructive"}
                            size="sm"
                            disabled={updatingUserId !== null || item.id === user.id}
                            onClick={() => {
                              const action = item.isActive ? "hide" : "show";
                              if (window.confirm(`Yakin ingin ${action} account ${item.name}?`)) {
                                void updateUser(item.id, { isActive: !item.isActive });
                              }
                            }}
                            title={item.id === user.id ? "Akun Admin yang sedang digunakan tidak dapat disembunyikan" : undefined}
                          >
                            {updatingUserId === item.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            {item.isActive ? "Hide Account" : "Show Account"}
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={viewingPasswordUserId !== null}
                              onClick={() => void viewPassword(item)}
                            >
                              {viewingPasswordUserId === item.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              View Password
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={updatingUserId !== null || item.id === user.id}
                              onClick={() => void deleteUser(item)}
                              title={
                                item.id === user.id
                                  ? "Akun Admin yang sedang digunakan tidak dapat dihapus"
                                  : "Hapus akun permanen dari database"
                              }
                            >
                              {updatingUserId === item.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Hapus
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>View Password</DialogTitle>
          </DialogHeader>
          {passwordLookup && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900">{passwordLookup.name}</p>
                <p className="text-muted-foreground">{passwordLookup.email}</p>
              </div>
              {passwordLookup.canView ? (
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Password
                  </p>
                  <p className="mt-1 break-all font-mono text-base text-slate-950">
                    {passwordLookup.password}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  {passwordLookup.message ??
                    "Password akun ini tidak bisa dilihat karena sudah tersimpan sebagai hash."}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(false)}
              >
                Tutup
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
