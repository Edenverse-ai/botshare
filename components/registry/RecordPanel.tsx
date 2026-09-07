"use client";
import { useState } from "react";
import { RobotPanelProps, OperationalRecord, button, field } from "./types";

function localTime(value: unknown) {
  if (typeof value !== "string") return "";
  const time = new Date(value);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export default function RecordPanel({
  robot,
  call,
  run,
  busy,
  reload,
}: RobotPanelProps) {
  const [correcting, setCorrecting] = useState<OperationalRecord | null>(null);
  const [kind, setKind] = useState("USAGE");
  const [formVersion, setFormVersion] = useState(0);
  const superseded = new Set(
    robot.records?.map((r) => r.supersedesId).filter(Boolean),
  );
  return (
    <section className="space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Manual operational records</h2>
      <p className="text-sm text-neutral-600">
        Human reports, not device-verified activity. Times are entered in your
        local timezone and retained with their UTC offset.
      </p>
      <label className="block">
        Record type
        <select
          className={field}
          value={kind}
          disabled={!!correcting}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="USAGE">Usage</option>
          <option value="DAMAGE">Damage</option>
          <option value="MAINTENANCE">Maintenance</option>
          {correcting?.kind === "INSPECTION" && (
            <option value="INSPECTION">Inspection</option>
          )}
        </select>
      </label>
      <form
        key={correcting?.id || `new-${kind}-${formVersion}`}
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(async () => {
            const values =
              kind === "USAGE"
                ? {
                    startTime: new Date(
                      String(form.get("startTime")),
                    ).toISOString(),
                    endTime: new Date(
                      String(form.get("endTime")),
                    ).toISOString(),
                    purpose: form.get("purpose"),
                    operator: form.get("operator"),
                    result: form.get("result"),
                  }
                : kind === "DAMAGE"
                  ? {
                      time: new Date(String(form.get("time"))).toISOString(),
                      description: form.get("description"),
                      affectsUse: form.get("affectsUse") === "true",
                    }
                  : kind === "MAINTENANCE"
                    ? {
                        time: new Date(String(form.get("time"))).toISOString(),
                        work: form.get("work"),
                        technician: form.get("technician"),
                        inspectionResult: form.get("inspectionResult"),
                      }
                    : {
                        time: new Date(String(form.get("time"))).toISOString(),
                        inspector: form.get("inspector"),
                        reason: form.get("reason"),
                        passed: form.get("passed") === "true",
                      };
            const body = {
              kind,
              ...values,
              attachmentIds: form.getAll("attachmentIds"),
              ...(correcting
                ? { correctionReason: form.get("correctionReason") }
                : {}),
            };
            await call(
              `robots/${robot.id}/records${correcting ? `/${correcting.id}/correct` : ""}`,
              "POST",
              body,
            );
            setCorrecting(null);
            setFormVersion((v) => v + 1);
            if (kind === "INSPECTION") setKind("USAGE");
            await reload();
          });
        }}
      >
        <h3 className="font-semibold sm:col-span-2">
          {correcting
            ? "Correct record — original retained"
            : "Add manual record"}
        </h3>
        {kind === "USAGE" ? (
          <>
            <label>
              Start time
              <input
                className={field}
                name="startTime"
                type="datetime-local"
                required
                defaultValue={localTime(correcting?.data.startTime)}
              />
            </label>
            <label>
              End time
              <input
                className={field}
                name="endTime"
                type="datetime-local"
                required
                defaultValue={localTime(correcting?.data.endTime)}
              />
            </label>
          </>
        ) : (
          <label>
            Event time
            <input
              className={field}
              name="time"
              type="datetime-local"
              required
              defaultValue={localTime(correcting?.data.time)}
            />
          </label>
        )}
        {(kind === "USAGE"
          ? ["purpose", "operator", "result"]
          : kind === "DAMAGE"
            ? ["description"]
            : kind === "MAINTENANCE"
              ? ["work", "technician"]
              : ["inspector", "reason"]
        ).map((name) => (
          <label key={name} className="capitalize">
            {name === "operator" ? "Actual operator" : name}
            <input
              className={field}
              name={name}
              required
              defaultValue={String(correcting?.data[name] || "")}
            />
          </label>
        ))}
        {kind === "DAMAGE" && (
          <label>
            Affects use
            <select
              name="affectsUse"
              className={field}
              defaultValue={String(correcting?.data.affectsUse ?? true)}
            >
              <option value="true">Yes — requires maintenance</option>
              <option value="false">No</option>
            </select>
          </label>
        )}
        {kind === "MAINTENANCE" && (
          <>
            <label>
              Inspection result
              <select
                name="inspectionResult"
                className={field}
                defaultValue={String(
                  correcting?.data.inspectionResult || "PENDING",
                )}
              >
                <option value="PENDING">Pending</option>
                <option value="FAILED">Not passed</option>
                <option value="PASSED">Passed during repair</option>
              </select>
            </label>
            <p className="text-sm">
              After saving maintenance, record a separate inspection above to
              restore readiness.
            </p>
          </>
        )}
        {kind === "INSPECTION" && (
          <label>
            Inspection passed
            <select
              name="passed"
              className={field}
              defaultValue={String(correcting?.data.passed ?? false)}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
        )}
        <fieldset>
          <legend>Optional private attachments</legend>
          {robot.files
            ?.filter((f) => f.kind === "ATTACHMENT")
            .map((f) => (
              <label className="block text-sm" key={f.id}>
                <input
                  type="checkbox"
                  name="attachmentIds"
                  value={f.id}
                  defaultChecked={
                    !!correcting &&
                    Array.isArray(correcting.data.attachmentIds) &&
                    correcting.data.attachmentIds.includes(f.id)
                  }
                />{" "}
                {f.name}
              </label>
            ))}
        </fieldset>
        {correcting && (
          <label>
            Correction reason
            <input className={field} name="correctionReason" required />
          </label>
        )}
        {correcting && (
          <p className="text-sm">
            Corrections never restore readiness. An updated fault can require
            maintenance; use a new inspection to restore readiness.
          </p>
        )}
        <div className="flex gap-3">
          <button className={button} disabled={busy}>
            Save record
          </button>
          {correcting && (
            <button
              type="button"
              onClick={() => {
                setCorrecting(null);
                setKind("USAGE");
              }}
            >
              Cancel correction
            </button>
          )}
        </div>
      </form>
      <div className="space-y-3">
        <h3 className="font-semibold">Timeline & retained revisions</h3>
        {robot.records?.map((record) => (
          <article className="rounded border p-3" key={record.id}>
            <p className="font-semibold">
              {record.kind} · {new Date(record.eventAt).toLocaleString()}{" "}
              {superseded.has(record.id) && "· Earlier revision"}
            </p>
            <p className="text-sm">
              Recorded by {record.actorEmail} at{" "}
              {new Date(record.createdAt).toLocaleString()}
            </p>
            <dl className="my-2 text-sm">
              {Object.entries(record.data)
                .filter(([key]) => !["kind", "attachmentIds"].includes(key))
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="inline font-semibold">{key}: </dt>
                    <dd className="inline whitespace-pre-wrap">
                      {String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
            {Array.isArray(record.data.attachmentIds) &&
              record.data.attachmentIds.map((id) => (
                <a
                  className="mr-3 text-sm underline"
                  key={id}
                  href={`/api/registry/files/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {robot.files?.find((f) => f.id === id)?.name ||
                    "Private attachment"}
                </a>
              ))}
            {record.correctionReason && (
              <p>Correction reason: {record.correctionReason}</p>
            )}
            {!superseded.has(record.id) && (
              <button
                className="block text-sm underline"
                disabled={busy}
                onClick={() => {
                  setCorrecting(record);
                  setKind(record.kind);
                }}
              >
                Correct record
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
