import { Listing, Reservation, User, ReservationEvent } from "@prisma/client";
import { OrderStatus } from "@/lib/orderStatus";

export type safeListing = Omit<Listing, "createdAt"> & {
  createdAt: string;
  providerName?: string;
};

export type SafeReservation = Omit<
  Reservation,
  "createdAt" | "startDate" | "endDate" | "listing" | "status"
> & {
  createdAt: string;
  startDate: string;
  endDate: string;
  status: OrderStatus;
  listing: safeListing;
};

export type SafeAdminReservation = SafeReservation & {
  /** Who physically performs the service, when that is not the provider. */
  operatorEmail: string | null;
  operatorLabel: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerBusinessName: string | null;
};

export type SafeReservationEvent = Omit<
  ReservationEvent,
  "createdAt" | "status"
> & {
  createdAt: string;
  status: OrderStatus;
  actorName: string | null;
};

export type SafeOrderDetail = SafeReservation & {
  providerId: string;
  events: SafeReservationEvent[];
};

export type SafeUser = Omit<
  User,
  "createdAt" | "updatedAt" | "emailVerified"
> & {
  createdAt: string;
  updatedAt: string;
  emailVerified: string | null;
  favoriteListingIds: string[];
};
