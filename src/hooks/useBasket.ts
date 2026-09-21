import { useCallback, useEffect, useState } from 'react'
import type { BasketItem } from '../types'

const STORAGE_KEY = 'grocery-sa-basket'

function loadBasket(): BasketItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is BasketItem =>
        typeof item?.productId === 'string' && typeof item?.quantity === 'number',
    )
  } catch {
    return []
  }
}

export function useBasket() {
  const [basket, setBasket] = useState<BasketItem[]>(loadBasket)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(basket))
  }, [basket])

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setBasket((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.productId !== productId)
      }
      const existing = prev.find((item) => item.productId === productId)
      if (existing) {
        return prev.map((item) => (item.productId === productId ? { ...item, quantity } : item))
      }
      return [...prev, { productId, quantity }]
    })
  }, [])

  const increment = useCallback((productId: string) => {
    setBasket((prev) => {
      const existing = prev.find((item) => item.productId === productId)
      if (existing) {
        return prev.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...prev, { productId, quantity: 1 }]
    })
  }, [])

  const decrement = useCallback((productId: string) => {
    setBasket((prev) => {
      const existing = prev.find((item) => item.productId === productId)
      if (!existing) return prev
      if (existing.quantity <= 1) {
        return prev.filter((item) => item.productId !== productId)
      }
      return prev.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item,
      )
    })
  }, [])

  const remove = useCallback((productId: string) => {
    setBasket((prev) => prev.filter((item) => item.productId !== productId))
  }, [])

  const clear = useCallback(() => setBasket([]), [])

  return { basket, setQuantity, increment, decrement, remove, clear }
}
