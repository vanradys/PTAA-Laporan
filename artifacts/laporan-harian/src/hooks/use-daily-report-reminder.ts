import { useMutation, useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface MissingDailyReportUser {
  id: number;
  name: string;
  email: string;
  role: string;
  departmentId: number | null;
  departmentName: string | null;
  reportDate: string;
  status: "Belum Mengisi";
  reminderSent: boolean;
}

export interface SendReminderResult {
  success: boolean;
  reportDate: string;
  sentCount: number;
  skippedCount: number;
  totalMissing: number;
  sentUsers: MissingDailyReportUser[];
  pushSuccessCount: number;
  pushFailedCount: number;
  pushInvalidTokenRemovedCount: number;
  message: string;
}

export const missingDailyReportsQueryKey = ["missing-daily-reports-today"] as const;

export function useMissingDailyReportsToday(enabled = true) {
  return useQuery({
    queryKey: missingDailyReportsQueryKey,
    enabled,
    queryFn: () => customFetch<MissingDailyReportUser[]>("/api/daily-reports/missing/today"),
  });
}

export function useSendMissingDailyReportReminder() {
  return useMutation<SendReminderResult, Error, void>({
    mutationFn: () =>
      customFetch<SendReminderResult>("/api/daily-reports/remind-missing", {
        method: "POST",
      }),
  });
}