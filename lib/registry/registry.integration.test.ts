import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createRegistryHandler } from "./http";

const enabled = process.env.REGISTRY_ENVIRONMENT === "test";
if (enabled) {
  const target = new URL(
    process.env.REGISTRY_DATABASE_URL || "http://disabled",
  );
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "55439" ||
    !/^\/registry_test_[a-f0-9]+$/.test(target.pathname)
  )
    throw new Error(
      "Integration tests require a disposable local registry_test database.",
    );
}
const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.REGISTRY_DATABASE_URL ||
        "postgresql://disabled:disabled@127.0.0.1:1/disabled",
    },
  },
});
const actor = { id: "test-admin", email: "admin@registry.test" };
const api = createRegistryHandler({ db, actor: async () => actor });
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  key = randomUUID(),
  handler = api,
) {
  return handler(
    new Request(`http://localhost/api/registry/${path}`, {
      method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
afterAll(() => db.$disconnect());
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC";
async function registeredRobot() {
  const model = await db.robotModel.create({
    data: {
      slug: randomUUID(),
      brand: "AGIBOT",
      model: "X2",
      productName: "Test X2",
      description: "Test fixture",
      useCase: [],
      serviceCategory: "Entertainment",
      capabilityTag: "humanoid",
    },
  });
  const draft = await (
    await request("robots", "POST", {
      modelId: model.id,
      serialNumber: `TEST-${randomUUID()}`,
      location: "PRIVATE-LOCATION",
    })
  ).json();
  const nameplate = await (
    await request(`robots/${draft.id}/files`, "POST", {
      kind: "NAMEPLATE",
      name: "nameplate.png",
      mime: "image/png",
      base64: png,
    })
  ).json();
  return (
    await request(`robots/${draft.id}/register`, "POST", {
      ownerConfirmed: true,
      nameplateId: nameplate.id,
      version: draft.version,
    })
  ).json();
}

describe.skipIf(!enabled)(
  "Robot Registry request boundary (isolated Postgres)",
  () => {
    it("saves, reopens and edits an incomplete independent draft without duplicating retries", async () => {
      const key = randomUUID();
      const first = await request(
        "robots",
        "POST",
        { location: "Test workshop" },
        key,
      );
      expect(first.status).toBe(200);
      const robot = await first.json();
      const retry = await request(
        "robots",
        "POST",
        { location: "Test workshop" },
        key,
      );
      expect(await retry.json()).toEqual(robot);
      const update = await request(`robots/${robot.id}`, "PATCH", {
        version: robot.version,
        location: "Test storage",
        reason: "Moved",
      });
      expect(update.status).toBe(200);
      const read = await (await request(`robots/${robot.id}`)).json();
      expect(read.location).toBe("Test storage");
      expect(read.ownerName).toBe("Hifivebot");
      expect(read.audit.map((event: { kind: string }) => event.kind)).toEqual([
        "CREATED",
        "UPDATED",
      ]);
      expect(
        (await request("robots", "POST", { location: "Different" }, key))
          .status,
      ).toBe(409);
    });

    it("denies private access to anonymous users, customers and providers, and observes the write guard", async () => {
      for (const identity of [
        null,
        { id: "customer", email: "customer@registry.test" },
        { id: "provider", email: "provider@registry.test" },
      ]) {
        const handler = createRegistryHandler({
          db,
          actor: async () => identity,
        });
        expect(
          (await request("robots", "GET", undefined, randomUUID(), handler))
            .status,
        ).toBe(identity ? 403 : 401);
        expect(
          (await request("robots", "POST", {}, randomUUID(), handler)).status,
        ).toBe(identity ? 403 : 401);
      }
      process.env.DB_MIGRATION_READ_ONLY = "true";
      try {
        expect((await request("robots", "POST", {})).status).toBe(503);
      } finally {
        process.env.DB_MIGRATION_READ_ONLY = "false";
      }
    });

    it("registers a verified robot exactly once and retains evidence privately", async () => {
      const model = await db.robotModel.create({
        data: {
          slug: randomUUID(),
          brand: "AGIBOT",
          model: "X2",
          productName: "Test X2",
          description: "Test fixture",
          useCase: [],
          serviceCategory: "Entertainment",
          capabilityTag: "humanoid",
        },
      });
      const robot = await (
        await request("robots", "POST", {
          modelId: model.id,
          serialNumber: `TEST-${randomUUID()}`,
        })
      ).json();
      expect(
        (
          await request(`robots/${robot.id}/register`, "POST", {
            ownerConfirmed: true,
          })
        ).status,
      ).toBe(400);
      const image = await (
        await request(`robots/${robot.id}/files`, "POST", {
          kind: "NAMEPLATE",
          name: "test.png",
          mime: "image/png",
          base64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
        })
      ).json();
      const key = randomUUID();
      const body = {
        ownerConfirmed: true,
        nameplateId: image.id,
        version: robot.version,
      };
      const results = await Promise.all([
        request(`robots/${robot.id}/register`, "POST", body, key),
        request(`robots/${robot.id}/register`, "POST", body, key),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const registered = await results[0].json();
      expect(await results[1].json()).toEqual(registered);
      expect(registered.publicId).toMatch(/^HFB-RB-\d{6}$/);
      expect(registered.condition).toBe("AWAITING_INSPECTION");
      expect(
        (
          await request(`robots/${robot.id}`, "PATCH", {
            version: registered.version,
            publicId: "HFB-RB-123456",
            reason: "Attempted renumber",
          })
        ).status,
      ).toBe(400);
      const privateFile = createRegistryHandler({
        db,
        actor: async () => null,
      });
      expect(
        (
          await request(
            `files/${image.id}`,
            "GET",
            undefined,
            randomUUID(),
            privateFile,
          )
        ).status,
      ).toBe(401);
      expect(
        (await request(`files/${image.id}`)).headers.get("content-type"),
      ).toBe("image/png");
      const detail = await (await request(`robots/${robot.id}`)).json();
      expect(
        detail.audit.filter((e: { kind: string }) => e.kind === "REGISTERED"),
      ).toHaveLength(1);
    });

    it("publishes only the passport allowlist, protects drafts and prints a stable QR destination", async () => {
      const robot = await registeredRobot();
      const publicApi = createRegistryHandler({ db, actor: async () => null });
      const passport = await request(
        `passports/${robot.publicId}`,
        "GET",
        undefined,
        randomUUID(),
        publicApi,
      );
      expect(passport.status).toBe(200);
      expect(await passport.json()).toEqual({
        publicId: robot.publicId,
        brand: "AGIBOT",
        model: "X2",
        presentationPhoto: null,
      });
      const draft = await (await request("robots", "POST", {})).json();
      expect(
        (
          await request(
            `passports/${draft.id}`,
            "GET",
            undefined,
            randomUUID(),
            publicApi,
          )
        ).status,
      ).toBe(404);
      const photo = await (
        await request(`robots/${robot.id}/files`, "POST", {
          kind: "PRESENTATION",
          name: "public.png",
          mime: "image/png",
          base64: png,
        })
      ).json();
      expect(
        (
          await request(`robots/${robot.id}`, "PATCH", {
            version: robot.version,
            presentationId: photo.id,
            reason: "Choose presentation photo",
          })
        ).status,
      ).toBe(200);
      const photoResponse = await request(
        `passports/${robot.publicId}/photo`,
        "GET",
        undefined,
        randomUUID(),
        publicApi,
      );
      expect(photoResponse.status).toBe(200);
      expect(photoResponse.headers.get("content-type")).toBe("image/png");
      process.env.REGISTRY_PUBLIC_ORIGIN = "https://registry.example.test";
      const label = await (await request(`robots/${robot.id}/label`)).json();
      expect(label.url).toBe(
        `https://registry.example.test/robot-passports/${robot.publicId}`,
      );
      expect(label.qr).toMatch(/^data:image\/png;base64,/);
      expect((await request(`robots/${draft.id}/label`)).status).toBe(404);
    });

    it("records retrospective usage and preserves both versions of a correction without changing condition", async () => {
      const robot = await registeredRobot();
      const body = {
        kind: "USAGE",
        startTime: "2026-09-01T09:00:00+08:00",
        endTime: "2026-09-01T10:00:00+08:00",
        purpose: "Test rehearsal",
        operator: "Actual operator",
        result: "Completed",
        attachmentIds: [],
      };
      expect(
        (
          await request(`robots/${robot.id}/records`, "POST", {
            ...body,
            endTime: "2026-09-01T08:00:00+08:00",
          })
        ).status,
      ).toBe(400);
      const key = randomUUID();
      const response = await request(
        `robots/${robot.id}/records`,
        "POST",
        body,
        key,
      );
      expect(response.status).toBe(200);
      const record = await response.json();
      expect(
        await (
          await request(`robots/${robot.id}/records`, "POST", body, key)
        ).json(),
      ).toEqual(record);
      const corrected = await request(
        `robots/${robot.id}/records/${record.id}/correct`,
        "POST",
        {
          ...body,
          result: "Completed with note",
          correctionReason: "Add omitted outcome",
        },
      );
      expect(corrected.status).toBe(200);
      const detail = await (await request(`robots/${robot.id}`)).json();
      expect(detail.condition).toBe("AWAITING_INSPECTION");
      expect(detail.records).toHaveLength(2);
      expect(detail.records[0].data.result).toBe("Completed");
      expect(detail.records[1].data.result).toBe("Completed with note");
      expect(detail.records[0].actorEmail).toBe("admin@registry.test");
      expect(detail.records[0].data.operator).toBe("Actual operator");
      expect(detail.records[1].supersedesId).toBe(record.id);
      expect(detail.records[1].correctionReason).toBe("Add omitted outcome");
      expect(
        (
          await request(
            `robots/${robot.id}/records/${record.id}/correct`,
            "POST",
            { ...body, correctionReason: "Stale correction" },
          )
        ).status,
      ).toBe(409);
      const other = await registeredRobot();
      expect(
        (
          await request(
            `robots/${other.id}/records/${record.id}/correct`,
            "POST",
            { ...body, correctionReason: "Wrong machine" },
          )
        ).status,
      ).toBe(404);
    });

    it("keeps a damaged robot unusable until a fresh inspection passes, independently of other machines", async () => {
      const robot = await registeredRobot();
      const other = await registeredRobot();
      const inspect = (passed: boolean, time = "2026-09-02T12:00:00Z") =>
        request(`robots/${robot.id}/inspection`, "POST", {
          passed,
          time,
          inspector: "Test inspector",
          reason: "Inspection notes",
        });
      expect((await inspect(true, "2026-09-01T12:00:00Z")).status).toBe(200);
      const damage = {
        kind: "DAMAGE",
        time: "2026-09-02T09:00:00Z",
        description: "Test joint fault",
        affectsUse: true,
        attachmentIds: [],
      };
      const response = await request(
        `robots/${robot.id}/records`,
        "POST",
        damage,
      );
      expect(response.status).toBe(200);
      const fault = await response.json();
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("MAINTENANCE");
      expect((await inspect(true, "2026-09-01T12:00:00Z")).status).toBe(409);
      const maintenance = {
        kind: "MAINTENANCE",
        time: "2026-09-02T10:00:00Z",
        work: "Test repair",
        technician: "Actual technician",
        inspectionResult: "PENDING",
        attachmentIds: [],
      };
      expect(
        (await request(`robots/${robot.id}/records`, "POST", maintenance))
          .status,
      ).toBe(200);
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("MAINTENANCE");
      await inspect(false);
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("MAINTENANCE");
      await inspect(true);
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("USABLE");
      const inspected = await (await request(`robots/${robot.id}`)).json();
      const passed = inspected.records.find(
        (record: { kind: string; data: { passed?: boolean; time: string } }) =>
          record.kind === "INSPECTION" &&
          record.data.passed &&
          new Date(record.data.time).toISOString() ===
            "2026-09-02T12:00:00.000Z",
      );
      const correction = await request(
        `robots/${robot.id}/records/${passed.id}/correct`,
        "POST",
        {
          ...passed.data,
          time: "2026-09-02T08:00:00Z",
          correctionReason: "Inspection actually preceded the fault",
        },
      );
      expect(correction.status).toBe(200);
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("MAINTENANCE");
      expect(
        (
          await request(
            `robots/${robot.id}/records/${fault.id}/correct`,
            "POST",
            {
              ...damage,
              affectsUse: false,
              correctionReason: "Correct historical classification",
            },
          )
        ).status,
      ).toBe(200);
      expect(
        (await (await request(`robots/${other.id}`)).json()).condition,
      ).toBe("AWAITING_INSPECTION");
      expect(
        (await (await request(`robots/${other.id}`)).json()).records,
      ).toHaveLength(0);
    });

    it("retires without losing its passport, history or attribution and never reuses the ID", async () => {
      const robot = await registeredRobot();
      await request(`robots/${robot.id}/records`, "POST", {
        kind: "USAGE",
        startTime: "2026-09-01T01:00:00Z",
        endTime: "2026-09-01T02:00:00Z",
        purpose: "Test",
        operator: "Test operator",
        result: "Complete",
      });
      const key = randomUUID();
      const retiredResponse = await request(
        `robots/${robot.id}/retire`,
        "POST",
        { reason: "Test retirement" },
        key,
      );
      expect(retiredResponse.status).toBe(200);
      const retired = await retiredResponse.json();
      expect(retired.lifecycle).toBe("RETIRED");
      expect(
        await (
          await request(
            `robots/${robot.id}/retire`,
            "POST",
            { reason: "Test retirement" },
            key,
          )
        ).json(),
      ).toEqual(retired);
      expect(
        (
          await request(`robots/${robot.id}/inspection`, "POST", {
            passed: true,
            time: "2026-09-03T12:00:00Z",
            inspector: "Test",
            reason: "Cannot reactivate",
          })
        ).status,
      ).toBe(409);
      await request(`robots/${robot.id}/records`, "POST", {
        kind: "MAINTENANCE",
        time: "2026-09-02T10:00:00Z",
        work: "Retrospective note",
        technician: "Test",
        inspectionResult: "PASSED",
      });
      const publicApi = createRegistryHandler({ db, actor: async () => null });
      expect(
        (
          await request(
            `passports/${robot.publicId}`,
            "GET",
            undefined,
            randomUUID(),
            publicApi,
          )
        ).status,
      ).toBe(200);
      expect((await request(`robots/${robot.id}`, "DELETE")).status).toBe(405);
      await db.user.create({ data: { id: actor.id, email: actor.email } });
      await db.user.delete({ where: { id: actor.id } });
      await expect(
        db.robotModel.delete({ where: { id: robot.modelId } }),
      ).rejects.toThrow();
      const retained = await (await request(`robots/${robot.id}`)).json();
      expect(retained.lifecycle).toBe("RETIRED");
      expect(retained.publicId).toBe(robot.publicId);
      expect(retained.records[0].actorEmail).toBe(actor.email);
      expect(
        retained.audit.filter((e: { kind: string }) => e.kind === "RETIRED"),
      ).toHaveLength(1);
      const next = await registeredRobot();
      expect(next.publicId).not.toBe(robot.publicId);
    });

    it("prevents serial duplicates under racing independent requests and rejects cross-robot evidence", async () => {
      const serial = `TEST-CONCURRENT-${randomUUID()}`;
      const results = await Promise.all([
        request("robots", "POST", { serialNumber: serial }),
        request("robots", "POST", {
          serialNumber: ` ${serial.toLowerCase()} `,
        }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const robots = await Promise.all([
        registeredRobot(),
        registeredRobot(),
        registeredRobot(),
      ]);
      expect(new Set(robots.map((r) => r.publicId)).size).toBe(3);
      expect(
        (
          await request(`robots/${robots[0].id}`, "PATCH", {
            version: robots[0].version,
            nameplateId: robots[1].nameplateId,
            reason: "Wrong evidence",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(`robots/${robots[0].id}`, "PATCH", {
            version: robots[0].version,
            presentationId: robots[0].nameplateId,
            reason: "Must stay private",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(`robots/${robots[0].id}/files`, "POST", {
            kind: "NAMEPLATE",
            name: "fake.png",
            mime: "image/png",
            base64: Buffer.from("<script>alert(1)</script>").toString("base64"),
          })
        ).status,
      ).toBe(400);
    });

    it("requires renewed owner confirmation when registered ownership information changes", async () => {
      const robot = await registeredRobot();
      const change = {
        version: robot.version,
        ownerName: "Corrected test owner",
        reason: "Correct owner information",
      };
      expect(
        (await request(`robots/${robot.id}`, "PATCH", change)).status,
      ).toBe(400);
      const response = await request(`robots/${robot.id}`, "PATCH", {
        ...change,
        ownerConfirmed: true,
      });
      expect(response.status).toBe(200);
      const detail = await (await request(`robots/${robot.id}`)).json();
      expect(detail.ownerConfirmedBy).toBe(actor.email);
      expect(detail.publicId).toBe(robot.publicId);
      expect(
        detail.audit.find((a: { kind: string }) => a.kind === "REGISTERED").data
          .ownerName,
      ).toBe("Hifivebot");
    });
    it("rejects future inspection results instead of treating a planned check as completed", async () => {
      const robot = await registeredRobot();
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(
        (
          await request(`robots/${robot.id}/inspection`, "POST", {
            time: future,
            inspector: "Test inspector",
            passed: true,
            reason: "Future inspection",
          })
        ).status,
      ).toBe(400);
      expect(
        (await (await request(`robots/${robot.id}`)).json()).condition,
      ).toBe("AWAITING_INSPECTION");
    });
    it("rejects a nameplate containing only an image signature, without image pixels", async () => {
      const robot = await (await request("robots", "POST", {})).json();
      expect(
        (
          await request(`robots/${robot.id}/files`, "POST", {
            kind: "NAMEPLATE",
            name: "truncated.png",
            mime: "image/png",
            base64: Buffer.from("89504e470d0a1a0a", "hex").toString("base64"),
          })
        ).status,
      ).toBe(400);
    });
    it("rejects registration from a stale draft after another administrator changes the owner", async () => {
      const model = await db.robotModel.create({
        data: {
          slug: randomUUID(),
          brand: "AGIBOT",
          model: "X2",
          productName: "Test X2",
          description: "Test fixture",
          useCase: [],
          serviceCategory: "Entertainment",
          capabilityTag: "humanoid",
        },
      });
      const draft = await (
        await request("robots", "POST", {
          modelId: model.id,
          serialNumber: `TEST-STALE-${randomUUID()}`,
        })
      ).json();
      const image = await (
        await request(`robots/${draft.id}/files`, "POST", {
          kind: "NAMEPLATE",
          name: "test.png",
          mime: "image/png",
          base64: png,
        })
      ).json();
      const updated = await (
        await request(`robots/${draft.id}`, "PATCH", {
          version: draft.version,
          ownerName: "Another owner",
          reason: "Correct draft owner",
        })
      ).json();
      const registration = {
        ownerConfirmed: true,
        nameplateId: image.id,
        version: draft.version,
      };
      expect(
        (await request(`robots/${draft.id}/register`, "POST", registration))
          .status,
      ).toBe(409);
      expect(
        (await (await request(`robots/${draft.id}`)).json()).publicId,
      ).toBeNull();
      expect(
        (
          await request(`robots/${draft.id}/register`, "POST", {
            ...registration,
            version: updated.version,
          })
        ).status,
      ).toBe(200);
    });
  },
);
