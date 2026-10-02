import ClientOnly from "@/components/ClientOnly";
import RobotTagIndex from "@/components/services/RobotTagIndex";
import ServiceResults from "@/components/services/ServiceResults";
import { matchesRobotModel } from "@/lib/robotModel";
import { categorySlug } from "@/lib/serviceCategories";
import { getRobotTags } from "@/lib/robotTags";
import getCurrentUser from "../actions/getCurrentUser";
import getListings, { IListingsParams } from "../actions/getListings";

export const dynamic = "force-dynamic";

interface ServicesProps {
  searchParams: IListingsParams;
}

// `/services` is the robot type index, built from the tags on listable robot
// models. Search and category filters keep the
// existing query-string shape and render the catalog results instead.
const FILTER_KEYS = [
  "category",
  "zipCode",
  "startDate",
  "endDate",
  "robotModel",
] as const;

function hasFilters(searchParams: IListingsParams) {
  return FILTER_KEYS.some((key) => {
    const value = searchParams[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export default async function ServicesPage({ searchParams }: ServicesProps) {
  if (!hasFilters(searchParams)) {
    return <RobotTagIndex tags={await getRobotTags()} />;
  }

  const { robotModel, ...filters } = searchParams;
  const listings = await getListings(filters);
  const filtered =
    typeof robotModel === "string" && robotModel.trim().length > 0
      ? listings.filter((item) => matchesRobotModel(item, robotModel))
      : listings;
  const currentUser = await getCurrentUser();

  const activeCategory =
    typeof filters.category === "string" ? filters.category : undefined;

  return (
    <ClientOnly>
      <ServiceResults
        title={activeCategory ?? "Service packages"}
        subtitle="Bookable Hifivebot service packages matching your coverage area, robot model, and dates."
        listings={filtered}
        currentUser={currentUser}
        activeSlug={activeCategory ? categorySlug(activeCategory) : undefined}
      />
    </ClientOnly>
  );
}
