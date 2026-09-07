"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SafeUser } from "@/types";
import Container from "../Container";
import Logo from "./Logo";
import Search from "./Search";
import UserMenu from "./UserMenu";

type Props = {
  currentUser?: SafeUser | null;
  isAdmin?: boolean;
  canManageRegistry?: boolean;
};

function Navbar({ currentUser, isAdmin = false, canManageRegistry = false }: Props) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled;

  return (
    <div
      className={`fixed w-full z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-sm shadow-sm" : "bg-transparent"
      }`}
    >
      <div className={`py-4 transition-all duration-300 ${scrolled ? "border-b-[1px]" : ""}`}>
        <Container>
          <div className="grid grid-cols-3 items-center gap-3">
            <Logo transparent={transparent} />
            <div className="flex justify-center">
              <Search transparent={transparent} />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <Link
                href="/robot-types"
                className={`hidden md:block text-sm font-semibold py-2 px-4 rounded-full border transition ${
                  transparent
                    ? "border-white/70 text-white hover:bg-white/10"
                    : "border-black hover:bg-neutral-100"
                }`}
              >
                Robot Types
              </Link>
<UserMenu currentUser={currentUser} isAdmin={isAdmin} canManageRegistry={canManageRegistry} transparent={transparent} />
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
}

export default Navbar;
