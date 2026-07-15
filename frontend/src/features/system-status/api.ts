import { apiGet } from "@/lib/api/client";

import type { SystemStatusResponse } from "./types";

export function getSystemStatus(
  token: string,
  signal?: AbortSignal,
): Promise<SystemStatusResponse> {
  return apiGet<SystemStatusResponse>(
    "/api/system/status/",
    {
      token,
      signal,
    },
  );
}