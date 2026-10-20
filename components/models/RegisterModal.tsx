"use client";

import useLoginModal from "@/hook/useLoginModal";
import useRegisterModal from "@/hook/useRegisterModal";
import { TERMS_VERSION } from "@/lib/termsContent";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { FiArrowLeft, FiCheck } from "react-icons/fi";
import { TbRobot } from "react-icons/tb";
import { MdOutlineStorefront } from "react-icons/md";

import Button from "../Button";
import AuthModal from "../auth/AuthModal";
import RoleCard from "../auth/RoleCard";
import FloatingInput from "../inputs/FloatingInput";
import CodeInput from "../inputs/CodeInput";
import PasswordRules from "../auth/PasswordRules";
import { validatePassword, PASSWORD_RULE_MESSAGE } from "@/lib/passwordPolicy";
import { isValidEmailAddress, EMAIL_RULE_MESSAGE } from "@/lib/emailFormat";

type UserType = "CUSTOMER" | "PROVIDER";
type Step = "role" | "form" | "verify" | "success";

const RESEND_SECONDS = 30;

function RegisterModal() {
  const registerModal = useRegisterModal();
  const loginModal = useLoginModal();

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("role");
  const [userType, setUserType] = useState<UserType>("CUSTOMER");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FieldValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      businessName: "",
      agreed: false,
    },
  });

  const email = watch("email");
  const password = watch("password");

  // Resend cooldown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleClose = useCallback(() => {
    setStep("role");
    setUserType("CUSTOMER");
    setCode("");
    setResendIn(0);
    reset();
    registerModal.onClose();
  }, [registerModal, reset]);

  const goToLogin = useCallback(() => {
    handleClose();
    loginModal.onOpen();
  }, [handleClose, loginModal]);

  const handleSelectType = useCallback((type: UserType) => {
    setUserType(type);
    setStep("form");
  }, []);

  // Step 2 → create the (unverified) account and trigger the code email.
  // react-hook-form validates the fields (and surfaces inline errors) before
  // this runs, so we only handle the happy path here.
  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);

    const payload: Record<string, unknown> = { ...data, userType };
    delete payload.agreed;
    if (userType === "CUSTOMER") payload.termsVersion = TERMS_VERSION;

    axios
      .post("/api/register", payload)
      .then(() => {
        setStep("verify");
        setResendIn(RESEND_SECONDS);
        toast.success("We sent a verification code to your email.");
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error ?? "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  };

  // Step 3 → confirm the 6-digit code.
  const handleVerify = useCallback(() => {
    if (code.length < 6) return;
    setIsLoading(true);
    axios
      .post("/api/verify-email", { email, code })
      .then(() => setStep("success"))
      .catch((err) => {
        toast.error(err?.response?.data?.error ?? "Invalid or expired code.");
      })
      .finally(() => setIsLoading(false));
  }, [code, email]);

  const handleResend = useCallback(() => {
    if (resendIn > 0) return;
    axios
      .post("/api/verify-email/resend", { email })
      .then(() => {
        setResendIn(RESEND_SECONDS);
        toast.success("A new code is on its way.");
      })
      .catch(() => toast.error("Could not resend the code."));
  }, [email, resendIn]);

  const kicker = (label: string) => (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand">
      {label}
    </div>
  );

  const backButton = (to: Step) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="mb-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand-muted transition hover:text-brand"
    >
      <FiArrowLeft size={15} /> Back
    </button>
  );

  const isProvider = userType === "PROVIDER";

  return (
    <AuthModal
      isOpen={registerModal.isOpen}
      onClose={handleClose}
      size={step === "role" ? "wide" : "narrow"}
      disabled={isLoading}
    >
      {step === "role" && (
        <div>
          {kicker("Get started")}
          <h2 className="font-display mt-3 text-[34px] leading-[1.16] text-brand">
            How will you use Hifivebot?
          </h2>
          <p className="mt-1.5 text-[15px] text-brand-muted">
            Pick the path that fits you best.
          </p>
          <div className="mt-6 flex items-stretch gap-3.5">
            <RoleCard
              icon={TbRobot}
              title="Rent robots"
              description="Book robot services for events, venues, and operations."
              onClick={() => handleSelectType("CUSTOMER")}
            />
            <RoleCard
              icon={MdOutlineStorefront}
              title="List your robots"
              description="Offer your fleet and earn on the marketplace."
              onClick={() => handleSelectType("PROVIDER")}
            />
          </div>
          <p className="mt-6 text-center text-[14px] text-brand-muted">
            Already have an account?{" "}
            <span onClick={goToLogin} className="cursor-pointer font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
              Log in
            </span>
          </p>
        </div>
      )}

      {step === "form" && (
        <div>
          {backButton("role")}
          <h2 className="font-display text-[30px] leading-[1.16] text-brand">
            {isProvider ? "Create a provider account" : "Create your account"}
          </h2>
          <p className="mt-1.5 text-[15px] text-brand-muted">
            {isProvider ? "Start listing your robot services." : "Book robot services in minutes."}
          </p>
          <div className="mt-6 flex flex-col gap-3.5">
            <FloatingInput id="email" label="Email address" type="email" required disabled={isLoading} register={register} errors={errors} registerOptions={{
                required: "Enter your email address",
                validate: (v) => isValidEmailAddress(v) || EMAIL_RULE_MESSAGE,
              }} />
            <FloatingInput id="name" label="Username" required disabled={isLoading} register={register} errors={errors} registerOptions={{ required: "Choose a username" }} />
            <FloatingInput id="password" label="Password" type="password" required disabled={isLoading} register={register} errors={errors} registerOptions={{ required: "Create a password", validate: (v) => validatePassword(v).valid || PASSWORD_RULE_MESSAGE }} />
            {(password?.length ?? 0) > 0 && <PasswordRules password={password} />}
            {isProvider && (
              <>
                <FloatingInput id="phone" label="Phone number" type="tel" optional disabled={isLoading} register={register} errors={errors} />
                <FloatingInput id="businessName" label="Business name" optional disabled={isLoading} register={register} errors={errors} />
              </>
            )}
            {!isProvider && (
              <div>
                <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-brand-muted">
                  <input
                    type="checkbox"
                    disabled={isLoading}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                    {...register("agreed", { required: "Please accept the Terms to continue", shouldUnregister: true })}
                  />
                  <span>
                    I agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline underline-offset-2">
                      Hifivebot Terms
                    </a>{" "}
                    &amp; Privacy Policy.
                  </span>
                </label>
                {errors.agreed && (
                  <p className="mt-1.5 px-1 text-[12.5px] font-semibold text-rose-500">
                    {errors.agreed.message as string}
                  </p>
                )}
              </div>
            )}
            <Button
              label="Create account"
              disabled={isLoading}
              onClick={handleSubmit(onSubmit)}
            />
            <p className="text-center text-[14px] text-brand-muted">
              Already have an account?{" "}
              <span onClick={goToLogin} className="cursor-pointer font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
                Log in
              </span>
            </p>
          </div>
        </div>
      )}

      {step === "verify" && (
        <div>
          {backButton("form")}
          <h2 className="font-display text-[30px] leading-[1.16] text-brand">Check your inbox</h2>
          <p className="mt-1.5 text-[15px] text-brand-muted">
            Enter the 6-digit code we sent to{" "}
            <span className="font-extrabold text-brand">{email || "your email"}</span>
          </p>
          <div className="mt-6 flex flex-col gap-5">
            <CodeInput onChange={setCode} onComplete={setCode} disabled={isLoading} />
            <Button label="Verify email" disabled={isLoading || code.length < 6} onClick={handleVerify} />
            <p className="text-center text-[14px] text-brand-muted">
              Didn&apos;t get a code?{" "}
              {resendIn > 0 ? (
                <span className="font-bold text-brand-muted">Resend in {resendIn}s</span>
              ) : (
                <span onClick={handleResend} className="cursor-pointer font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
                  Resend
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center pb-1 pt-3 text-center">
          <div className="mb-[18px] flex h-[68px] w-[68px] items-center justify-center rounded-full bg-brand text-white">
            <FiCheck size={30} style={{ strokeWidth: 2.6 }} />
          </div>
          <h2 className="font-display text-[32px] leading-[1.16] text-brand">You&apos;re all set</h2>
          <p className="mb-6 mt-2 max-w-[320px] text-[15px] text-brand-muted">
            Your email is verified. Welcome to Hifivebot.
          </p>
          <div className="w-full">
            <Button label="Continue to Hifivebot" onClick={goToLogin} />
          </div>
        </div>
      )}
    </AuthModal>
  );
}

export default RegisterModal;
