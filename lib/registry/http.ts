import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isAdminEmail } from "../adminAuth";
import { validateFile, fileMetadata, fileResponse } from "./files";
import { readPublicPassport } from "./passport";
import QRCode from "qrcode";
import { RecordError, saveRecord, inspectionInput } from "./records";

type Actor = { id: string; email: string | null };
type Dependencies = { db: PrismaClient; actor: () => Promise<Actor | null> };
export class RegistryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const text = z.string().trim().max(2000);
const draftFields = z
  .object({
    modelId: z.string().min(1).nullable().optional(),
    serialNumber: z.string().trim().max(100).nullable().optional(),
    ownerName: text.min(1).optional(),
    location: text.optional(),
    notes: text.optional(),
    insurance: text.optional(),
    tracker: text.optional(),
    nameplateId: z.string().min(1).nullable().optional(),
    presentationId: z.string().min(1).nullable().optional(),
  })
  .strict();
const updateFields = draftFields.extend({
  version: z.number().int().positive(),
  reason: text.min(1),
  ownerConfirmed: z.boolean().optional(),
});
const serialKey = (value: string | null | undefined) =>
  value?.trim().normalize("NFKC").toUpperCase() || null;
const jsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function createRegistryHandler({ db, actor: getActor }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const parts = url.pathname
        .replace(/^\/api\/registry\/?/, "")
        .split("/")
        .filter(Boolean);
      if (request.method === "GET" && parts[0] === "passports") {
        const passport = await readPublicPassport(db, parts[1] || "");
        if (!passport) throw new RegistryError(404, "Passport not found.");
        if (parts.length === 2) return json(passport);
        if (parts.length === 3 && parts[2] === "photo") {
          const robot = await db.robotAsset.findUnique({
            where: { publicId: parts[1] },
            select: { id: true, presentationId: true },
          });
          const file = robot?.presentationId
            ? await db.robotFile.findFirst({
                where: {
                  id: robot.presentationId,
                  robotId: robot.id,
                  kind: "PRESENTATION",
                },
              })
            : null;
          if (!file) throw new RegistryError(404, "Photo not found.");
          return fileResponse(file);
        }
        throw new RegistryError(404, "Not found.");
      }
      const actor = await getActor();
      if (!actor)
        throw new RegistryError(401, "Sign in to access the robot registry.");
      if (!isAdminEmail(actor.email))
        throw new RegistryError(403, "Administrator access required.");
      if (request.method === "GET") {
        if (
          parts[0] === "robots" &&
          parts.length === 3 &&
          parts[2] === "label"
        ) {
          const robot = await db.robotAsset.findUnique({
            where: { id: parts[1] },
            select: { publicId: true },
          });
          if (!robot?.publicId)
            throw new RegistryError(
              404,
              "Register the robot before printing a label.",
            );
          const origin = process.env.REGISTRY_PUBLIC_ORIGIN;
          if (!origin)
            throw new RegistryError(
              503,
              "Configure the public passport origin before printing labels.",
            );
          const base = new URL(origin);
          if (
            base.protocol !== "https:" &&
            !(
              process.env.REGISTRY_ENVIRONMENT !== "production" &&
              base.protocol === "http:"
            )
          )
            throw new RegistryError(
              503,
              "A secure public passport origin is required.",
            );
          const destination = `${base.origin}/robot-passports/${robot.publicId}`;
          return json({
            publicId: robot.publicId,
            url: destination,
            qr: await QRCode.toDataURL(destination, {
              width: 360,
              margin: 4,
              errorCorrectionLevel: "M",
            }),
          });
        }
        if (parts[0] === "files" && parts.length === 2) {
          const file = await db.robotFile.findUnique({
            where: { id: parts[1] },
          });
          if (!file) throw new RegistryError(404, "File not found.");
          return fileResponse(file);
        }
        if (parts[0] === "models" && parts.length === 1) {
          return json(
            await db.robotModel.findMany({
              select: { id: true, brand: true, model: true },
              orderBy: [{ brand: "asc" }, { model: "asc" }],
            }),
          );
        }
        if (parts[0] === "robots" && parts.length === 1) {
          const search = (url.searchParams.get("search") || "").slice(0, 100);
          return json(
            await db.robotAsset.findMany({
              where: search
                ? {
                    OR: [
                      {
                        serialNumber: { contains: search, mode: "insensitive" },
                      },
                      { publicId: { contains: search, mode: "insensitive" } },
                    ],
                  }
                : {},
              include: { model: { select: { brand: true, model: true } } },
              orderBy: { createdAt: "desc" },
              take: 200,
            }),
          );
        }
        if (parts[0] === "robots" && parts.length === 2) {
          const robot = await db.robotAsset.findUnique({
            where: { id: parts[1] },
            include: {
              model: { select: { brand: true, model: true } },
              files: { select: fileMetadata },
              records: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
              audit: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
            },
          });
          if (!robot) throw new RegistryError(404, "Robot not found.");
          return json(robot);
        }
        throw new RegistryError(404, "Not found.");
      }
      if (process.env.DB_MIGRATION_READ_ONLY === "true")
        throw new RegistryError(
          503,
          "Writes are temporarily disabled for database migration.",
        );
      if (!["POST", "PATCH"].includes(request.method))
        throw new RegistryError(405, "Operation not supported.");
      const requestId = z
        .string()
        .min(8)
        .max(100)
        .parse(request.headers.get("Idempotency-Key"));
      const raw = await request.text();
      if (raw.length > (parts[2] === "files" ? 7_100_000 : 16000))
        throw new RegistryError(413, "Request too large.");
      const body: unknown = JSON.parse(raw);
      const key = createHash("sha256")
        .update(`${actor.id}:${requestId}`)
        .digest("hex");
      const hash = createHash("sha256")
        .update(`${request.method}:${url.pathname}:${JSON.stringify(body)}`)
        .digest("hex");
      const result = await db.$transaction(
        async (tx) => {
          // The three-machine pilot serializes mutations, including retries and ID
          // allocation. The lock is transaction-scoped across application instances.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(726431)`;
          const prior = await tx.robotRequest.findUnique({ where: { key } });
          if (prior) {
            if (prior.hash !== hash)
              throw new RegistryError(
                409,
                "This request key was already used with different data.",
              );
            return prior.response;
          }
          let result: unknown;
          if (
            parts[0] === "robots" &&
            parts.length === 1 &&
            request.method === "POST"
          ) {
            const data = draftFields.parse(body);
            if (data.nameplateId || data.presentationId)
              throw new RegistryError(
                400,
                "Save the draft before attaching images.",
              );
            const robot = await tx.robotAsset.create({
              data: { ...data, serialKey: serialKey(data.serialNumber) },
            });
            await tx.robotAudit.create({
              data: {
                robotId: robot.id,
                kind: "CREATED",
                data: jsonValue(robot),
                actorId: actor.id,
                actorEmail: actor.email!,
              },
            });
            result = robot;
          } else if (
            parts[0] === "robots" &&
            parts.length === 2 &&
            request.method === "PATCH"
          ) {
            const { version, reason, ownerConfirmed, ...data } =
              updateFields.parse(body);
            const before = await tx.robotAsset.findUnique({
              where: { id: parts[1] },
            });
            if (!before) throw new RegistryError(404, "Robot not found.");
            if (before.version !== version)
              throw new RegistryError(
                409,
                "The robot changed. Reload before editing.",
              );
            const ownerChanged =
              !!before.publicId &&
              data.ownerName !== undefined &&
              data.ownerName !== before.ownerName;
            if (ownerChanged && !ownerConfirmed)
              throw new RegistryError(
                400,
                "Confirm the corrected owner before saving.",
              );
            for (const [fileId, kind] of [
              [data.nameplateId, "NAMEPLATE"],
              [data.presentationId, "PRESENTATION"],
            ]) {
              if (
                fileId &&
                !(await tx.robotFile.findFirst({
                  where: { id: fileId, robotId: before.id, kind: kind! },
                }))
              )
                throw new RegistryError(
                  400,
                  "Select an image uploaded to this robot with the correct purpose.",
                );
            }
            if (
              before.publicId &&
              (data.modelId === null ||
                (data.serialNumber !== undefined &&
                  !serialKey(data.serialNumber)) ||
                data.nameplateId === null)
            )
              throw new RegistryError(
                400,
                "Registered robots must retain their identity evidence.",
              );
            const model = data.modelId
              ? await tx.robotModel.findUnique({ where: { id: data.modelId } })
              : null;
            const after = await tx.robotAsset.update({
              where: { id: before.id },
              data: {
                ...data,
                ...(data.serialNumber !== undefined
                  ? { serialKey: serialKey(data.serialNumber) }
                  : {}),
                ...(ownerChanged
                  ? {
                      ownerConfirmedBy: actor.email!,
                      ownerConfirmedAt: new Date(),
                    }
                  : {}),
                version: { increment: 1 },
              },
            });
            if (model && before.publicId) {
              Object.assign(
                after,
                await tx.robotAsset.update({
                  where: { id: before.id },
                  data: {
                    registeredBrand: model.brand,
                    registeredModel: model.model,
                  },
                }),
              );
            }
            await tx.robotAudit.create({
              data: {
                robotId: before.id,
                kind: "UPDATED",
                data: jsonValue({ before, after, reason }),
                actorId: actor.id,
                actorEmail: actor.email!,
              },
            });
            result = after;
          } else if (
            parts[0] === "robots" &&
            parts[2] === "records" &&
            (parts.length === 3 ||
              (parts.length === 5 && parts[4] === "correct")) &&
            request.method === "POST"
          ) {
            const robot = await tx.robotAsset.findUnique({
              where: { id: parts[1] },
            });
            if (!robot) throw new RegistryError(404, "Robot not found.");
            result = await saveRecord(
              tx,
              robot,
              body,
              { id: actor.id, email: actor.email! },
              parts[3],
            );
          } else if (
            parts[0] === "robots" &&
            parts.length === 3 &&
            request.method === "POST"
          ) {
            const robot = await tx.robotAsset.findUnique({
              where: { id: parts[1] },
              include: { model: true },
            });
            if (!robot) throw new RegistryError(404, "Robot not found.");
            if (parts[2] === "files") {
              const file = await validateFile(body);
              result = await tx.robotFile.create({
                data: { ...file, robotId: robot.id },
                select: fileMetadata,
              });
              await tx.robotAudit.create({
                data: {
                  robotId: robot.id,
                  kind: "FILE_ADDED",
                  data: jsonValue(result),
                  actorId: actor.id,
                  actorEmail: actor.email!,
                },
              });
            } else if (parts[2] === "register") {
              const data = z
                .object({
                  ownerConfirmed: z.literal(true),
                  nameplateId: z.string().min(1),
                  version: z.number().int().positive(),
                })
                .strict()
                .parse(body);
              if (!robot.publicId && robot.version !== data.version)
                throw new RegistryError(
                  409,
                  "The draft changed. Reload and review the owner and identity before confirming registration.",
                );
              if (!robot.model || !robot.serialKey || !robot.ownerName)
                throw new RegistryError(
                  400,
                  "Model, manufacturer serial number and owner are required.",
                );
              const nameplate = await tx.robotFile.findFirst({
                where: {
                  id: data.nameplateId,
                  robotId: robot.id,
                  kind: "NAMEPLATE",
                },
              });
              if (!nameplate)
                throw new RegistryError(
                  400,
                  "Upload and select a private nameplate image for this robot.",
                );
              if (robot.publicId) {
                if (
                  robot.lifecycle !== "REGISTERED" ||
                  robot.nameplateId !== data.nameplateId
                )
                  throw new RegistryError(409, "Robot is already registered.");
                const { model: _model, ...registered } = robot;
                result = registered;
              } else {
                const [number] = await tx.$queryRaw<
                  { value: bigint }[]
                >`SELECT nextval('robot_public_number') AS value`;
                result = await tx.robotAsset.update({
                  where: { id: robot.id },
                  data: {
                    publicId: `HFB-RB-${number.value.toString().padStart(6, "0")}`,
                    lifecycle: "REGISTERED",
                    nameplateId: nameplate.id,
                    registeredBrand: robot.model.brand,
                    registeredModel: robot.model.model,
                    ownerConfirmedBy: actor.email!,
                    ownerConfirmedAt: new Date(),
                    version: { increment: 1 },
                  },
                });
                await tx.robotAudit.create({
                  data: {
                    robotId: robot.id,
                    kind: "REGISTERED",
                    data: jsonValue(result),
                    actorId: actor.id,
                    actorEmail: actor.email!,
                  },
                });
              }
            } else if (parts[2] === "inspection") {
              const data = inspectionInput.parse(body);
              if (robot.lifecycle !== "REGISTERED")
                throw new RegistryError(
                  409,
                  "Only registered, active robots can pass inspection.",
                );
              result = await saveRecord(
                tx,
                robot,
                { ...data, kind: "INSPECTION" },
                { id: actor.id, email: actor.email! },
              );
            } else if (parts[2] === "retire") {
              const data = z
                .object({ reason: text.min(1) })
                .strict()
                .parse(body);
              if (!robot.publicId)
                throw new RegistryError(
                  409,
                  "Only registered robots can be retired.",
                );
              if (robot.lifecycle === "RETIRED")
                throw new RegistryError(409, "Robot is already retired.");
              result = await tx.robotAsset.update({
                where: { id: robot.id },
                data: { lifecycle: "RETIRED", version: { increment: 1 } },
              });
              await tx.robotAudit.create({
                data: {
                  robotId: robot.id,
                  kind: "RETIRED",
                  data: { reason: data.reason, publicId: robot.publicId },
                  actorId: actor.id,
                  actorEmail: actor.email!,
                },
              });
            } else throw new RegistryError(404, "Not found.");
          } else throw new RegistryError(404, "Not found.");
          const response = jsonValue(result);
          await tx.robotRequest.create({ data: { key, hash, response } });
          return response;
        },
        { maxWait: 15000, timeout: 15000 },
      );
      return json(result);
    } catch (error) {
      if (error instanceof RegistryError || error instanceof RecordError)
        return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError)
        return json(
          {
            error: error.issues
              .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
              .join("; "),
          },
          400,
        );
      if (error instanceof SyntaxError)
        return json({ error: "Invalid JSON." }, 400);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2003", "P2025"].includes(error.code)
      )
        return json(
          { error: "Duplicate serial number or invalid reference." },
          409,
        );
      console.error(
        "Robot registry request failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return json({ error: "Robot registry is unavailable." }, 503);
    }
  };
}
