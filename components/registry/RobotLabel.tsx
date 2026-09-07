"use client";
import Image from "next/image";
import { useState } from "react";
import { RobotPanelProps, button } from "./types";

export default function RobotLabel({
  robot,
  call,
  run,
  busy,
  environment,
}: RobotPanelProps & { environment: string }) {
  const [label, setLabel] = useState<{
    publicId: string;
    qr: string;
    url: string;
  } | null>(null);
  return (
    <section className="rounded-xl border p-4">
      <button
        className={button}
        disabled={busy}
        onClick={() =>
          run(async () => setLabel(await call(`robots/${robot.id}/label`)))
        }
      >
        Preview printable label
      </button>
      {label && (
        <>
          <div className="robot-print-label mx-auto my-4 max-w-sm border border-black bg-white p-5 text-center text-black">
            <Image
              className="mx-auto h-auto"
              src="/hifivebot-logo.png"
              width={160}
              height={50}
              alt="Hifivebot"
            />
            {environment !== "production" && (
              <p className="font-bold">TEST LABEL · NOT A PRODUCTION ASSET</p>
            )}
            <Image
              unoptimized
              className="mx-auto"
              src={label.qr}
              width={260}
              height={260}
              alt={`QR code for ${label.publicId}`}
            />
            <p className="text-xl font-bold">{label.publicId}</p>
            <a className="break-all text-xs underline" href={label.url}>
              {label.url}
            </a>
          </div>
          <button className={button} onClick={() => window.print()}>
            Print label
          </button>
        </>
      )}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .robot-print-label,
          .robot-print-label * {
            visibility: visible;
          }
          .robot-print-label {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
          }
        }
      `}</style>
    </section>
  );
}
