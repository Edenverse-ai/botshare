import { Prisma, RobotAsset } from "@prisma/client";
import { z } from "zod";

const time = z.string().datetime({ offset: true });
const text = z.string().trim().min(1).max(2000);
const common = {
  attachmentIds: z.array(z.string().min(1)).max(10).default([]),
  correctionReason: text.optional(),
};
export const inspectionInput = z
  .object({ time, inspector: text, passed: z.boolean(), reason: text })
  .strict();
const recordInput = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...common,
        kind: z.literal("USAGE"),
        startTime: time,
        endTime: time,
        purpose: text,
        operator: text,
        result: text,
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("DAMAGE"),
        time,
        description: text,
        affectsUse: z.boolean(),
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal("MAINTENANCE"),
        time,
        work: text,
        technician: text,
        inspectionResult: z.enum(["PENDING", "FAILED", "PASSED"]),
      })
      .strict(),
    inspectionInput.extend({ ...common, kind: z.literal("INSPECTION") }),
  ])
  .refine(
    (data) =>
      data.kind !== "USAGE" ||
      new Date(data.endTime) >= new Date(data.startTime),
    { message: "Usage end must not precede its start.", path: ["endTime"] },
  );

export class RecordError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function saveRecord(
  tx: Prisma.TransactionClient,
  robot: RobotAsset,
  input: unknown,
  actor: { id: string; email: string },
  corrects?: string,
) {
  if (!robot.publicId)
    throw new RecordError(
      409,
      "Register the robot before adding operational records.",
    );
  const { correctionReason, ...data } = recordInput.parse(input);
  const previous = corrects
    ? await tx.robotRecord.findFirst({
        where: { id: corrects, robotId: robot.id },
      })
    : null;
  if (corrects && !previous)
    throw new RecordError(404, "Record not found on this robot.");
  if (previous) {
    if (!correctionReason)
      throw new RecordError(400, "Explain the correction.");
    if (previous.kind !== data.kind)
      throw new RecordError(400, "Corrections cannot change the record type.");
    if (
      await tx.robotRecord.findUnique({ where: { supersedesId: previous.id } })
    )
      throw new RecordError(
        409,
        "This record has a newer revision. Correct the latest revision.",
      );
  } else if (correctionReason)
    throw new RecordError(400, "Select the record being corrected.");
  for (const id of data.attachmentIds) {
    if (
      !(await tx.robotFile.findFirst({
        where: { id, robotId: robot.id, kind: "ATTACHMENT" },
      }))
    )
      throw new RecordError(
        400,
        "Select a private operational attachment belonging to this robot.",
      );
  }
  const eventAt = new Date(data.kind === "USAGE" ? data.startTime : data.time);
  const lastReportedTime =
    data.kind === "USAGE" ? new Date(data.endTime) : eventAt;
  if (lastReportedTime.getTime() > Date.now() + 5 * 60 * 1000)
    throw new RecordError(
      400,
      "Operational records describe completed events; timestamps cannot be in the future (five-minute clock tolerance).",
    );
  // Corrections retain history but never retroactively restore readiness. A
  // separate, fresh inspection is the explicit recovery action.
  let condition: string | undefined;
  if (robot.lifecycle !== "RETIRED") {
    if (
      (data.kind === "DAMAGE" && data.affectsUse) ||
      data.kind === "MAINTENANCE" ||
      (data.kind === "INSPECTION" && (!data.passed || !!previous))
    )
      condition = "MAINTENANCE";
    if (data.kind === "INSPECTION" && data.passed && !previous) {
      if (robot.conditionEventAt && eventAt < robot.conditionEventAt)
        throw new RecordError(
          409,
          "Inspection must not predate the latest condition event.",
        );
      condition = "USABLE";
    }
  } else if (data.kind === "INSPECTION" && !previous)
    throw new RecordError(
      409,
      "Retired robots cannot be restored by inspection.",
    );
  const record = await tx.robotRecord.create({
    data: {
      robotId: robot.id,
      kind: data.kind,
      data,
      eventAt,
      actorId: actor.id,
      actorEmail: actor.email,
      supersedesId: previous?.id,
      correctionReason,
    },
  });
  if (condition) {
    await tx.robotAsset.update({
      where: { id: robot.id },
      data: {
        condition,
        conditionEventAt:
          robot.conditionEventAt && robot.conditionEventAt > eventAt
            ? robot.conditionEventAt
            : eventAt,
        version: { increment: 1 },
      },
    });
    await tx.robotAudit.create({
      data: {
        robotId: robot.id,
        kind: "CONDITION_CHANGED",
        actorId: actor.id,
        actorEmail: actor.email,
        data: {
          before: robot.condition,
          after: condition,
          recordId: record.id,
          reason: correctionReason || `${data.kind} reported`,
        },
      },
    });
  }
  await tx.robotAudit.create({
    data: {
      robotId: robot.id,
      kind: previous ? "RECORD_CORRECTED" : "RECORD_ADDED",
      actorId: actor.id,
      actorEmail: actor.email,
      data: {
        recordId: record.id,
        supersedesId: previous?.id || null,
        correctionReason: correctionReason || null,
      },
    },
  });
  return record;
}
