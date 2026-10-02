import Image from "next/image";
import Link from "next/link";
import type { RobotTag } from "@/lib/robotTags";
import { robotTagDescription } from "@/lib/robotTags";
import { barlow } from "@/lib/fonts";

type Props = {
  tag: RobotTag;
};

// Same no-entrance-animation rule as ScenarioCard: this grid is the page's
// primary content and must be visible at rest.
function RobotTagCard({ tag }: Props) {
  const shots = tag.models.filter((m) => m.imageUrl).slice(0, 3);

  return (
    <article>
      <Link
        href={`/services/tags/${tag.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-colors duration-300 hover:border-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        <div className="relative flex aspect-[16/9] w-full items-end justify-center gap-2 overflow-hidden border-b border-neutral-100 bg-white px-6 pt-6">
          {shots.length > 0 ? (
            shots.map((m) => (
              <div key={m.id} className="relative h-full w-1/3">
                <Image
                  src={m.imageUrl!}
                  alt={`${m.brand} ${m.model}`}
                  fill
                  sizes="(min-width: 1280px) 8vw, (min-width: 768px) 11vw, 33vw"
                  className="object-contain object-bottom transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                />
              </div>
            ))
          ) : (
            <span
              className={`${barlow.className} self-center pb-6 text-4xl font-extrabold uppercase text-neutral-300`}
            >
              {tag.tag}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
            {tag.models.length} robot {tag.models.length === 1 ? "model" : "models"}
            {tag.fromPrice
              ? ` · from $${tag.fromPrice.toLocaleString("en-US")} per day`
              : ""}
          </p>
          <h3
            className={`${barlow.className} text-2xl font-bold uppercase leading-none tracking-tight text-neutral-900`}
          >
            {tag.tag}
          </h3>
          <div className="flex flex-1 items-end justify-between gap-4">
            <p className="text-sm leading-relaxed text-neutral-500">
              {robotTagDescription(tag.tag)}
            </p>
            <span
              aria-hidden="true"
              className="mb-1 shrink-0 text-lg text-neutral-400 transition-all duration-300 group-hover:translate-x-1 group-hover:text-neutral-900"
            >
              &rarr;
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default RobotTagCard;
