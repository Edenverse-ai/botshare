"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import IdentityPanel from "./IdentityPanel";
import RobotLabel from "./RobotLabel";
import RecordPanel from "./RecordPanel";
import { Robot, field, button } from "./types";

type Model = { id: string; brand: string; model: string };
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
          if (robot) setSelected(await call(`robots/${robot.id}`));
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
    });
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-neutral-500">
          Hifivebot · Infrastructure
        </p>
        <h1 className="text-3xl font-bold">Robot registry</h1>
        <p>Independent physical robot passports.</p>
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
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <button
            className={button}
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            New draft
          </button>
          <label className="block">
            Search Robot ID or serial
            <input
              className={field}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {robots.map((r) => (
            <button
              disabled={busy}
              className="block w-full rounded border p-3 text-left hover:bg-neutral-100"
              key={r.id}
              onClick={() =>
                act(async () => setSelected(await call(`robots/${r.id}`)))
              }
            >
              {r.publicId || r.serialNumber || "Incomplete draft"}
              <span className="block text-sm text-neutral-500">
                {r.ownerName} · {r.location || "Location not supplied"}
              </span>
            </button>
          ))}
        </aside>
        <section className="space-y-5">
          <h2 className="text-xl font-semibold">
            {selected ? "Internal passport" : "New robot draft"}
          </h2>
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
                <input name="ownerConfirmed" type="checkbox" /> I confirm the
                corrected owner (required when changing owner information).
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
            <IdentityPanel
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
          {selected?.audit && (
            <div>
              <h2 className="text-xl font-semibold">History</h2>
              {selected.audit.map((a) => (
                <details className="my-2 rounded border p-3" key={a.id}>
                  <summary>
                    {a.kind} · {new Date(a.createdAt).toLocaleString()} ·{" "}
                    {a.actorEmail}
                  </summary>
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(a.data, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
