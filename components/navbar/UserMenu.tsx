"use client";

import useLoginModel from "@/hook/useLoginModal";
import useRegisterModal from "@/hook/useRegisterModal";
import useRentModal from "@/hook/useRentModal";
import useIndividualRentModal from "@/hook/useIndividualRentModal";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { SafeUser } from "@/types";
import { signOut } from "next-auth/react";
import { useCallback, useState } from "react";
import { AiOutlineMenu } from "react-icons/ai";
import { toast } from "react-toastify";
import { isProviderProfileComplete } from "@/lib/providerProfile";
import Avatar from "../Avatar";
import MenuItem from "./MenuItem";

type Props = {
  currentUser?: SafeUser | null;
  isAdmin?: boolean;
  canManageRegistry?: boolean;
  transparent?: boolean;
};

function UserMenu({ currentUser, isAdmin = false, canManageRegistry = false, transparent = false }: Props) {
  const router = useRouter();
  const registerModel = useRegisterModal();
  const loginModel = useLoginModel();
  const rentModel = useRentModal();
  const individualModal = useIndividualRentModal();
  const [isOpen, setIsOpen] = useState(false);
  const isProvider = currentUser?.userType === "PROVIDER";
  const isCustomer = currentUser?.userType === "CUSTOMER";

  const toggleOpen = useCallback(() => {
    setIsOpen((value) => !value);
  }, []);

  const onRent = useCallback(() => {
    if (!currentUser) {
      return loginModel.onOpen();
    }

    // isAdmin here is canManageServices (provider OR admin).
    if (!isAdmin) {
      return;
    }

    // Require a complete profile before listing; otherwise send them to fill it.
    if (!isProviderProfileComplete(currentUser)) {
      toast("Complete your profile to start listing.");
      setIsOpen(false);
      router.push("/profile");
      return;
    }

    rentModel.onOpen();
  }, [currentUser, isAdmin, loginModel, rentModel, router]);

  return (
    <div className="relative">
      <div className="flex flex-row items-center gap-3">
        {isAdmin && (
          <div
            className={`hidden md:block text-sm font-semibold py-3 px-4 rounded-full transition cursor-pointer ${
              transparent ? "text-white hover:bg-white/10" : "hover:bg-neutral-100"
            }`}
            onClick={onRent}
          >
            List a Service
          </div>
        )}
        <div
          onClick={toggleOpen}
          className={`p-4 md:py-1 md:px-2 border-[1px] flex flex-row items-center gap-3 rounded-full cursor-pointer hover:shadow-md transition ${
            transparent ? "border-white/60 text-white" : ""
          }`}
        >
          <AiOutlineMenu />
          <div className="hidden md:block">
            {currentUser ? (
              <Avatar src={currentUser?.image!} userName={currentUser?.name} />
            ) : (
              <Image
                className="rounded-full"
                height="30"
                width="30"
                alt="Avatar"
                src="/assets/avatar.png"
              />
            )}
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="absolute rounded-xl shadow-md w-[200px] bg-white overflow-hidden right-0 top-12 text-sm">
          <div className="flex flex-col cursor-pointer">
            {currentUser ? (
              <>
                {(isAdmin || isProvider) && (
                  <div className="px-4 py-2 text-xs font-semibold bg-black text-white uppercase tracking-wide">
                    {isAdmin ? "Administrator" : "Service Provider"}
                  </div>
                )}
                <MenuItem
                  onClick={() => { setIsOpen(false); router.push("/profile"); }}
                  label="Profile"
                />
                {canManageRegistry && <MenuItem onClick={() => { setIsOpen(false); router.push('/admin/robots'); }} label="Robot registry" />}
                {isCustomer ? (
                  <>
                    <MenuItem
                      onClick={() => { setIsOpen(false); router.push("/trips"); }}
                      label="My scheduled services"
                    />
                    <MenuItem
                      onClick={() => { setIsOpen(false); router.push("/favorites"); }}
                      label="Saved services"
                    />
                    <MenuItem
                      onClick={() => {
                        setIsOpen(false);
                        router.push("/robot-types");
                      }}
                      label="Browse robot types"
                    />
                    <MenuItem
                      onClick={() => { setIsOpen(false); router.push("/my-robots"); }}
                      label="My robots"
                    />
                    <MenuItem
                      onClick={() => {
                        if (!currentUser) { setIsOpen(false); return loginModel.onOpen(); }
                        setIsOpen(false);
                        individualModal.onOpen();
                      }}
                      label="List your robot"
                    />
                    <hr />
                    <MenuItem onClick={() => { setIsOpen(false); signOut(); }} label="Logout" />
                  </>
                ) : (
                  <>
                    <MenuItem
                      onClick={() => { setIsOpen(false); router.push("/reservations"); }}
                      label={isAdmin ? "Service bookings (ADMIN)" : "Service bookings"}
                    />
                    {(isAdmin || isProvider) && (
                      <MenuItem
                        onClick={() => { setIsOpen(false); router.push("/my-listings"); }}
                        label="My services"
                      />
                    )}
                    {isAdmin && (
                      <MenuItem
                        onClick={() => { setIsOpen(false); router.push("/admin/orders"); }}
                        label="Orders (ADMIN)"
                      />
                    )}
                    {isAdmin && <MenuItem onClick={() => { setIsOpen(false); onRent(); }} label="List a service" />}
                    {(isAdmin || isProvider) && (
                      <MenuItem
                        onClick={() => { setIsOpen(false); router.push("/available-robots"); }}
                        label="Available robots"
                      />
                    )}
                    <MenuItem
                      onClick={() => {
                        setIsOpen(false);
                        router.push("/robot-types");
                      }}
                      label="Browse robot types"
                    />
                    <hr />
                    <MenuItem onClick={() => { setIsOpen(false); signOut(); }} label="Logout" />
                  </>
                )}
              </>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    setIsOpen(false);
                    router.push("/robot-types");
                  }}
                  label="Browse robot types"
                />
                <MenuItem onClick={() => { setIsOpen(false); registerModel.onClose(); loginModel.onOpen(); }} label="Login" />
                <MenuItem onClick={() => { setIsOpen(false); loginModel.onClose(); registerModel.onOpen(); }} label="Sign up" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
