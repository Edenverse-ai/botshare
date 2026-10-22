"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { RobotModelOption } from "@/hook/useRobotModels";
import { formatUsd, type PriceTier } from "@/lib/priceTiers";

export type RegisteredRobot = {
  id: string;
  publicId: string;
  model: RobotModelOption & { priceTiers: PriceTier[] };
};

type Props = {
  selectedId: string | null;
  onSelect: (robot: RegisteredRobot | null) => void;
};

// Services can only be built on robots registered in the Robot Registry.
function RegisteredRobotPicker({ selectedId, onSelect }: Props) {
  const [robots, setRobots] = useState<RegisteredRobot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/registered-robots")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load registered robots (${r.status})`);
        return r.json();
      })
      .then((data: RegisteredRobot[]) => live && setRobots(data))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return robots.filter((r) => {
      const haystack = `${r.publicId} ${r.model.brand} ${r.model.model} ${r.model.productName}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [robots, query]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by Robot ID or model (e.g. HFB-RB-000001, FF Master)"
        className="w-full rounded-md border-2 border-neutral-300 p-3 outline-none focus:border-black"
      />
      <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
        {loading && <p className="py-6 text-center text-sm text-neutral-500">Loading registered robots…</p>}
        {error && <p className="py-6 text-center text-sm text-neutral-700">{error}</p>}
        {!loading && !error && robots.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">
            No registered robots yet. A robot must be registered in the Robot Registry before it can be listed.
          </p>
        )}
        {!loading && robots.length > 0 && results.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">No registered robot matches that search.</p>
        )}
        {results.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              type="button"
              key={r.id}
              onClick={() => onSelect(r)}
              className={`flex items-center gap-3 rounded-md border p-2 text-left transition ${
                active ? "border-black bg-neutral-50 ring-1 ring-black" : "border-neutral-200 hover:border-neutral-400"
              }`}
            >
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-neutral-100">
                {r.model.imageUrl ? (
                  <Image src={r.model.imageUrl} alt={r.model.productName} fill sizes="56px" className="object-contain" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[10px] text-neutral-400">No image</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{r.publicId}</p>
                <p className="truncate text-sm">
                  {r.model.brand} {r.model.model}
                </p>
              </div>
              <p className="shrink-0 text-sm text-neutral-600">
                {r.model.priceDaily != null ? `${formatUsd(r.model.priceDaily)}/day` : "No price set"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RegisteredRobotPicker;
