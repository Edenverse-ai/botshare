import Image from "next/image";
import { notFound } from "next/navigation";
import ClientOnly from "@/components/ClientOnly";
import Container from "@/components/Container";
import RobotTagChips from "@/components/services/RobotTagChips";
import ServiceResults from "@/components/services/ServiceResults";
import getCurrentUser from "@/app/actions/getCurrentUser";
import getListings, { IListingsParams } from "@/app/actions/getListings";
import { getRobotTags, robotTagDescription } from "@/lib/robotTags";
import { barlow } from "@/lib/fonts";

export const dynamic = "force-dynamic";

interface RobotTagPageProps {
  params: { tag: string };
  searchParams: Omit<IListingsParams, "robotModelIds">;
}

export async function generateMetadata({ params }: RobotTagPageProps) {
  const tag = (await getRobotTags()).find((t) => t.slug === params.tag);
  if (!tag) return { title: "Robot Types — Hifivebot" };
  return {
    title: `${tag.tag} robots — Hifivebot`,
    description: robotTagDescription(tag.tag),
  };
}

export default async function RobotTagPage({
  params,
  searchParams,
}: RobotTagPageProps) {
  const tags = await getRobotTags();
  const tag = tags.find((t) => t.slug === params.tag);

  if (!tag) {
    notFound();
  }

  const [listings, currentUser] = await Promise.all([
    getListings({ ...searchParams, robotModelIds: tag.models.map((m) => m.id) }),
    getCurrentUser(),
  ]);

  return (
    <>
      <section
        aria-labelledby="tag-heading"
        className="w-full bg-neutral-950 py-20 text-white sm:py-24"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Robot type
            </p>
            <h1
              id="tag-heading"
              className={`${barlow.className} mt-4 text-5xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl lg:text-7xl`}
            >
              {tag.tag}
            </h1>
            <div className="mt-6 h-px w-16 bg-white/30" />
            <p className="mt-6 text-lg leading-relaxed text-neutral-300">
              {robotTagDescription(tag.tag)}
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="models-heading" className="w-full bg-neutral-100 py-14 sm:py-16">
        <Container>
          <h2
            id="models-heading"
            className={`${barlow.className} text-3xl font-extrabold uppercase tracking-tight text-neutral-900 sm:text-4xl`}
          >
            Robot models
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {tag.models.map((m) => (
              <li
                key={m.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white"
              >
                <div className="relative aspect-square w-full bg-white">
                  {m.imageUrl ? (
                    <Image
                      src={m.imageUrl}
                      alt={`${m.brand} ${m.model}`}
                      fill
                      sizes="(min-width: 1280px) 18vw, (min-width: 640px) 30vw, 50vw"
                      className="object-contain p-4"
                    />
                  ) : (
                    <span
                      className={`${barlow.className} absolute inset-0 flex items-center justify-center text-2xl font-extrabold uppercase text-neutral-300`}
                    >
                      {m.model}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 border-t border-neutral-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                    {m.brand}
                  </p>
                  <p className="font-semibold text-neutral-900">{m.model}</p>
                  {m.priceDaily ? (
                    <p className="text-sm text-neutral-500">
                      From ${m.priceDaily.toLocaleString("en-US")} per day
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <ClientOnly>
        <ServiceResults
          title={`${tag.tag} service packages`}
          subtitle={`Bookable service packages built on ${tag.tag.toLowerCase()} robots. Prices are per day and include one on-site operator per active robot.`}
          listings={listings}
          currentUser={currentUser}
          chips={<RobotTagChips tags={tags} activeSlug={tag.slug} />}
          browseAllLabel="Browse all robot types"
          emptyTitle={`No ${tag.tag.toLowerCase()} service packages in this area yet`}
          emptySubtitle="Widen the coverage area or dates in search, or pick another robot type."
        />
      </ClientOnly>
    </>
  );
}
