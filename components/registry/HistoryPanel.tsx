"use client";
import type { Robot } from "./types";
import {
  CONDITION_LABELS,
  FILE_KIND_LABELS,
  RECORD_KIND_LABELS,
  formatDateTime,
  humanize,
  identityFields,
} from "./labels";

type Model = { id: string; brand: string; model: string };
type Entry = { title: string; details: string[] };

function describe(
  kind: string,
  data: unknown,
  robot: Robot,
  models: Model[],
): Entry {
  const d = (data ?? {}) as Record<string, any>;
  switch (kind) {
    case "CREATED":
      return { title: "Draft created", details: [] };
    case "REGISTERED":
      return {
        title: `Registered as ${d.publicId ?? robot.publicId ?? "a permanent Robot ID"}`,
        details: [],
      };
    case "FILE_ADDED":
      return {
        title: `${FILE_KIND_LABELS[d.kind] ?? "File"} uploaded`,
        details: d.name ? [String(d.name)] : [],
      };
    case "UPDATED": {
      const before = (d.before ?? {}) as Record<string, unknown>;
      const after = (d.after ?? {}) as Record<string, unknown>;
      const fields = identityFields(
        { currency: String(after.currency ?? before.currency ?? "USD") },
        models,
        robot.files,
      );
      const changes = fields
        .filter(({ key }) => key in after)
        .filter(
          ({ key }) => String(before[key] ?? "") !== String(after[key] ?? ""),
        )
        .map(
          ({ key, label, show }) =>
            `${label}: ${show(before[key])} → ${show(after[key])}`,
        );
      return {
        title: "Details updated",
        details: [
          ...(d.reason ? [`Reason: ${d.reason}`] : []),
          ...(changes.length ? changes : ["No visible field changed"]),
        ],
      };
    }
    case "CONDITION_CHANGED":
      return {
        title: `Condition changed to ${CONDITION_LABELS[d.after] ?? humanize(String(d.after ?? ""))}`,
        details: [
          `Previously: ${CONDITION_LABELS[d.before] ?? humanize(String(d.before ?? ""))}`,
          ...(d.reason ? [`Reason: ${humanize(String(d.reason))}`] : []),
        ],
      };
    case "RECORD_ADDED":
    case "RECORD_CORRECTED": {
      const record = robot.records?.find((r) => r.id === d.recordId);
      const type = record
        ? (RECORD_KIND_LABELS[record.kind] ?? humanize(record.kind))
        : "Operational";
      return kind === "RECORD_ADDED"
        ? { title: `${type} record added`, details: [] }
        : {
            title: `${type} record corrected`,
            details: d.correctionReason
              ? [`Reason: ${d.correctionReason}`]
              : [],
          };
    }
    case "RETIRED":
      return {
        title: "Retired from use",
        details: d.reason ? [`Reason: ${d.reason}`] : [],
      };
    default:
      return { title: humanize(kind), details: [] };
  }
}

export default function HistoryPanel({
  robot,
  models,
}: {
  robot: Robot;
  models: Model[];
}) {
  const audit = [...(robot.audit ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return (
    <section id="history" className="space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">History</h2>
      <p className="text-sm text-neutral-600">
        Every change is kept, newest first.
      </p>
      {audit.length === 0 ? (
        <p className="text-sm text-neutral-500">No history yet.</p>
      ) : (
        <ol className="space-y-3">
          {audit.map((a) => {
            const entry = describe(a.kind, a.data, robot, models);
            return (
              <li key={a.id} className="border-l-2 border-neutral-300 pl-4">
                <p className="font-semibold">{entry.title}</p>
                <p className="text-sm text-neutral-500">
                  {formatDateTime(a.createdAt)} · {a.actorEmail}
                </p>
                {entry.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
                    {entry.details.map((line) => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
