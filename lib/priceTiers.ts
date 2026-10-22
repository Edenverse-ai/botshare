// Wording for a robot model's optional price sheet (RobotModelPriceTier rows),
// shared by the Robot Registry and the create-service dialog.
export type PriceTier = {
  unit: "DAY" | "MONTH";
  minQty: number;
  maxQty: number | null;
  pricing: "PER_UNIT" | "TOTAL";
  amount: number;
};

export function formatUsd(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : `$${value.toLocaleString("en-US")}`;
}

/** "4–7 days · $3,849 total", "3+ months · $6,599 per month". */
export function formatTier(t: PriceTier) {
  const noun = t.unit === "DAY" ? "day" : "month";
  const span =
    t.maxQty === null
      ? `${t.minQty}+ ${noun}s`
      : t.maxQty === t.minQty
        ? `${t.minQty} ${noun}${t.minQty === 1 ? "" : "s"}`
        : `${t.minQty}–${t.maxQty} ${noun}s`;
  return `${span} · ${formatUsd(t.amount)} ${t.pricing === "TOTAL" ? "total" : `per ${noun}`}`;
}
