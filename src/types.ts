export interface Store {
  id: string
  name: string
  color: string
}

export type Category =
  | 'Bakery'
  | 'Dairy & Eggs'
  | 'Meat & Poultry'
  | 'Fruit & Veg'
  | 'Pantry'
  | 'Beverages'
  | 'Household'
  | 'Snacks'

export interface Product {
  id: string
  name: string
  unit: string
  category: Category
  /** Price in ZAR per store id. `null` means not stocked / not available at that store. */
  prices: Record<string, number | null>
}

export interface BasketItem {
  productId: string
  quantity: number
}
