"use client";

import useLoginModal from "@/hook/useLoginModal";
import useRegisterModal from "@/hook/useRegisterModal";
import useForgotPasswordModal from "@/hook/useForgotPasswordModal";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-toastify";

import { TOO_MANY_ATTEMPTS_ERROR, TOO_MANY_REQUESTS_MESSAGE } from "@/lib/authMessages";
import { isValidEmailAddress, EMAIL_RULE_MESSAGE } from "@/lib/emailFormat";

import Button from "../Button";
import AuthModal from "../auth/AuthModal";
import FloatingInput from "../inputs/FloatingInput";

function LoginModal() {
  const router = useRouter();
  const loginModal = useLoginModal();
  const registerModal = useRegisterModal();
  const forgotModal = useForgotPasswordModal();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FieldValues>({
    defaultValues: { email: "", password: "" },
  });

  const handleClose = useCallback(() => {
    reset();
    loginModal.onClose();
  }, [loginModal, reset]);

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    setIsLoading(true);
    signIn("credentials", { ...data, redirect: false }).then((callback) => {
      setIsLoading(false);
      if (callback?.ok) {
        toast.success("Logged in successfully.");
        router.refresh();
        handleClose();
      } else if (callback?.error) {
        toast.error(
          callback.error.includes(TOO_MANY_ATTEMPTS_ERROR)
            ? TOO_MANY_REQUESTS_MESSAGE
            : "Invalid email or password."
        );
      }
    });
  };

  const toRegister = useCallback(() => {
    handleClose();
    registerModal.onOpen();
  }, [handleClose, registerModal]);

  const toForgot = useCallback(() => {
    handleClose();
    forgotModal.onOpen();
  }, [handleClose, forgotModal]);

  return (
    <AuthModal isOpen={loginModal.isOpen} onClose={handleClose} disabled={isLoading}>
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand">
        Sign in
      </div>
      <h2 className="font-display mt-3 text-[34px] leading-[1.16] text-brand">Welcome back</h2>
      <p className="mt-1.5 text-[15px] text-brand-muted">Log in to your Hifivebot account.</p>

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
        <FloatingInput id="password" label="Password" type="password" required disabled={isLoading} register={register} errors={errors} />
        <div className="-mt-0.5 text-right">
          <span onClick={toForgot} className="cursor-pointer text-[14px] font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
            Forgot password?
          </span>
        </div>
        <Button label="Log in" disabled={isLoading} onClick={handleSubmit(onSubmit)} />
        <p className="text-center text-[14px] text-brand-muted">
          New to Hifivebot?{" "}
          <span onClick={toRegister} className="cursor-pointer font-extrabold text-brand underline decoration-brand-subtle underline-offset-[3px]">
            Create an account
          </span>
        </p>
      </div>
    </AuthModal>
  );
}

export default LoginModal;
