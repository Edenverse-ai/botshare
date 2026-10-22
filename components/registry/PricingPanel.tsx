"use client";
import { useState } from "react";
import { formatTier } from "./labels";
import { PriceTier, RegistryModel, RobotPanelProps, button, field } from "./types";

type Row = {
  key: number;
  unit: "DAY" | "MONTH";
  minQty: string;
  maxQty: string;
  pricing: "PER_UNIT" | "TOTAL";
  amount: string;
};

let nextKey = 1;
const toRow = (t: PriceTier): Row => ({
  key: nextKey++,
  unit: t.unit,
  minQty: String(t.minQty),
  maxQty: t.maxQty === null ? "" : String(t.maxQty),
  pricing: t.pricing,
  amount: String(t.amount),
});
const blank = (unit: "DAY" | "MONTH"): Row => ({
  key: nextKey++,
  unit,
  minQty: "",
  maxQty: "",
  pricing: unit === "DAY" ? "TOTAL" : "PER_UNIT",
  amount: "",
});
const whole = (value: string) => (value.trim() === "" ? null : Number(value));

// The price sheet belongs to the robot's model, so every robot of that model
// shares it. Every price is optional.
export default function PricingPanel({
  robot,
  model,
  call,
  busy,
  run,
  reload,
}: RobotPanelProps & { model: RegistryModel | undefined }) {
  const [daily, setDaily] = useState(model?.priceDaily?.toString() ?? "");
  const [monthly, setMonthly] = useState(model?.priceMonthly?.toString() ?? "");
  const [rows, setRows] = useState<Row[]>(() => (model?.priceTiers ?? []).map(toRow));

  if (!model) {
    return (
      <section id="pricing" className="space-y-2 rounded-xl border p-4">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <p className="text-neutral-600">
          Choose a robot model in Details first. Prices are set per model.
        </p>
      </section>
    );
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((all) => all.filter((r) => r.key !== key));

  const save = () =>
    run(async () => {
      await call(`models/${model.id}/pricing`, "POST", {
        priceDaily: whole(daily),
        priceMonthly: whole(monthly),
        tiers: rows
          .filter((r) => r.minQty.trim() !== "" || r.amount.trim() !== "")
          .map((r) => ({
            unit: r.unit,
            minQty: Number(r.minQty),
            maxQty: whole(r.maxQty),
            pricing: r.pricing,
            amount: Number(r.amount),
          })),
        robotId: robot.id,
      });
      await reload();
    });

  const tierTable = (unit: "DAY" | "MONTH") => {
    const list = rows.filter((r) => r.unit === unit);
    const noun = unit === "DAY" ? "days" : "months";
    return (
      <fieldset className="space-y-3">
        <legend className="font-semibold">
          {unit === "DAY" ? "Daily rental tiers" : "Monthly rental tiers"} (optional)
        </legend>
        {list.length === 0 && (
          <p className="text-sm text-neutral-500">No {unit === "DAY" ? "daily" : "monthly"} tiers.</p>
        )}
        {list.map((r, i) => (
          <div
            key={r.key}
            className="grid grid-cols-2 items-end gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-[1fr_1fr_1.6fr_1.2fr_auto]"
          >
            <label className="text-sm">
              From ({noun})
              <input
                aria-label={`${unit === "DAY" ? "Day" : "Month"} tier ${i + 1} from`}
                className={field}
                type="number"
                min="1"
                inputMode="numeric"
                value={r.minQty}
                onChange={(e) => update(r.key, { minQty: e.target.value })}
              />
            </label>
            <label className="text-sm">
              To ({noun}, blank = no limit)
              <input
                aria-label={`${unit === "DAY" ? "Day" : "Month"} tier ${i + 1} to`}
                className={field}
                type="number"
                min="1"
                inputMode="numeric"
                value={r.maxQty}
                onChange={(e) => update(r.key, { maxQty: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Price type
              <select
                aria-label={`${unit === "DAY" ? "Day" : "Month"} tier ${i + 1} price type`}
                className={field}
                value={r.pricing}
                onChange={(e) => update(r.key, { pricing: e.target.value as Row["pricing"] })}
              >
                <option value="PER_UNIT">{unit === "DAY" ? "Per day" : "Per month"}</option>
                <option value="TOTAL">Total for the whole tier</option>
              </select>
            </label>
            <label className="text-sm">
              Amount (USD)
              <input
                aria-label={`${unit === "DAY" ? "Day" : "Month"} tier ${i + 1} amount`}
                className={field}
                type="number"
                min="0"
                inputMode="numeric"
                value={r.amount}
                onChange={(e) => update(r.key, { amount: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="rounded-lg border px-3 py-3 text-sm hover:border-black disabled:opacity-50"
              disabled={busy}
              onClick={() => remove(r.key)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-semibold hover:border-black disabled:opacity-50"
          disabled={busy}
          onClick={() => setRows((all) => [...all, blank(unit)])}
        >
          Add {unit === "DAY" ? "daily" : "monthly"} tier
        </button>
      </fieldset>
    );
  };

  return (
    <section id="pricing" className="space-y-5 rounded-xl border p-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <p className="text-sm text-neutral-600">
          Price sheet for <b>{model.brand} {model.model}</b>. Changes apply to every
          robot of this model. All prices are optional; customers are charged the
          daily price at checkout for now.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Daily price (USD)
          <input
            className={field}
            type="number"
            min="0"
            inputMode="numeric"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
          />
        </label>
        <label>
          Monthly price (USD)
          <input
            className={field}
            type="number"
            min="0"
            inputMode="numeric"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </label>
      </div>
      {tierTable("DAY")}
      {tierTable("MONTH")}
      <button className={button} disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save model pricing"}
      </button>
      {(model.priceTiers?.length ?? 0) > 0 && (
        <div className="rounded-lg bg-neutral-50 p-3 text-sm">
          <p className="font-semibold">Saved tiers</p>
          <ul className="mt-1 space-y-0.5">
            {model.priceTiers!.map((t) => (
              <li key={`${t.unit}-${t.minQty}`}>{formatTier(t)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
