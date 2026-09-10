"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  AuthApiError,
  login,
  register,
  requestPasswordReset,
} from "@/lib/auth-api";
import { toast } from "@/lib/toast-store";

type AuthFormProps = {
  mode: "login" | "register" | "forgot-password";
  redirectTo?: string;
  initialError?: string;
};

type SuccessDialog = {
  eyebrow: string;
  title: string;
  message: string;
  helper: string;
};

const inputClassName =
  "mt-1.5 h-11 w-full rounded-xl border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted/65 focus:border-action focus:ring-4 focus:ring-action-soft";

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.75 12s3.25-5.25 9.25-5.25S21.25 12 21.25 12 18 17.25 12 17.25 2.75 12 2.75 12Z"
      />
      <circle cx="12" cy="12" r="2.25" />
      {crossed ? (
        <path strokeLinecap="round" d="m4 4 16 16" />
      ) : null}
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.26a12 12 0 0 0 0 10.8l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.6l4.01 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

function safeRedirectPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/myaccount";
  }

  if (value.startsWith("/api/")) {
    return "/myaccount";
  }

  return value;
}

const legalLinkClassName =
  "font-semibold underline decoration-subtle underline-offset-2";

export function AuthForm({ mode, redirectTo, initialError }: AuthFormProps) {
  const t = useTranslations("auth.form");
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const afterLoginPath = safeRedirectPath(redirectTo);
  const resetRequestLockRef = useRef(false);
  const isRegister = mode === "register";
  const isForgotPassword = mode === "forgot-password";

  useEffect(() => {
    if (!isForgotPassword && !isLoading && user) {
      router.replace(afterLoginPath);
    }
  }, [afterLoginPath, isForgotPassword, isLoading, router, user]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [successDialog, setSuccessDialog] = useState<SuccessDialog | null>(null);
  const [hasRequestedReset, setHasRequestedReset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // An error handed over by the page (a failed Google callback, an expired
  // link) arrives as a prop, so it is raised once the form is on screen.
  useEffect(() => {
    if (initialError) {
      toast.error(initialError);
    }
  }, [initialError]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (
      isRegister &&
      formData.get("password") !== formData.get("confirmPassword")
    ) {
      toast.error(t("errors.passwordsMismatch"));
      return;
    }

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setIsSubmitting(true);
    setSuccessDialog(null);

    try {
      if (isForgotPassword) {
        if (resetRequestLockRef.current || hasRequestedReset) {
          setSuccessDialog({
            eyebrow: t("dialog.reset.eyebrow"),
            title: t("dialog.reset.alreadyTitle"),
            message: t("dialog.reset.alreadyMessage"),
            helper: t("dialog.reset.alreadyHelper"),
          });
          return;
        }

        resetRequestLockRef.current = true;
        const result = await requestPasswordReset(email);
        setHasRequestedReset(true);
        setSuccessDialog({
          eyebrow: t("dialog.reset.eyebrow"),
          title: t("dialog.reset.title"),
          message: result.message,
          helper: t("dialog.reset.helper"),
        });
        return;
      }

      if (isRegister) {
        const result = await register({
            full_name: String(formData.get("name") ?? ""),
            email,
            password,
            accepted_terms: formData.get("terms") === "on",
            newsletter_consent: formData.get("newsletter") === "on",
          });
        form.reset();
        setSuccessDialog({
          eyebrow: t("dialog.register.eyebrow"),
          title: t("dialog.register.title"),
          message: result.message,
          helper: t("dialog.register.helper"),
        });
        return;
      }

      const user = await login({
        email,
        password,
        remember: formData.get("remember") === "on",
      });

      setUser(user);
      router.replace(afterLoginPath);
    } catch (error) {
      if (isForgotPassword && !hasRequestedReset) {
        resetRequestLockRef.current = false;
      }
      toast.error(
        error instanceof AuthApiError ? error.message : t("errors.unavailable"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitLabel = isSubmitting
    ? t("submit.processing")
    : isForgotPassword
      ? hasRequestedReset
        ? t("submit.forgotSent")
        : t("submit.forgot")
      : isRegister
        ? t("submit.register")
        : t("submit.login");

  return (
    <>
    {!isForgotPassword ? (
      <div className="mb-4 space-y-2.5">
        <a
          href={`/api/auth/google/authorize?next=${encodeURIComponent(afterLoginPath)}`}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border border-subtle bg-surface px-5 text-sm font-bold text-content transition hover:-translate-y-0.5 hover:bg-app"
        >
          <GoogleIcon />
          {t("continueWithGoogle")}
        </a>
        <p className="text-center text-[11px] leading-4 text-muted">
          {t.rich("consent", {
            terms: (chunks) => (
              <Link href="/termeni-si-conditii" className={legalLinkClassName}>
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link
                href="/politica-de-confidentialitate"
                className={legalLinkClassName}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-subtle" />
          <span className="text-xs font-semibold text-muted">{t("or")}</span>
          <span className="h-px flex-1 bg-subtle" />
        </div>
      </div>
    ) : null}
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {isRegister ? (
        <div>
          <label htmlFor="name" className="text-sm font-bold text-content">
            {t("fullName")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            placeholder={t("fullNamePlaceholder")}
            className={inputClassName}
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="text-sm font-bold text-content">
          {t("email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isForgotPassword && hasRequestedReset}
          placeholder={t("emailPlaceholder")}
          className={inputClassName}
        />
      </div>

      {!isForgotPassword ? (
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-bold text-content">
              {t("password")}
            </label>
            {!isRegister ? (
              <Link
                href="/forgot-password"
                className="text-xs font-bold text-muted transition hover:text-content"
              >
                {t("forgotPassword")}
              </Link>
            ) : null}
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 10 : 1}
              placeholder={
                isRegister
                  ? t("passwordPlaceholderRegister")
                  : t("passwordPlaceholderLogin")
              }
              className={`${inputClassName} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-muted transition hover:text-content"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            >
              <EyeIcon crossed={showPassword} />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-info-border bg-info-soft px-4 py-3 text-xs leading-5 text-info">
          {t("resetHint")}
        </div>
      )}

      {isRegister ? (
        <div>
          <label
            htmlFor="confirmPassword"
            className="text-sm font-bold text-content"
          >
            {t("confirmPassword")}
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmation ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={10}
              placeholder={t("confirmPasswordPlaceholder")}
              className={`${inputClassName} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmation((visible) => !visible)}
              className="absolute bottom-0 right-0 flex h-11 w-11 items-center justify-center text-muted transition hover:text-content"
              aria-label={
                showConfirmation ? t("hidePassword") : t("showPassword")
              }
            >
              <EyeIcon crossed={showConfirmation} />
            </button>
          </div>
        </div>
      ) : null}

      {!isForgotPassword && !isRegister ? (
        <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-muted">
          <input
            name="remember"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-subtle accent-action"
          />
          <span>{t("remember")}</span>
        </label>
      ) : null}

      {isRegister ? (
        <div className="space-y-2.5">
          <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-muted">
            <input
              name="terms"
              type="checkbox"
              required
              className="mt-0.5 h-4 w-4 rounded border-subtle accent-action"
            />
            <span>
              {t.rich("acceptTerms", {
                terms: (chunks) => (
                  <Link
                    href="/termeni-si-conditii"
                    className="font-bold text-content underline decoration-subtle underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </span>
          </label>

          <p className="rounded-xl border border-info-border bg-info-soft px-4 py-3 text-xs leading-5 text-info">
            {t.rich("privacyInfo", {
              privacy: (chunks) => (
                <Link
                  href="/politica-de-confidentialitate"
                  className="font-bold underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>

          <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-muted">
            <input
              name="newsletter"
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-subtle accent-action"
            />
            <span>{t("newsletter")}</span>
          </label>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || (isForgotPassword && hasRequestedReset)}
        className="theme-shadow-action flex h-11 w-full items-center justify-center gap-3 rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover disabled:cursor-wait disabled:opacity-65 disabled:hover:translate-y-0"
      >
        {submitLabel}
        <ArrowIcon />
      </button>
    </form>

    {successDialog ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-success-title"
          className="theme-shadow w-full max-w-md rounded-[1.75rem] border border-subtle bg-surface p-6 text-content"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success">
            <svg
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
            </svg>
          </div>

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted">
            {successDialog.eyebrow}
          </p>
          <h2
            id="auth-success-title"
            className="font-serif text-2xl font-semibold leading-tight"
          >
            {successDialog.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {successDialog.message}
          </p>
          <p className="mt-3 rounded-2xl border border-info-border bg-info-soft px-4 py-3 text-xs font-semibold leading-5 text-info">
            {successDialog.helper}
          </p>

          <button
            type="button"
            onClick={() => setSuccessDialog(null)}
            className="theme-shadow-action mt-5 flex h-11 w-full items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
          >
            {t("dialog.dismiss")}
          </button>
        </div>
      </div>
    ) : null}
    </>
  );
}
