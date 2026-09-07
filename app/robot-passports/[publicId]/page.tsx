import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { registryDatabase } from "@/lib/registry/client";
import { readPublicPassport } from "@/lib/registry/passport";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Robot identity | Hifivebot",
  robots: { index: false, follow: false },
};
export default async function PublicPassport({
  params,
}: {
  params: { publicId: string };
}) {
  let passport;
  try {
    passport = await readPublicPassport(registryDatabase(), params.publicId);
  } catch {
    return (
      <main className="mx-auto max-w-xl p-8">
        Robot passports are temporarily unavailable.
      </main>
    );
  }
  if (!passport) notFound();
  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-8">
      <Image
        src="/hifivebot-logo.png"
        width={180}
        height={48}
        alt="Hifivebot"
        className="h-auto"
      />
      {process.env.REGISTRY_ENVIRONMENT !== "production" && (
        <p className="rounded border bg-neutral-100 p-3">
          TEST PASSPORT — demonstration record
        </p>
      )}
      <p className="text-sm uppercase tracking-widest text-neutral-500">
        Robot identity
      </p>
      <h1 className="break-words text-3xl font-bold">{passport.publicId}</h1>
      <p className="text-xl">
        {passport.brand} {passport.model}
      </p>
      {passport.presentationPhoto && (
        <Image
          unoptimized
          width={600}
          height={600}
          src={passport.presentationPhoto}
          alt={`${passport.brand} ${passport.model}`}
          className="h-auto w-full rounded-xl"
        />
      )}
      <p className="text-neutral-600">
        This passport identifies a registered physical robot. It does not
        certify ownership or availability.
      </p>
      <Link
        className="inline-block rounded-lg bg-black px-4 py-3 text-white"
        href={`/admin/robots?publicId=${passport.publicId}`}
      >
        Administrator access
      </Link>
    </main>
  );
}
