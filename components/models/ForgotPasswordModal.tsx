"use client";

import useForgotPasswordModal from "@/hook/useForgotPasswordModal";
import useLoginModal from "@/hook/useLoginModal";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { FiArrowLeft, FiCheck } from "react-icons/fi";

import Button from "../Button";
import AuthModal from "../auth/AuthModal";
import FloatingInput from "../inputs/FloatingInput";
import CodeInput from "../inputs/CodeInput";
import PasswordRules from "../auth/PasswordRules";
import { validatePassword, PASSWORD_RULE_MESSAGE } from "@/lib/passwordPolicy";
import { isValidEmailAddress, EMAIL_RULE_MESSAGE } from "@/lib/emailFormat";

type Step = "request" | "reset" | "success";

const RESEND_SECONDS = 30;

function ForgotPasswordModal() {
  const forgotModal = useForgotPasswordModal();
  const loginModal = useLoginModal();

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>("request");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FieldValues>({
    defaultValues: { email: "", password: "" },
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
    setStep("request");
    setCode("");
    setResendIn(0);
    reset();
    forgotModal.onClose();
  }, [forgotModal, reset]);

  const backToLogin = useCallback(() => {
    handleClose();
    loginModal.onOpen();
  }, [handleClose, loginModal]);

  // Step 1 → request a reset code. Response is always ok (no email enumeration).
  const onRequest: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);
    axios
      .post("/api/forgot-password", { email: data.email })
      .then(() => {
        setStep("reset");
        setResendIn(RESEND_SECONDS);
        toast.success("If that email has an account, a reset code is on its way.");
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error ?? "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  };

  // Step 2 → confirm the code + set the new password.
  const onReset: SubmitHandler<FieldValues> = (data) => {
    if (code.length < 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setIsLoading(true);
    axios
      .post("/api/reset-password", { email, code, password: data.password })
      .then(() => setStep("success"))
      .catch((err) => {
        toast.error(err?.response?.data?.error ?? "Could not reset your password.");
      })
      .finally(() => setIsLoading(false));
  };

  const handleResend = useCallback(() => {
    if (resendIn > 0 || !email) return;
    axios
      .post("/api/forgot-password", { email })
      .then(() => {
        setResendIn(RESEND_SECONDS);
        toast.success("A new code is on its way.");
      })
      .catch(() => toast.error("Could not resend the code."));
  }, [email, resendIn]);

  const backButton = (to: Step) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="mb-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand-muted transition hover:text-brand"
    >
      <FiArrowLeft size={15} /> Back
    </button>
  );

  return (
    <AuthModal isOpen={forgotModal.isOpen} onClose={handleClose} disabled={isLoading}>
      {step === "request" && (
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand">
            Reset password
          </div>
          <h2 className="font-display mt-3 text-[34px] leading-[1.16] text-brand">
            Forgot your password?
          </h2>
          <p className="mt-1.5 text-[15px] text-brand-muted">
            Enter your account email and we&apos;ll send you a reset code.
          </p>
          <div className="mt-6 flex flex-col gap-3.5">
            <FloatingInput
              id="email"
              label="Email address"
              type="email"
              required
              disabled={isLoading}
              register={register}
              errors={errors}
              registerOptions={{
                required: "Enter your email address",
                validate: (v) => isValidEmailAddress(v) || EMAIL_RULE_MESSAGE,
              }}
            />
            <Button label="Send reset code" disabled={isLoading} onClick={handleSubmit(onRequest)} />
            <p className="text-center text-[14px] text-brand-muted">
              Remembered it?{" "}
              <span onClick={backToLogin} className="cursor-pointer font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
                Back to log in
              </span>
            </p>
          </div>
        </div>
      )}

      {step === "reset" && (
        <div>
          {backButton("request")}
          <h2 className="font-display text-[30px] leading-[1.16] text-brand">Set a new password</h2>
          <p className="mt-1.5 text-[15px] text-brand-muted">
            Enter the 6-digit code we sent to{" "}
            <span className="font-extrabold text-brand">{email || "your email"}</span> and choose a new password.
          </p>
          <div className="mt-6 flex flex-col gap-4">
            <CodeInput onChange={setCode} onComplete={setCode} disabled={isLoading} />
            <FloatingInput
              id="password"
              label="New password"
              type="password"
              required
              disabled={isLoading}
              register={register}
              errors={errors}
              registerOptions={{
                required: "Create a password",
                validate: (v) => validatePassword(v).valid || PASSWORD_RULE_MESSAGE,
              }}
            />
            {(password?.length ?? 0) > 0 && <PasswordRules password={password} />}
            <Button label="Reset password" disabled={isLoading} onClick={handleSubmit(onReset)} />
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
          <h2 className="font-display text-[32px] leading-[1.16] text-brand">Password updated</h2>
          <p className="mb-6 mt-2 max-w-[320px] text-[15px] text-brand-muted">
            You can now log in with your new password.
          </p>
          <div className="w-full">
            <Button label="Back to log in" onClick={backToLogin} />
          </div>
        </div>
      )}
    </AuthModal>
  );
}

export default ForgotPasswordModal;
