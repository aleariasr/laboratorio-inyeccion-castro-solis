export type RecentlyViewedType =
  | "product"
  | "location"
  | "supplier"
  | "purchase"
  | "sale"
  | "customer"
  | "injector"
  | "service"
  | "cash";

export type RecentlyViewedEntry = {
  type: RecentlyViewedType;
  id: number;
  label: string;
  href: string;
  viewedAt: string;
};
