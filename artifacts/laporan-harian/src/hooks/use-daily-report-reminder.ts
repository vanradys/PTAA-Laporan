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

export const missingDailyReportsQueryKey = (date?: string) => ["missing-daily-reports-today", date ?? "today"] as const;

function buildMissingReportsUrl(date?: string) {
  const params = new URLSearchParams();

  if (date) {
    params.set("date", date);
  }

  const query = params.toString();
  return query ? `/api/daily-reports/missing/today?${query}` : "/api/daily-reports/missing/today";
}

export function useMissingDailyReportsToday(enabled = true, date?: string) {
  return useQuery({
    queryKey: missingDailyReportsQueryKey(date),
    enabled,
    queryFn: () => customFetch<MissingDailyReportUser[]>(buildMissingReportsUrl(date)),
  });
}

export function useSendMissingDailyReportReminder() {
  return useMutation<SendReminderResult, Error, { date?: string }>({
    mutationFn: (payload) =>
      customFetch<SendReminderResult>("/api/daily-reports/remind-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: payload.date }),
      }),
  });
}
