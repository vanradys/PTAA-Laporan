import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/apiRequest";

export const currentFeatureVisibilityQueryKey = ["department-visibility-current"] as const;

type FeatureVisibilityResponse = {
  permissions: Record<string, boolean>;
};

export function useFeatureVisibility() {
  const { user } = useAuth();
  const userRole = String(user?.role ?? "").toLowerCase();

  const query = useQuery({
    queryKey: [...currentFeatureVisibilityQueryKey, user?.id],
    queryFn: () => apiRequest<FeatureVisibilityResponse>("/api/department-visibility/me"),
    enabled: Boolean(user),
    retry: false,
    staleTime: 30_000,
  });

  const canViewFeature = (featureKey: string, fallback = true) => {
    if (userRole === "admin") return true;

    const value = query.data?.permissions?.[featureKey];
    return typeof value === "boolean" ? value : fallback;
  };

  return {
    ...query,
    canViewFeature,
  };
}
