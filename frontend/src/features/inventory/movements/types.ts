import type { StockMovementProductSummary } from "../products/types";

export type StockMovementType =
  | "ENTRY"
  | "EXIT"
  | "ADJUSTMENT"
  | "INITIAL"
  | "REVERSAL"
  | "SERVICE_USE"
  | "TRANSFER_OUT";

export type MovementDirection = "IN" | "OUT";

export type StockMovement = {
  id: number;
  product: number;
  product_detail: StockMovementProductSummary;
  movement_type: StockMovementType;
  movement_type_display: string;
  direction: MovementDirection;
  direction_display: string;
  quantity: number;
  purchase_item: number | null;
  purchase_id: number | null;
  purchase_invoice_number: string | null;
  sale_item: number | null;
  sale_id: number | null;
  inventory_count: number | null;
  inventory_count_reference: string | null;
  service_accessory: number | null;
  /** Servicio del accesorio, o null si el accesorio ya se borró. */
  service_record_id: number | null;
  /** Traslado a otra sede del que viene (punto 6), o null. */
  stock_transfer_id: number | null;
  reverses_movement: number | null;
  notes: string;
  created_by_username: string | null;
  created_at: string;
};

export type StockMovementFilters = {
  productId?: number;
  locationId?: number;
  movementType: "" | StockMovementType;
  direction: "" | MovementDirection;
  dateFrom: string;
  dateTo: string;
  purchaseId?: number;
  saleId?: number;
  inventoryCountId?: number;
  ordering: "created_at" | "-created_at";
  page: number;
  pageSize: number;
};

export const EMPTY_STOCK_MOVEMENT_FILTERS: StockMovementFilters = {
  movementType: "",
  direction: "",
  dateFrom: "",
  dateTo: "",
  ordering: "-created_at",
  page: 1,
  pageSize: 25,
};

export const STOCK_MOVEMENT_TYPE_OPTIONS: Array<{
  value: StockMovementType;
  label: string;
}> = [
  { value: "ENTRY", label: "Entrada" },
  { value: "EXIT", label: "Salida" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "INITIAL", label: "Inventario inicial" },
  { value: "REVERSAL", label: "Reversión" },
  { value: "SERVICE_USE", label: "Uso en servicio" },
  { value: "TRANSFER_OUT", label: "Traslado a sede" },
];

export const MOVEMENT_DIRECTION_OPTIONS: Array<{
  value: MovementDirection;
  label: string;
}> = [
  { value: "IN", label: "Entrada" },
  { value: "OUT", label: "Salida" },
];

export type { StockMovementProductSummary };
