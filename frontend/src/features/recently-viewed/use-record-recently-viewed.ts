"use client";

import { useEffect } from "react";

import { recordRecentlyViewed } from "./storage";
import type { RecentlyViewedEntry } from "./types";

export type RecentlyViewedInput = Omit<RecentlyViewedEntry, "viewedAt">;

export function useRecordRecentlyViewed(
  entry: RecentlyViewedInput | null,
): void {
  const { type, id, label, href } = entry ?? {};

  useEffect(() => {
    if (!type || id === undefined || !label || !href) {
      return;
    }

    recordRecentlyViewed({
      type,
      id,
      label,
      href,
      viewedAt: new Date().toISOString(),
    });
  }, [type, id, label, href]);
}
