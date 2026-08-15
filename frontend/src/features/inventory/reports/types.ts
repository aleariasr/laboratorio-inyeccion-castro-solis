export type StockByLocationProduct = {
  id: number;
  standard_code: string;
  name: string;
  current_stock: number;
  minimum_stock: number;
};

export type StockByLocationEntry = {
  id: number;
  code: string;
  description: string;
  total_stock: number;
  products: StockByLocationProduct[];
};

export type StockByLocationReport = {
  results: StockByLocationEntry[];
};
