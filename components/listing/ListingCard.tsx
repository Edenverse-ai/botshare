"use client";

import { SafeReservation, SafeUser, safeListing } from "@/types";
import { format } from "date-fns";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useMemo } from "react";
import Button from "../Button";
import HeartButton from "../HeartButton";
import StatusBadge from "../orders/StatusBadge";

type Props = {
  data: safeListing;
  reservation?: SafeReservation;
  onAction?: (id: string) => void;
  disabled?: boolean;
  actionLabel?: string;
  actionId?: string;
  currentUser?: SafeUser | null;
};

function ListingCard({
  data,
  reservation,
  onAction,
  disabled,
  actionLabel,
  actionId = "",
  currentUser,
}: Props) {
  const router = useRouter();
  const serviceDetail = data.title?.trim() || "Hifivebot Service";

  const handleCancel = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();

      if (disabled) return;

      onAction?.(actionId);
    },
    [onAction, actionId, disabled]
  );

  const price = useMemo(() => {
    if (reservation) {
      return reservation.totalPrice;
    }

    return data.price;
  }, [reservation, data.price]);

  const reservationDate = useMemo(() => {
    if (!reservation) {
      return null;
    }

    const start = new Date(reservation.startDate);
    const end = new Date(reservation.endDate);

    return `${format(start, "PP")} - ${format(end, "PP")}`;
  }, [reservation]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.8,
        delay: 0.5,
        ease: [0, 0.71, 0.2, 1.01],
      }}
      onClick={() => router.push(`/listings/${data.id}`)}
      className="col-span-1 cursor-pointer group"
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="aspect-square w-full relative overflow-hidden rounded-xl bg-neutral-100">
          <Image
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-contain h-full w-full group-hover:scale-110 transition p-2"
            src={data.imageSrc}
            alt="service"
          />
          <div className="absolute top-3 right-3">
            <HeartButton listingId={data.id} currentUser={currentUser} />
          </div>
        </div>
        <div className="font-semibold text-lg">{serviceDetail}</div>
        {data.providerName && (
          <div className="font-light text-neutral-500">
            By {data.providerName}
          </div>
        )}
        <div className="flex flex-row items-center">
          <div className="flex gap-1 font-semibold">
            ${price} {!reservation && <div className="font-light"> / day</div>}
          </div>
        </div>
        {reservationDate && (
          <div className="font-light text-neutral-500">{reservationDate}</div>
        )}
        {reservation && (
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={reservation.status} />
            <Link
              href={`/orders/${reservation.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-gray-700 underline hover:text-black"
            >
              View order status
            </Link>
          </div>
        )}
        {!reservation && onAction && actionLabel && (
          <Button
            disabled={disabled}
            small
            label={actionLabel}
            onClick={handleCancel}
          />
        )}
      </div>
    </motion.div>
  );
}

export default ListingCard;
