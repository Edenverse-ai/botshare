import type { ReactNode } from "react";
import Link from "next/link";
import Container from "@/components/Container";
import ListingCard from "@/components/listing/ListingCard";
import CategoryChips from "./CategoryChips";
import type { SafeUser, safeListing } from "@/types";
import { barlow } from "@/lib/fonts";

type Props = {
  title: string;
  subtitle: string;
  listings: safeListing[];
  currentUser?: SafeUser | null;
  /** Highlights the matching chip and drives the empty-state reset link. */
  activeSlug?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  /** Replaces the scenario chips, e.g. with robot type chips. */
  chips?: ReactNode;
  browseAllLabel?: string;
};

function ServiceResults({
  title,
  subtitle,
  listings,
  currentUser,
  activeSlug,
  emptyTitle = "No service packages match yet",
  emptySubtitle = "Try another scenario, or widen the coverage area and dates in search.",
  chips,
  browseAllLabel = "Browse all scenarios",
}: Props) {
  return (
    <section className="w-full bg-white py-14 sm:py-16">
      <Container>
        <div className="flex flex-col gap-3">
          <h2
            className={`${barlow.className} text-3xl font-extrabold uppercase tracking-tight text-neutral-900 sm:text-4xl`}
          >
            {title}
          </h2>
          <p className="max-w-2xl text-neutral-600">{subtitle}</p>
        </div>

        <div className="mt-8">
          {chips ?? <CategoryChips activeSlug={activeSlug} />}
        </div>

        {listings.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-xl font-semibold text-neutral-900">
              {emptyTitle}
            </p>
            <p className="max-w-md text-neutral-500">{emptySubtitle}</p>
            <Link
              href="/services"
              className="mt-2 inline-flex rounded-full border border-neutral-900 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900 hover:text-white"
            >
              {browseAllLabel}
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-8 overflow-x-hidden sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                data={listing}
                currentUser={currentUser}
              />
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}

export default ServiceResults;
