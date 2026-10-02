import HeroCarousel from "@/components/HeroCarousel";
import ServiceShowcase, { type ShowcaseSlide } from "@/components/ServiceShowcase";
import { getRobotTags, robotTagDescription } from "@/lib/robotTags";

// Robot types come from the live robot catalog, so tagging a model in the
// admin catalog shows up here without a deploy.
export const dynamic = "force-dynamic";

// Tags with footage play it behind the slide; the rest show product shots.
const TAG_VIDEOS: Record<string, string> = {
  Performance:
    "https://res.cloudinary.com/dmrhtzqyx/video/upload/q_auto,f_auto/agibot-stage-performance.mp4",
};

export default async function Home() {
  const tags = await getRobotTags().catch(() => []);

  const slides: ShowcaseSlide[] = tags.map((tag) => {
    const names = tag.models.map((m) => `${m.brand} ${m.model}`);
    const shown = names.slice(0, 3).join(" · ");
    return {
      key: tag.slug,
      overline: `${tag.models.length} robot ${tag.models.length === 1 ? "model" : "models"}${
        tag.fromPrice ? ` · from $${tag.fromPrice.toLocaleString("en-US")} per day` : ""
      }`,
      title: tag.tag,
      subtitle: names.length > 3 ? `${shown} +${names.length - 3} more` : shown,
      description: robotTagDescription(tag.tag),
      href: `/services/tags/${tag.slug}`,
      videoSrc: TAG_VIDEOS[tag.tag],
      images: tag.models
        .filter((m) => m.imageUrl)
        .slice(0, 3)
        .map((m) => ({ src: m.imageUrl!, alt: `${m.brand} ${m.model}` })),
    };
  });

  return (
    <>
      <HeroCarousel />
      {slides.length > 0 && <ServiceShowcase slides={slides} />}
    </>
  );
}
