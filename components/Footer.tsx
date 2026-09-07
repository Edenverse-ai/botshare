"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import ClientOnly from "./ClientOnly";
import { SERVICE_CATEGORY_META } from "@/lib/serviceCategories";

type FooterLink = { label: string; href?: string };

const COMPANY_LINKS: FooterLink[] = [
  { label: "About Hifivebot" },
  { label: "Service scenarios", href: "/services" },
  { label: "Robot models", href: "/robot-types" },
  { label: "Company updates" },
  { label: "Partnerships" },
];

const SUPPORT_LINKS: FooterLink[] = [
  { label: "Help Center" },
  { label: "Hifivebot Service Assurance" },
  { label: "Booking options" },
  { label: "Safety information" },
  { label: "Terms", href: "/terms" },
];

const SERVICE_LINKS: FooterLink[] = SERVICE_CATEGORY_META.map(
  ({ label, slug }) => ({ label, href: `/services/${slug}` })
);

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  { heading: "HIFIVEBOT", links: COMPANY_LINKS },
  { heading: "Support", links: SUPPORT_LINKS },
  { heading: "Services", links: SERVICE_LINKS },
];

function FooterColumn({
  heading,
  links,
  index,
}: {
  heading: string;
  links: FooterLink[];
  index: number;
}) {
  return (
    <motion.div
      initial={{ x: index % 2 === 0 ? -200 : 200, opacity: 0 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="space-y-3 text-xs text-gray-800"
    >
      <h5 className="font-bold">{heading}</h5>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.href ? (
              <Link href={link.href} className="transition hover:text-black hover:underline">
                {link.label}
              </Link>
            ) : (
              <span>{link.label}</span>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function Footer() {
  const [country, setCountry] = useState("United States");
  const pathname = usePathname();
  const isRegistry = pathname === '/admin/robots' || !!pathname?.startsWith('/robot-passports/');

  useEffect(() => {
    if (isRegistry) return;
    fetch(
      `https://extreme-ip-lookup.com/json/?key=${process.env.NEXT_PUBLIC_LOOKUP_KEY}`
    )
      .then((res) => res.json())
      .then((data) => setCountry(data.country))
      .catch(() => {});
  }, [isRegistry]);

  if (isRegistry) return <footer className="border-t px-5 py-6 text-sm text-neutral-500">Hifivebot · Robot registry</footer>;

  return (
    <ClientOnly>
      <footer className="grid grid-cols-1 gap-y-10 bg-gray-100 px-8 py-14 text-gray-600 md:grid-cols-3 md:px-16 xl:px-32">
        {COLUMNS.map((column, index) => (
          <FooterColumn
            key={column.heading}
            heading={column.heading}
            links={column.links}
            index={index}
          />
        ))}
        <div className="flex flex-col gap-1 text-sm">
          <p>{country}</p>
        </div>
      </footer>
    </ClientOnly>
  );
}

export default Footer;
