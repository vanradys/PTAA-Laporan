import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  avatarInitials: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refetchUser: () => void;
  clearUser: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refetchUser: () => {},
  clearUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: getGetCurrentUserQueryKey(),
    queryFn: getCurrentUser,
    retry: false,
    enabled,
  });

  const user = (data as User | undefined) ?? null;

  const clearUser = () => {
    setEnabled(false);
    queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
    setTimeout(() => setEnabled(true), 100);
  };

  const refetchUser = () => {
    setEnabled(true);
    refetch();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, refetchUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
