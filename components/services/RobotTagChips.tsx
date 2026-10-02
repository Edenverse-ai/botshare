import Link from "next/link";

type Props = {
  tags: { tag: string; slug: string }[];
  /** Slug of the robot tag currently being viewed, if any. */
  activeSlug?: string;
};

function RobotTagChips({ tags, activeSlug }: Props) {
  const chip = (selected: boolean) =>
    `flex flex-row items-center gap-2 whitespace-nowrap rounded-full border-[1.5px] px-5 py-2 text-sm font-semibold transition ${
      selected
        ? "border-neutral-900 bg-neutral-900 text-white"
        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-800"
    }`;

  return (
    <nav aria-label="Robot types" className="w-full">
      <ul className="flex flex-row items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-neutral-200">
        <li>
          <Link href="/services" className={chip(false)}>
            All robot types
          </Link>
        </li>
        {tags.map(({ tag, slug }) => {
          const selected = slug === activeSlug;
          return (
            <li key={slug}>
              <Link
                href={`/services/tags/${slug}`}
                aria-current={selected ? "page" : undefined}
                className={chip(selected)}
              >
                {tag}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default RobotTagChips;
