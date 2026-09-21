interface QuantityStepperProps {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
}

export function QuantityStepper({ quantity, onIncrement, onDecrement }: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDecrement}
        disabled={quantity === 0}
        aria-label="Decrease quantity"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-neutral-600 transition hover:border-green-600 hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-neutral-600 dark:text-neutral-300"
      >
        −
      </button>
      <span className="w-5 text-center text-sm font-medium tabular-nums">{quantity}</span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label="Increase quantity"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-neutral-300 text-neutral-600 transition hover:border-green-600 hover:text-green-700 dark:border-neutral-600 dark:text-neutral-300"
      >
        +
      </button>
    </div>
  )
}
