// Operator-facing wording for registry data. Database column names and enum
// values never reach the screen; everything shown goes through these maps.
import type { Robot, RobotFile } from "./types";

export const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  REGISTERED: "Registered",
  RETIRED: "Retired",
};

export const CONDITION_LABELS: Record<string, string> = {
  AWAITING_INSPECTION: "Awaiting inspection",
  USABLE: "Ready for use",
  MAINTENANCE: "Needs maintenance",
};

export const FILE_KIND_LABELS: Record<string, string> = {
  NAMEPLATE: "Nameplate photo",
  PRESENTATION: "Public photo",
  ATTACHMENT: "Private attachment",
};

export const RECORD_KIND_LABELS: Record<string, string> = {
  USAGE: "Usage",
  DAMAGE: "Damage",
  MAINTENANCE: "Maintenance",
  INSPECTION: "Inspection",
};

export const RECORD_FIELD_LABELS: Record<string, string> = {
  startTime: "Start time",
  endTime: "End time",
  time: "Event time",
  purpose: "Purpose",
  operator: "Actual operator",
  result: "Outcome",
  description: "Description",
  affectsUse: "Affects use",
  work: "Work performed",
  technician: "Technician",
  inspectionResult: "Inspection result",
  inspector: "Inspector",
  passed: "Passed",
  reason: "Notes",
};

const INSPECTION_RESULT_LABELS: Record<string, string> = {
  PENDING: "Pending",
  FAILED: "Not passed",
  PASSED: "Passed",
};

export function humanize(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatMoney(value: string | number | null, currency: string) {
  if (value === null || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatHours(value: string | number | null) {
  if (value === null || value === "") return "—";
  const hours = Number(value);
  return Number.isFinite(hours)
    ? `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`
    : String(value);
}

/** Label/value rows for an operational record, in a stable reading order. */
export function recordRows(data: Record<string, unknown>) {
  return Object.keys(RECORD_FIELD_LABELS)
    .filter((key) => key in data)
    .map((key) => {
      const value = data[key];
      let shown: string;
      if (typeof value === "boolean") shown = value ? "Yes" : "No";
      else if (key === "inspectionResult")
        shown =
          INSPECTION_RESULT_LABELS[String(value)] ?? humanize(String(value));
      else if (key === "startTime" || key === "endTime" || key === "time")
        shown = formatDateTime(String(value));
      else shown = String(value ?? "—");
      return { label: RECORD_FIELD_LABELS[key], value: shown };
    });
}

type ModelName = { id: string; brand: string; model: string };

/** Identity fields an administrator edits, with how to display each value. */
export function identityFields(
  robot: Partial<Robot>,
  models: ModelName[],
  files: RobotFile[] = [],
) {
  const modelName = (id: unknown) => {
    const m = models.find((x) => x.id === id);
    return m ? `${m.brand} ${m.model}` : id ? "Unknown model" : "—";
  };
  const fileName = (id: unknown) =>
    id ? (files.find((f) => f.id === id)?.name ?? "Uploaded file") : "—";
  const text = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);
  const currency = robot.currency || "USD";
  return [
    { key: "modelId", label: "Robot model", show: modelName },
    { key: "serialNumber", label: "Manufacturer serial number", show: text },
    { key: "ownerName", label: "Owner", show: text },
    { key: "location", label: "Private location", show: text },
    { key: "insurance", label: "Insurance", show: text },
    { key: "tracker", label: "Tracker", show: text },
    {
      key: "replacementValue",
      label: "Replacement value",
      show: (v: unknown) => formatMoney(v as string | null, currency),
    },
    { key: "currency", label: "Currency", show: text },
    {
      key: "operatingHours",
      label: "Operating hours",
      show: (v: unknown) => formatHours(v as string | null),
    },
    { key: "firmwareVersion", label: "Firmware version", show: text },
    { key: "oemDeviceId", label: "OEM device ID", show: text },
    { key: "nameplateId", label: "Nameplate photo", show: fileName },
    { key: "presentationId", label: "Public photo", show: fileName },
    { key: "notes", label: "Notes", show: text },
  ] as const;
}
