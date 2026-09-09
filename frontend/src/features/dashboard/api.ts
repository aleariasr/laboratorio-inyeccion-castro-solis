import { apiGet } from "@/lib/api/client";

import type { DashboardSummary } from "./types";

export function getDashboardSummary(
  token: string,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  return apiGet<DashboardSummary>("/api/dashboard/summary/", {
    token,
    signal,
  });
}
