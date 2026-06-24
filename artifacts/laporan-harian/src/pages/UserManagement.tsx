import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
                <table className="w-full min-w-[1040px] text-sm">
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
                              const action = item.isActive ? "menonaktifkan" : "mengaktifkan";
                              if (window.confirm(`Yakin ingin ${action} akun ${item.name}?`)) {
                                void updateUser(item.id, { isActive: !item.isActive });
                              }
                            }}
                            title={item.id === user.id ? "Akun Admin yang sedang digunakan tidak dapat dinonaktifkan" : undefined}
                          >
                            {updatingUserId === item.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                            {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        </td>
                        <td className="px-4 py-3">
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
    </Layout>
  );
}
