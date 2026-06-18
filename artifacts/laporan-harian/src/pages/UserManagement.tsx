import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Users } from "lucide-react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleDisplayName } from "@/lib/roleDisplay";

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

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "direktur", label: "Direktur" },
  { value: "karyawan", label: "Karyawan / Admin Marketing 1 sesuai departemen" },
  { value: "admin_marketing", label: "Admin Marketing 2" },
  { value: "monitoring_dummy", label: "Monitoring Laporan" },
];

export default function UserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery({
    queryKey: ["user-management"],
    queryFn: () => apiRequest<UserRow[]>("/api/users"),
    enabled: user?.role === "admin",
  });
  const { data: departments } = useQuery({
    queryKey: ["departments-user-management"],
    queryFn: () => apiRequest<Department[]>("/api/departments"),
    enabled: user?.role === "admin",
  });

  const updateUser = async (id: number, changes: Partial<UserRow>) => {
    await apiRequest(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    await queryClient.invalidateQueries({ queryKey: ["user-management"] });
    toast({ title: "Berhasil", description: "Data user dan hak akses diperbarui." });
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
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Daftar User</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead><tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left">Nama</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Departemen</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr></thead>
                  <tbody>
                    {(users ?? []).map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <Input
                            defaultValue={item.name}
                            onBlur={(event) => {
                              const name = event.target.value.trim();
                              if (name && name !== item.name) updateUser(item.id, { name });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.email}</td>
                        <td className="px-4 py-3">
                          <Select value={item.role} onValueChange={(role) => updateUser(item.id, { role })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.value === "karyawan" && item.departmentCode === "MKT"
                                  ? getRoleDisplayName(role.value, item.departmentCode, item.departmentName)
                                  : role.label}
                              </SelectItem>
                            ))}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Select value={String(item.departmentId ?? "none")} onValueChange={(value) => updateUser(item.id, { departmentId: value === "none" ? null : Number(value) })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Tanpa Departemen</SelectItem>
                              {(departments ?? []).map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant={item.isActive ? "outline" : "destructive"} size="sm" onClick={() => updateUser(item.id, { isActive: !item.isActive })}>
                            <Save className="mr-1.5 h-3.5 w-3.5" />{item.isActive ? "Aktif" : "Nonaktif"}
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
