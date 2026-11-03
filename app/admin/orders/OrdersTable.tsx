"use client";

import { SafeAdminReservation } from "@/types";
import axios from "axios";
import React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";
import StatusBadge from "@/components/orders/StatusBadge";

type Props = {
  reservations: SafeAdminReservation[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OrdersTable({ reservations }: Props) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingOperatorFor, setSavingOperatorFor] = useState<string | null>(null);

  // Who physically performs the service. Recorded only — setting it assigns
  // nothing and notifies nobody.
  const handleOperator = async (id: string, operatorEmail: string) => {
    setSavingOperatorFor(id);
    try {
      await axios.patch(`/api/reservations/${id}/operator`, { operatorEmail });
      toast.success(operatorEmail ? "Operator recorded" : "Operator cleared");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not record the operator");
    } finally {
      setSavingOperatorFor(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm("Cancel this booking?")) return;
    setDeletingId(id);
    try {
      await axios.patch(`/api/reservations/${id}/status`, { status: "CANCELLED" });
      toast.success("Booking cancelled");
      router.refresh(); // re-runs page.tsx server action with current search params
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Something went wrong");
    } finally {
      setDeletingId(null);
    }
  };

  if (reservations.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Dates</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Total</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Booked On</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-8 text-center text-gray-500" colSpan={7}>
                No bookings found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-gray-200 rounded-lg text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Customer</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Service</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Dates</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Total</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Booked On</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {reservations.map((r) => (
            <React.Fragment key={r.id}>
              <tr className="hover:bg-gray-50 transition">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    aria-expanded={expandedId === r.id}
                    className="text-gray-900 font-medium hover:underline text-left"
                  >
                    {r.customerName || "(no name)"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-900">{r.listing.title}</div>
                  <div className="text-gray-500 text-xs">{r.listing.category}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {formatDate(r.startDate)} → {formatDate(r.endDate)}
                </td>
                <td className="px-4 py-3 text-gray-900">${r.totalPrice}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleCancel(r.id)}
                    disabled={deletingId === r.id}
                    className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {deletingId === r.id ? "Cancelling…" : "Cancel"}
                  </button>
                </td>
              </tr>
              {expandedId === r.id && (
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-4 py-3 text-sm text-gray-600">
                    <span className="mr-4">
                      <span className="font-medium">Email:</span> {r.customerEmail || "—"}
                    </span>
                    <span className="mr-4">
                      <span className="font-medium">Phone:</span> {r.customerPhone ?? "—"}
                    </span>
                    <span>
                      <span className="font-medium">Business:</span>{" "}
                      {r.customerBusinessName ?? "—"}
                    </span>
                    <form
                      className="mt-3 flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = new FormData(event.currentTarget).get("operatorEmail");
                        handleOperator(r.id, String(value ?? "").trim());
                      }}
                    >
                      <label htmlFor={`operator-${r.id}`} className="font-medium">
                        Performed by
                      </label>
                      <input
                        id={`operator-${r.id}`}
                        name="operatorEmail"
                        type="email"
                        defaultValue={r.operatorEmail ?? ""}
                        placeholder="operator@company.com"
                        className="rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={savingOperatorFor === r.id}
                        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingOperatorFor === r.id ? "Saving…" : "Save"}
                      </button>
                      <span className="text-xs text-gray-500">
                        {r.operatorLabel
                          ? `Currently ${r.operatorLabel}. Leave empty to clear.`
                          : "Not recorded — the provider is assumed to perform it."}
                      </span>
                    </form>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
