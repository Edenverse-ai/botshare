import ClientOnly from "@/components/ClientOnly";
import EmptyState from "@/components/EmptyState";
import { isAdminEmail } from "@/lib/adminAuth";
import getCurrentUser from "../actions/getCurrentUser";
import getListings from "../actions/getListings";
import MyListingsClient from "./MyListingsClient";

const MyListingsPage = async () => {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return (
      <ClientOnly>
        <EmptyState title="Unauthorized" subtitle="Please login" />
      </ClientOnly>
    );
  }

  if (currentUser.userType !== "PROVIDER" && !isAdminEmail(currentUser.email)) {
    return (
      <ClientOnly>
        <EmptyState
          title="Access required"
          subtitle="Only service providers and admins can view this page."
        />
      </ClientOnly>
    );
  }

  const isAdmin = isAdminEmail(currentUser.email);
  // An admin sees every service; a provider sees only their own.
  const listings = await getListings(isAdmin ? {} : { userId: currentUser.id });

  if (listings.length === 0) {
    return (
      <ClientOnly>
        <EmptyState
          title="No services found"
          subtitle="Looks like you have not published any services."
        />
      </ClientOnly>
    );
  }

  return (
    <ClientOnly>
      <MyListingsClient listings={listings} currentUser={currentUser} />
    </ClientOnly>
  );
};

export default MyListingsPage;
