"use client";
import useLoginModal from "@/hook/useLoginModal";

export default function RegistrySignIn() {
  const login = useLoginModal();
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-3xl font-bold">Robot registry</h1>
      <p>
        Sign in with an administrator account to view this robot’s internal
        passport.
      </p>
      <button
        className="rounded-lg bg-black px-5 py-3 text-white"
        onClick={login.onOpen}
      >
        Sign in
      </button>
    </main>
  );
}
