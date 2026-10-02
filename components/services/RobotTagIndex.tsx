import Link from "next/link";
import Container from "@/components/Container";
import RobotTagCard from "./RobotTagCard";
import type { RobotTag } from "@/lib/robotTags";
import { barlow } from "@/lib/fonts";

type Props = {
  tags: RobotTag[];
};

function RobotTagIndex({ tags }: Props) {
  return (
    <>
      <section
        aria-labelledby="services-heading"
        className="w-full bg-neutral-950 py-20 text-white sm:py-24"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Hifivebot services
            </p>
            <h1
              id="services-heading"
              className={`${barlow.className} mt-4 text-5xl font-extrabold uppercase leading-none tracking-tight sm:text-6xl lg:text-7xl`}
            >
              Robot Types
            </h1>
            <div className="mt-6 h-px w-16 bg-white/30" />
            <p className="mt-6 text-lg leading-relaxed text-neutral-300">
              Every Hifivebot service is built on a robot model. Pick a robot
              type to compare the models that do that work and the service
              packages bookable in your area.
            </p>
          </div>
        </Container>
      </section>

      <section aria-label="Robot types" className="w-full bg-white py-16 sm:py-20">
        <Container>
          {tags.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tags.map((tag) => (
                <RobotTagCard key={tag.slug} tag={tag} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-neutral-500">
              Robot types will appear here as soon as robot models are tagged
              and opened for booking.
            </p>
          )}
        </Container>
      </section>

      <section className="w-full bg-neutral-100 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className={`${barlow.className} text-3xl font-extrabold uppercase tracking-tight text-neutral-900 sm:text-4xl`}
            >
              Service configuration and pricing
            </h2>
            <p className="mt-4 text-neutral-600">
              Prices are per day and include one on-site operator per active
              robot. Multi-robot work, project production and custom
              development are quoted separately.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/robot-types"
                className="inline-flex items-center justify-center rounded-full bg-neutral-900 px-7 py-3 text-sm font-semibold text-white transition hover:bg-neutral-700"
              >
                Browse robot models
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

export default RobotTagIndex;
