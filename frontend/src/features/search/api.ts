import { apiGet } from "@/lib/api/client";

import type { UniversalSearchResponse } from "./types";

export function universalSearch(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<UniversalSearchResponse> {
  const searchParams = new URLSearchParams({
    q: query.trim(),
  });

  return apiGet<UniversalSearchResponse>(
    `/api/search/?${searchParams.toString()}`,
    {
      token,
      signal,
    },
  );
}
