import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { currentFeatureVisibilityQueryKey } from "@/hooks/use-feature-visibility";
import { currentEditPermissionsQueryKey } from "@/hooks/use-edit-permissions";

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

type Department = {
  id: number;
  name: string;
  code: string;
  displayCode?: string;
  locked?: boolean;
};
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

type DepartmentVisibilityFeature = {
  key: string;
  label: string;
};

type DepartmentVisibilityPermission = {
  departmentCode: string;
  subjectKey?: string;
  featureKey: string;
  canView: boolean;
};

type DepartmentVisibilityResponse = {
  features: DepartmentVisibilityFeature[];
  departments: Department[];
  permissions: DepartmentVisibilityPermission[];
};

type DepartmentEditPermissionFeature = {
  key: string;
  label: string;
};

type DepartmentEditPermission = {
  departmentCode: string;
  subjectKey?: string;
  permissionKey: string;
  canEdit: boolean;
};

type DepartmentEditPermissionsResponse = {
  features: DepartmentEditPermissionFeature[];
  departments: Department[];
  permissions: DepartmentEditPermission[];
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
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingVisibilityKey, setUpdatingVisibilityKey] = useState<string | null>(null);
  const [updatingEditPermissionKey, setUpdatingEditPermissionKey] = useState<string | null>(null);
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
  const { data: visibilityMatrix, isLoading: visibilityLoading, error: visibilityError } = useQuery({
    queryKey: ["department-visibility"],
    queryFn: () => apiRequest<DepartmentVisibilityResponse>("/api/user-management/department-visibility"),
    enabled: user?.role === "admin",
  });
  const {
    data: editPermissionsMatrix,
    isLoading: editPermissionsLoading,
    error: editPermissionsError,
  } = useQuery({
    queryKey: ["department-edit-permissions"],
    queryFn: () => apiRequest<DepartmentEditPermissionsResponse>("/api/user-management/edit-permissions"),
    enabled: user?.role === "admin",
  });

  const visibilityByKey = new Map(
    (visibilityMatrix?.permissions ?? []).map((permission) => [
      `${permission.departmentCode}:${permission.featureKey}`,
      permission.canView,
    ]),
  );
  const editPermissionByKey = new Map(
    (editPermissionsMatrix?.permissions ?? []).map((permission) => [
      `${permission.departmentCode}:${permission.permissionKey}`,
      permission.canEdit,
    ]),
  );

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
      setNewPassword("");
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

  const changePassword = async () => {
    if (!passwordLookup || changingPassword) return;
    const password = newPassword.trim();
    if (password.length < 6) {
      toast({
        title: "Password terlalu pendek",
        description: "Password minimal 6 karakter.",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      await apiRequest(`/api/users/${passwordLookup.userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const refreshed = await apiRequest<PasswordLookup>(`/api/users/${passwordLookup.userId}/password`);
      setPasswordLookup(refreshed);
      setNewPassword("");
      toast({ title: "Password berhasil diubah" });
    } catch (error) {
      toast({
        title: "Gagal mengubah password",
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan saat mengubah password.",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
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

  const updateDepartmentVisibility = async (
    departmentCode: string,
    featureKey: string,
    canView: boolean,
  ) => {
    const updateKey = `${departmentCode}:${featureKey}`;
    if (updatingVisibilityKey !== null) return;
    setUpdatingVisibilityKey(updateKey);
    try {
      await apiRequest("/api/user-management/department-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectKey: departmentCode, featureKey, canView }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["department-visibility"] }),
        queryClient.invalidateQueries({ queryKey: currentFeatureVisibilityQueryKey }),
      ]);
      toast({ title: "Visibility departemen diperbarui" });
    } catch (error) {
      toast({
        title: "Gagal mengubah visibility",
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan visibility.",
        variant: "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["department-visibility"] });
    } finally {
      setUpdatingVisibilityKey(null);
    }
  };

  const updateDepartmentEditPermission = async (
    departmentCode: string,
    permissionKey: string,
    canEdit: boolean,
  ) => {
    const updateKey = `${departmentCode}:${permissionKey}`;
    if (updatingEditPermissionKey !== null) return;
    setUpdatingEditPermissionKey(updateKey);
    try {
      await apiRequest("/api/user-management/edit-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectKey: departmentCode, permissionKey, canEdit }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["department-edit-permissions"] }),
        queryClient.invalidateQueries({ queryKey: currentEditPermissionsQueryKey }),
      ]);
      toast({ title: "Edit permission diperbarui" });
    } catch (error) {
      toast({
        title: "Gagal mengubah edit permission",
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan saat menyimpan edit permission.",
        variant: "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["department-edit-permissions"] });
    } finally {
      setUpdatingEditPermissionKey(null);
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
        <Tabs defaultValue="accounts" className="space-y-5">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="visibility">Page Visibility</TabsTrigger>
            <TabsTrigger value="edit-perms">Edit Perms</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="space-y-5">
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
                    {(users ?? []).map((item) => {
                      const isAdminAccount = String(item.role).toLowerCase() === "admin";
                      return (
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
                            disabled={updatingUserId !== null || item.id === user.id || isAdminAccount}
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
                            disabled={updatingUserId !== null || isAdminAccount}
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
                            disabled={updatingUserId !== null || item.id === user.id || isAdminAccount}
                            onClick={() => {
                              const action = item.isActive ? "hide" : "show";
                              if (window.confirm(`Yakin ingin ${action} account ${item.name}?`)) {
                                void updateUser(item.id, { isActive: !item.isActive });
                              }
                            }}
                            title={isAdminAccount ? "Akun Admin punya absolute access dan tidak dapat di-hide" : item.id === user.id ? "Akun Admin yang sedang digunakan tidak dapat disembunyikan" : undefined}
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
                              disabled={updatingUserId !== null || item.id === user.id || isAdminAccount}
                              onClick={() => void deleteUser(item)}
                              title={
                                isAdminAccount
                                  ? "Akun Admin punya absolute access dan tidak dapat dihapus"
                                  : item.id === user.id
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
          <TabsContent value="visibility" className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Page Visibility</CardTitle>
              </CardHeader>
              <CardContent>
                {visibilityLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : visibilityError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                    Gagal memuat pengaturan visibility departemen.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-semibold">
                            Features
                          </th>
                          {(visibilityMatrix?.departments ?? []).map((department) => (
                            <th
                              key={department.code}
                              className="min-w-36 px-4 py-3 text-center font-semibold"
                            >
                              <div>{department.name}</div>
                              <div className="text-xs font-normal text-muted-foreground">
                                {department.displayCode ?? department.code}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(visibilityMatrix?.features ?? []).map((feature) => (
                          <tr key={feature.key} className="border-b last:border-0">
                            <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold">
                              {feature.label}
                            </td>
                            {(visibilityMatrix?.departments ?? []).map((department) => {
                              const permissionKey = `${department.code}:${feature.key}`;
                              const isLockedProfile =
                                department.locked === true ||
                                department.code === "role:admin" ||
                                department.displayCode === "ADMIN";
                              const checked = isLockedProfile
                                ? true
                                : visibilityByKey.get(permissionKey) ?? false;
                              return (
                                <td key={permissionKey} className="px-4 py-3 text-center">
                                  <Checkbox
                                    checked={checked}
                                    disabled={updatingVisibilityKey !== null || isLockedProfile}
                                    onCheckedChange={(value) =>
                                      void updateDepartmentVisibility(
                                        department.code,
                                        feature.key,
                                        value === true,
                                      )
                                    }
                                    aria-label={`${feature.label} ${department.name}`}
                                    className="mx-auto"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="edit-perms" className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit Perms</CardTitle>
              </CardHeader>
              <CardContent>
                {editPermissionsLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : editPermissionsError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                    Gagal memuat pengaturan edit permissions.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left font-semibold">
                            Permissions
                          </th>
                          {(editPermissionsMatrix?.departments ?? []).map((department) => (
                            <th
                              key={department.code}
                              className="min-w-36 px-4 py-3 text-center font-semibold"
                            >
                              <div>{department.name}</div>
                              <div className="text-xs font-normal text-muted-foreground">
                                {department.displayCode ?? department.code}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(editPermissionsMatrix?.features ?? []).map((permission) => (
                          <tr key={permission.key} className="border-b last:border-0">
                            <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold">
                              {permission.label}
                            </td>
                            {(editPermissionsMatrix?.departments ?? []).map((department) => {
                              const permissionKey = `${department.code}:${permission.key}`;
                              const isLockedProfile =
                                department.locked === true ||
                                department.code === "role:admin" ||
                                department.displayCode === "ADMIN";
                              const checked = isLockedProfile
                                ? true
                                : editPermissionByKey.get(permissionKey) ?? false;
                              return (
                                <td key={permissionKey} className="px-4 py-3 text-center">
                                  <Checkbox
                                    checked={checked}
                                    disabled={updatingEditPermissionKey !== null || isLockedProfile}
                                    onCheckedChange={(value) =>
                                      void updateDepartmentEditPermission(
                                        department.code,
                                        permission.key,
                                        value === true,
                                      )
                                    }
                                    aria-label={`${permission.label} ${department.name}`}
                                    className="mx-auto"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={passwordDialogOpen}
        onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) {
            setNewPassword("");
          }
        }}
      >
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
              <div className="rounded-lg border p-3">
                <Label htmlFor="change-password">Change Password</Label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="change-password"
                    type="text"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Password baru minimal 6 karakter"
                    disabled={changingPassword}
                  />
                  <Button
                    type="button"
                    onClick={changePassword}
                    disabled={changingPassword || newPassword.trim().length < 6}
                    className="sm:w-44"
                  >
                    {changingPassword && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Change Password
                  </Button>
                </div>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordDialogOpen(false)}
                >
                  Tutup
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
