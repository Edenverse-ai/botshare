"use client";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import IdentityPanel from "./IdentityPanel";
import RobotLabel from "./RobotLabel";
import RecordPanel from "./RecordPanel";
import HistoryPanel from "./HistoryPanel";
import { CONDITION_LABELS, LIFECYCLE_LABELS, identityFields } from "./labels";
import { Robot, field, button } from "./types";

type Model = { id: string; brand: string; model: string };
function numberOrNull(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? Number(text) : null;
}

export default function RegistryDashboard({
  environment,
}: {
  environment: string;
}) {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState<Robot | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "robot">("list");
  const [editing, setEditing] = useState(false);
  const pendingKeys = useRef(new Map<string, string>());
  const call = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      const identity = `${method}:${path}:${serialized}`;
      const key = pendingKeys.current.get(identity) || crypto.randomUUID();
      if (method !== "GET") pendingKeys.current.set(identity, key);
      const response = await fetch(`/api/registry/${path}`, {
        method,
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: serialized,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");
      pendingKeys.current.delete(identity);
      return data;
    },
    [],
  );
  const refresh = useCallback(
    async () =>
      setRobots(await call(`robots?search=${encodeURIComponent(search)}`)),
    [call, search],
  );
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    call("models")
      .then(setModels)
      .catch((e) => setError(e.message));
  }, [call]);
  useEffect(() => {
    const publicId = new URLSearchParams(window.location.search).get(
      "publicId",
    );
    if (publicId)
      call(`robots?search=${encodeURIComponent(publicId)}`)
        .then(async (matches: Robot[]) => {
          const robot = matches.find((r) => r.publicId === publicId);
          if (robot) {
            setSelected(await call(`robots/${robot.id}`));
            setView("robot");
          }
        })
        .catch((e) => setError(e.message));
  }, [call]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  function openNew() {
    setSelected(null);
    setEditing(true);
    setView("robot");
  }
  function openRobot(id: string) {
    act(async () => {
      setSelected(await call(`robots/${id}`));
      setEditing(false);
      setView("robot");
      window.scrollTo({ top: 0 });
    });
  }
  function backToList() {
    setSelected(null);
    setEditing(false);
    setView("list");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(async () => {
      const data = {
        modelId: form.get("modelId") || null,
        serialNumber: form.get("serialNumber") || null,
        ownerName: form.get("ownerName"),
        location: form.get("location"),
        notes: form.get("notes"),
        insurance: form.get("insurance"),
        tracker: form.get("tracker"),
        replacementValue: numberOrNull(form.get("replacementValue")),
        currency: form.get("currency"),
        operatingHours: numberOrNull(form.get("operatingHours")),
        firmwareVersion: form.get("firmwareVersion"),
        oemDeviceId: form.get("oemDeviceId"),
        ...(selected
          ? {
              nameplateId: form.get("nameplateId") || null,
              presentationId: form.get("presentationId") || null,
            }
          : {}),
      };
      const robot = selected
        ? await call(`robots/${selected.id}`, "PATCH", {
            ...data,
            version: selected.version,
            reason: form.get("reason"),
            ownerConfirmed: form.get("ownerConfirmed") === "on",
          })
        : await call("robots", "POST", data);
      setSelected(robot);
      setSelected(await call(`robots/${robot.id}`));
      setEditing(false);
    });
  }
  const sections = selected
    ? [
        ["details", "Details"],
        ["evidence", "Photos & registration"],
        ...(selected.publicId
          ? [
              ["label", "QR label"],
              ["records", "Records"],
            ]
          : []),
        ["history", "History"],
      ]
    : [];
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-neutral-500">
          Hifivebot · Infrastructure
        </p>
        <h1 className="text-3xl font-bold">Robot registry</h1>
        <p className="text-neutral-600">
          Independent physical robot passports.
        </p>
        {environment !== "production" && (
          <p className="mt-3 rounded border border-black bg-neutral-100 p-3">
            {environment.toUpperCase()} — Test records and labels are not
            production asset registrations.
          </p>
        )}
      </header>
      {error && (
        <p role="alert" className="rounded border border-black p-3">
          {error}
        </p>
      )}

      {view === "list" ? (
        <section aria-label="Robots" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block w-full sm:max-w-sm">
              Search Robot ID or serial
              <input
                className={field}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button className={button} disabled={busy} onClick={openNew}>
              New draft
            </button>
          </div>
          {robots.length === 0 ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-neutral-500">
              {search
                ? "No robot matches that ID or serial."
                : "No robots yet. Choose New draft to add the first one."}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {robots.map((r) => (
                <li key={r.id}>
                  <button
                    disabled={busy}
                    onClick={() => openRobot(r.id)}
                    className="flex h-full w-full flex-col gap-3 rounded-xl border border-neutral-300 bg-white p-4 text-left transition hover:border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-60"
                  >
                    <span className="flex flex-wrap gap-2">
                      <Chip strong={r.lifecycle === "REGISTERED"}>
                        {LIFECYCLE_LABELS[r.lifecycle] ?? r.lifecycle}
                      </Chip>
                      {r.lifecycle === "REGISTERED" && (
                        <Chip>
                          {CONDITION_LABELS[r.condition] ?? r.condition}
                        </Chip>
                      )}
                    </span>
                    <span className="font-mono text-2xl font-bold tracking-tight">
                      {r.publicId ?? "Draft"}
                    </span>
                    <span className="font-semibold">
                      {r.model
                        ? `${r.model.brand} ${r.model.model}`
                        : "Model not set"}
                    </span>
                    <span className="mt-auto break-words text-sm text-neutral-500">
                      {r.serialNumber
                        ? `S/N ${r.serialNumber}`
                        : "No serial number yet"}
                      {r.location ? ` · ${r.location}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="space-y-5">
          <button
            className="text-sm font-semibold underline underline-offset-4"
            onClick={backToList}
            disabled={busy}
          >
            ← All robots
          </button>
          <div className="space-y-3 rounded-xl border border-black p-5">
            <div className="flex flex-wrap gap-2">
              {selected ? (
                <>
                  <Chip strong={selected.lifecycle === "REGISTERED"}>
                    {LIFECYCLE_LABELS[selected.lifecycle] ?? selected.lifecycle}
                  </Chip>
                  {selected.lifecycle === "REGISTERED" && (
                    <Chip>
                      {CONDITION_LABELS[selected.condition] ??
                        selected.condition}
                    </Chip>
                  )}
                </>
              ) : (
                <Chip>New</Chip>
              )}
            </div>
            <h2 className="break-words font-mono text-3xl font-bold tracking-tight">
              {selected ? (selected.publicId ?? "Draft") : "New robot draft"}
            </h2>
            {selected && (
              <p className="text-neutral-600">
                {selected.model
                  ? `${selected.model.brand} ${selected.model.model}`
                  : "Model not set"}
                {selected.serialNumber ? ` · S/N ${selected.serialNumber}` : ""}
              </p>
            )}
            {sections.length > 0 && (
              <nav aria-label="Sections" className="flex flex-wrap gap-2 pt-1">
                {sections.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="rounded-full border px-3 py-1 text-sm hover:border-black"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            )}
          </div>

          <section id="details" className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Details</h2>
              {selected && !editing && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  Edit details
                </button>
              )}
            </div>
            {selected && !editing ? (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {identityFields(selected, models, selected.files)
                  .filter(({ key }) => key !== "currency")
                  .map(({ key, label, show }) => (
                    <div
                      key={key}
                      className={key === "notes" ? "sm:col-span-2" : undefined}
                    >
                      <dt className="text-sm text-neutral-500">{label}</dt>
                      <dd className="whitespace-pre-wrap break-words">
                        {show(selected[key as keyof Robot] as never)}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <>
                <form
                  key={selected ? `${selected.id}:${selected.version}` : "new"}
                  onSubmit={save}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <label>
                    Robot model
                    <select
                      name="modelId"
                      className={field}
                      defaultValue={selected?.modelId || ""}
                    >
                      <option value="">Not supplied</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.brand} {m.model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Manufacturer serial number
                    <input
                      name="serialNumber"
                      className={field}
                      defaultValue={selected?.serialNumber || ""}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Owner
                    <input
                      name="ownerName"
                      className={field}
                      defaultValue={selected?.ownerName || "Hifivebot"}
                      required
                    />
                  </label>
                  <label>
                    Private location
                    <input
                      name="location"
                      className={field}
                      defaultValue={selected?.location || ""}
                    />
                  </label>
                  <label className="sm:col-span-2">
                    Notes
                    <textarea
                      name="notes"
                      className={field}
                      defaultValue={selected?.notes || ""}
                    />
                  </label>
                  <label>
                    Insurance (optional)
                    <input
                      name="insurance"
                      className={field}
                      defaultValue={selected?.insurance || ""}
                    />
                  </label>
                  <label>
                    Tracker (optional)
                    <input
                      name="tracker"
                      className={field}
                      defaultValue={selected?.tracker || ""}
                    />
                  </label>
                  <fieldset className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
                    <legend className="pr-2 text-sm font-semibold uppercase tracking-widest text-neutral-500">
                      Asset details (optional)
                    </legend>
                    <label>
                      Replacement value
                      <div className="flex gap-2">
                        <input
                          name="replacementValue"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className={field}
                          defaultValue={selected?.replacementValue ?? ""}
                        />
                        <input
                          name="currency"
                          aria-label="Currency"
                          className={`${field} w-24 uppercase`}
                          defaultValue={selected?.currency || "USD"}
                          maxLength={3}
                          required
                        />
                      </div>
                    </label>
                    <label>
                      Operating hours
                      <input
                        name="operatingHours"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        className={field}
                        defaultValue={selected?.operatingHours ?? ""}
                      />
                    </label>
                    <label>
                      Firmware version
                      <input
                        name="firmwareVersion"
                        className={field}
                        defaultValue={selected?.firmwareVersion || ""}
                        maxLength={100}
                      />
                    </label>
                    <label>
                      OEM device ID
                      <input
                        name="oemDeviceId"
                        className={field}
                        defaultValue={selected?.oemDeviceId || ""}
                        maxLength={100}
                      />
                    </label>
                  </fieldset>
                  {selected && (
                    <>
                      <label>
                        Private nameplate
                        <select
                          className={field}
                          name="nameplateId"
                          defaultValue={selected.nameplateId || ""}
                        >
                          <option value="">Not selected</option>
                          {selected.files
                            ?.filter((f) => f.kind === "NAMEPLATE")
                            .map((f) => (
                              <option value={f.id} key={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Public presentation photo
                        <select
                          className={field}
                          name="presentationId"
                          defaultValue={selected.presentationId || ""}
                        >
                          <option value="">No public photo</option>
                          {selected.files
                            ?.filter((f) => f.kind === "PRESENTATION")
                            .map((f) => (
                              <option value={f.id} key={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                  {selected && (
                    <label className="sm:col-span-2">
                      Reason for change
                      <input name="reason" className={field} required />
                    </label>
                  )}
                  {selected?.publicId && (
                    <label className="sm:col-span-2">
                      <input name="ownerConfirmed" type="checkbox" /> I confirm
                      the corrected owner (required when changing owner
                      information).
                    </label>
                  )}
                  <button className={button} disabled={busy}>
                    {busy
                      ? "Saving…"
                      : selected?.publicId
                        ? "Save identity changes"
                        : "Save draft"}
                  </button>
                </form>
                {selected && (
                  <button
                    className="text-sm underline"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    Cancel editing
                  </button>
                )}
              </>
            )}
          </section>

          {selected && (
            <IdentityPanel
              key={`identity-panel-${selected.id}:${selected.version}`}
              robot={selected}
              call={call}
              busy={busy}
              run={act}
              reload={async () =>
                setSelected(await call(`robots/${selected.id}`))
              }
            />
          )}
          {selected?.publicId && (
            <RobotLabel
              key={selected.id}
              robot={selected}
              call={call}
              busy={busy}
              run={act}
              environment={environment}
              reload={async () =>
                setSelected(await call(`robots/${selected.id}`))
              }
            />
          )}
          {selected?.publicId && (
            <RecordPanel
              key={`records-${selected.id}`}
              robot={selected}
              call={call}
              busy={busy}
              run={act}
              reload={async () =>
                setSelected(await call(`robots/${selected.id}`))
              }
            />
          )}
          {selected && <HistoryPanel robot={selected} models={models} />}
        </section>
      )}
    </main>
  );
}

function Chip({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
        strong
          ? "border-black bg-black text-white"
          : "border-neutral-300 text-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}
