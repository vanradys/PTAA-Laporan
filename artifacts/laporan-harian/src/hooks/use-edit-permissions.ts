import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/apiRequest";

export const currentEditPermissionsQueryKey = ["edit-permissions-current"] as const;

type EditPermissionsResponse = {
  permissions: Record<string, boolean>;
};

export function useEditPermissions() {
  const { user } = useAuth();
  const userRole = String(user?.role ?? "").toLowerCase();

  const query = useQuery({
    queryKey: [...currentEditPermissionsQueryKey, user?.id],
    queryFn: () => apiRequest<EditPermissionsResponse>("/api/edit-permissions/me"),
    enabled: Boolean(user),
    retry: false,
    staleTime: 30_000,
  });

  const canEdit = (permissionKey: string, fallback = true) => {
    if (userRole === "admin") return true;

    const value = query.data?.permissions?.[permissionKey];
    return typeof value === "boolean" ? value : fallback;
  };

  return {
    ...query,
    canEdit,
  };
}
