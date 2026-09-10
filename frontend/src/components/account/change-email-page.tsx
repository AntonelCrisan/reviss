"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthApiError, requestEmailChange } from "@/lib/auth-api";
import { toast } from "@/lib/toast-store";

const inputClassName =
  "h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted/70 focus:border-action focus:ring-4 focus:ring-action-soft";

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m6-6-6 6 6 6" />
    </svg>
  );
}

function ArrowRightIcon() {
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
      {crossed ? <path strokeLinecap="round" d="m4 4 16 16" /> : null}
    </svg>
  );
}

function PasswordField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("settings.password");
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label className="block min-w-0">
      <span className="sr-only">{t("current")}</span>
      <span className="relative block">
        <input
          id={id}
          name={id}
          type={isVisible ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={128}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("current")}
          className={`${inputClassName} pr-12`}
        />
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute bottom-0 right-0 flex h-12 w-12 items-center justify-center text-muted transition hover:text-content"
          aria-label={isVisible ? t("hide") : t("show")}
        >
          <EyeIcon crossed={isVisible} />
        </button>
      </span>
    </label>
  );
}

export function ChangeEmailPage() {
  const t = useTranslations("settings.changeEmail");
  const tSecurity = useTranslations("settings.security");
  const tPassword = useTranslations("settings.password");
  const { user } = useAuth();
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitLockRef = useRef(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success"
  >("idle");
  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";

  function resetForAnotherRequest() {
    setCurrentPassword("");
    setSubmitState("idle");
    submitLockRef.current = false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current) return;

    if (user && newEmail.trim().toLowerCase() === user.email.toLowerCase()) {
      setSubmitState("idle");
      toast.error(t("sameAsCurrent"));
      return;
    }

    if (!currentPassword) {
      setSubmitState("idle");
      toast.error(tPassword("enterCurrent"));
      return;
    }

    submitLockRef.current = true;
    setSubmitState("submitting");
    let didSucceed = false;

    try {
      const result = await requestEmailChange({
        new_email: newEmail.trim(),
        current_password: currentPassword,
      });
      setCurrentPassword("");
      didSucceed = true;
      setSubmitState("success");
      toast.success(result.message);
    } catch (error) {
      setSubmitState("idle");
      toast.error(
        error instanceof AuthApiError ? error.message : t("requestFailed"),
      );
    } finally {
      submitLockRef.current = false;
      if (!didSucceed) {
        setSubmitState("idle");
      }
    }
  }

  return (
    <AccountStaticShell activePage="settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-10 flex flex-col items-start gap-4">
              <Link
                href="/settings#security"
                className="inline-flex w-fit items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
              >
                <ArrowLeftIcon />
                {tSecurity("tabLabel")}
              </Link>
              <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                {t("eyebrow")}
              </p>
            </div>
            <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {t("description", { email: user?.email ?? t("unknownEmail") })}
            </p>
          </div>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="max-w-3xl overflow-hidden rounded-xl border border-subtle bg-surface"
          noValidate
        >
          <div className="grid gap-5 border-b border-subtle p-5 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                {t("newAddress")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {t("newAddressHint")}
              </p>
            </div>
            <label className="block min-w-0">
              <span className="sr-only">{t("newAddressLabel")}</span>
              <input
                id="newEmail"
                name="newEmail"
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder={t("placeholder")}
                className={inputClassName}
              />
            </label>
          </div>

          <div className="grid gap-5 border-b border-subtle p-5 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                {tPassword("current")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {tPassword("currentHint")}
              </p>
            </div>
            <PasswordField
              id="currentPassword"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
          </div>

          <div className="flex flex-col-reverse gap-3 p-5 sm:flex-row sm:justify-end">
            <Link
              href="/settings#security"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-subtle bg-app px-5 py-3 text-sm font-bold text-content transition hover:bg-surface-hover"
            >
              {isSuccess ? tSecurity("backToSecurity") : tSecurity("cancel")}
            </Link>
            {isSuccess ? (
              <button
                key="change-email-success-action"
                type="button"
                onClick={resetForAnotherRequest}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover"
              >
                {t("sendAgain")}
                <ArrowRightIcon />
              </button>
            ) : (
              <button
                key="change-email-submit-action"
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? t("sending") : t("send")}
                <ArrowRightIcon />
              </button>
            )}
          </div>
        </form>
      </section>
    </AccountStaticShell>
  );
}
