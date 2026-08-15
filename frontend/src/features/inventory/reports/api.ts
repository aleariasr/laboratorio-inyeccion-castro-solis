import { apiGet } from "@/lib/api/client";

import type { StockByLocationReport } from "./types";

export function getStockByLocationReport(
  token: string,
  signal?: AbortSignal,
): Promise<StockByLocationReport> {
  return apiGet<StockByLocationReport>("/api/reports/stock-by-location/", {
    token,
    signal,
  });
}
