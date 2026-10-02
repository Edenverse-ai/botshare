"use client";
import { FormEvent } from "react";
import { RobotPanelProps, field, button } from "./types";
import { prepareUpload } from "./prepareUpload";
import { FILE_KIND_LABELS } from "./labels";

export default function IdentityPanel({
  robot,
  call,
  busy,
  run,
  reload,
}: RobotPanelProps) {
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return;
    await run(async () => {
      const prepared = await prepareUpload(file);
      await call(`robots/${robot.id}/files`, "POST", {
        ...prepared,
        kind: form.get("kind"),
      });
      await reload();
    });
  }
  return (
    <section id="evidence" className="space-y-4 rounded-xl border p-4">
      <h2 className="text-xl font-semibold">Photos, registration & inspection</h2>
      <form onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
        <label>
          Image purpose
          <select className={field} name="kind">
            <option value="NAMEPLATE">Private nameplate</option>
            <option value="PRESENTATION">Public presentation photo</option>
            <option value="ATTACHMENT">Private operational attachment</option>
          </select>
        </label>
        <label>
          Photo or PDF (phone photos are resized automatically)
          <input
            className={field}
            name="file"
            type="file"
            accept="image/*,application/pdf"
            required
          />
        </label>
        <button className={button} disabled={busy}>
          Upload evidence
        </button>
      </form>
      <ul className="space-y-1">
        {robot.files?.map((f) => (
          <li key={f.id}>
            <a
              className="underline"
              href={`/api/registry/files/${f.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {f.name}
            </a>{" "}
            · {FILE_KIND_LABELS[f.kind] ?? f.kind}
          </li>
        ))}
      </ul>
      {!robot.publicId && (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(async () => {
              await call(`robots/${robot.id}/register`, "POST", {
                nameplateId: form.get("nameplateId"),
                ownerConfirmed: form.get("ownerConfirmed") === "on",
                version: robot.version,
              });
              await reload();
            });
          }}
        >
          <p>
            Formal registration requires a model, manufacturer serial number,
            private nameplate image and owner confirmation. Save the identity
            fields above before registering.
          </p>
          <label className="block">
            Private nameplate image
            <select className={field} name="nameplateId" required>
              <option value="">Choose evidence</option>
              {robot.files
                ?.filter((f) => f.kind === "NAMEPLATE")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <input type="checkbox" name="ownerConfirmed" required /> I confirm
            the recorded owner is {robot.ownerName}. This is an internal
            confirmation.
          </label>
          <button className={button} disabled={busy}>
            Register permanent Robot ID
          </button>
        </form>
      )}
      {robot.lifecycle === "REGISTERED" && (
        <form
          className="grid gap-3 border-t pt-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            run(async () => {
              await call(`robots/${robot.id}/inspection`, "POST", {
                inspector: form.get("inspector"),
                passed: form.get("passed") === "true",
                time: new Date(String(form.get("time"))).toISOString(),
                reason: form.get("reason"),
              });
              await reload();
            });
          }}
        >
          <h3 className="font-semibold sm:col-span-2">Record inspection</h3>
          <label>
            Inspector
            <input className={field} name="inspector" required />
          </label>
          <label>
            Inspection time (your local timezone)
            <input
              className={field}
              name="time"
              type="datetime-local"
              required
            />
          </label>
          <label>
            Result
            <select name="passed" className={field}>
              <option value="false">Not passed — requires maintenance</option>
              <option value="true">Passed — usable</option>
            </select>
          </label>
          <label>
            Inspection notes
            <input className={field} name="reason" required />
          </label>
          <button className={button} disabled={busy}>
            Save inspection
          </button>
        </form>
      )}
      {robot.lifecycle === "REGISTERED" && (
        <details className="border-t pt-4">
          <summary className="cursor-pointer font-semibold">
            Retire this robot
          </summary>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              run(async () => {
                await call(`robots/${robot.id}/retire`, "POST", {
                  reason: form.get("reason"),
                });
                await reload();
              });
            }}
          >
            <p>
              Retirement is permanent in this registry. The ID, QR passport and
              history remain available.
            </p>
            <label className="block">
              Retirement reason
              <input className={field} name="reason" required />
            </label>
            <label className="block">
              <input type="checkbox" required /> Confirm retirement of{" "}
              {robot.publicId}
            </label>
            <button className={button} disabled={busy}>
              Retire robot and retain history
            </button>
          </form>
        </details>
      )}
      {robot.lifecycle === "RETIRED" && (
        <p className="rounded bg-neutral-100 p-3">
          Retired — not in active use. Historical reports and corrections remain
          available; an inspection cannot reactivate this identity.
        </p>
      )}
    </section>
  );
}
