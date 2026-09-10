"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { useAuth } from "@/components/auth/auth-provider";
import {
  cancelCurrentSubscription,
  getCurrentSubscription,
  PaymentsApiError,
  resumeCurrentSubscription,
  syncCheckoutSession,
  type CurrentSubscription,
} from "@/lib/payments-api";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
import { planDetailPath } from "@/lib/seo";
import { toast } from "@/lib/toast-store";
import { UpgradePageSkeletonBody } from "@/components/account/account-page-skeletons";

type UpgradePageProps = {
  plans: SubscriptionPlanPublic[];
  checkoutSessionId?: string;
  checkoutStatus?: string;
};

type UpgradePlan = {
  slug: string;
  name: string;
  title: string;
  price: string;
  oldPrice: string;
  note: string;
  description: string;
  discount: string;
  paid: boolean;
  highlighted: boolean;
  features: string[];
};

type UpgradeTranslator = ReturnType<typeof useTranslations<"upgrade">>;
type UpgradeKey = Parameters<UpgradeTranslator>[0];

const CHECKOUT_SYNC_ATTEMPTS = 12;
const CHECKOUT_SYNC_INTERVAL_MS = 1500;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

function formatPlanPrice(value: SubscriptionPlanPublic["price_ron"]) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(".", ",");
}

function billingSuffix(t: UpgradeTranslator, interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun")) return t("ronLuna");
  if (normalized.includes("an")) return t("ronAn");
  return `RON / ${interval}`;
}

const PLAN_TITLE_KEYS: Record<string, UpgradeKey> = {
  start: "pentruInceput",
  focus: "studiuActiv",
  pro: "sesiunePro",
};

function planTitle(t: UpgradeTranslator, plan: SubscriptionPlanPublic) {
  if (Number(plan.price_ron) === 0) return t("pentruInceput");
  const titleKey = PLAN_TITLE_KEYS[plan.slug];
  return titleKey ? t(titleKey) : plan.name;
}

function uniqueFeatures(features: string[]) {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const normalized = feature.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function toUpgradePlans(
  t: UpgradeTranslator,
  plans: SubscriptionPlanPublic[],
): UpgradePlan[] {
  return [...plans]
    .filter((plan) => plan.is_visible)
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((plan) => {
      const isFree = Number(plan.price_ron) === 0;
      const sortedFeatures = [...plan.features].sort(
        (first, second) => first.sort_order - second.sort_order,
      );

      return {
        slug: plan.slug,
        name: plan.name,
        title: planTitle(t, plan),
        price: formatPlanPrice(plan.price_ron),
        oldPrice: plan.old_price_ron ? formatPlanPrice(plan.old_price_ron) : "",
        note: isFree ? t("ronPermanent") : billingSuffix(t, plan.billing_interval),
        description: plan.description,
        discount: plan.discount_label ?? "",
        paid: !isFree,
        highlighted: plan.is_featured,
        features: uniqueFeatures([
          plan.material_limit,
          ...sortedFeatures.map((feature) => feature.label),
        ]).slice(0, 6),
      };
    });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatSubscriptionDate(
  t: UpgradeTranslator,
  locale: string,
  value?: string | null,
) {
  if (!value) return t("finalulPerioadeiPlatite");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("finalulPerioadeiPlatite");

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days from today until `value`; null when unknown or already past.
 *
 * Compared per calendar day rather than per 24h block so the wording always
 * agrees with the date printed next to it -- a renewal three hours from now
 * reads "astăzi", not "mâine". Returns null for a period_end in the past,
 * which happens while a Stripe renewal webhook is still in flight.
 */
function daysUntil(value?: string | null) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round(
    (startOfLocalDay(target) - startOfLocalDay(new Date())) / millisecondsPerDay,
  );
  return days >= 0 ? days : null;
}

function renewalCountdownLabel(t: UpgradeTranslator, days: number | null) {
  if (days === null) return "";
  if (days === 0) return t("astazi");
  if (days === 1) return t("maine");
  return t("nZile", { days });
}

function subscriptionActionError(t: UpgradeTranslator, error: unknown) {
  if (error instanceof PaymentsApiError) return error.message;
  if (error instanceof Error) return error.message;
  return t("abonamentulNuAPututFi");
}

export function UpgradePage({
  plans,
  checkoutSessionId,
  checkoutStatus,
}: UpgradePageProps) {
  const t = useTranslations("upgrade");
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading, setUser } = useAuth();
  const syncedCheckoutSessionRef = useRef<string | null>(null);
  const [currentSubscription, setCurrentSubscription] =
    useState<CurrentSubscription | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isUpdatingSubscription, setIsUpdatingSubscription] = useState(false);
  const currentUserId = user?.id ?? null;
  const userPlanSlug = user?.current_plan?.slug ?? "start";
  const userPlanIsPaid = Number(user?.current_plan?.price_ron ?? 0) > 0;
  const upgradePlans = toUpgradePlans(t, plans);
  const activeSubscription = currentSubscription;
  const currentPlanSlug = activeSubscription?.plan_slug ?? userPlanSlug;
  const currentPlanName =
    activeSubscription?.plan_name ?? user?.current_plan?.name ?? "Start";
  const currentPlanIsPaid = Boolean(activeSubscription) || userPlanIsPaid;
  const cancellationPending = Boolean(activeSubscription?.cancel_at_period_end);
  const accessUntilLabel = formatSubscriptionDate(
    t,
    locale,
    activeSubscription?.current_period_end,
  );
  const daysToRenewal = daysUntil(activeSubscription?.current_period_end);
  const renewalCountdown = renewalCountdownLabel(t, daysToRenewal);
  const hasPeriodEnd =
    Boolean(activeSubscription) &&
    currentPlanIsPaid &&
    Boolean(activeSubscription?.current_period_end);
  // Shown only while the plan keeps auto-renewing.
  const showRenewalInfo = hasPeriodEnd && !cancellationPending;
  // Always render the period end for a paid plan, whichever way it is heading:
  // a renewal charge, or the day access stops.
  const billingNotice = !hasPeriodEnd
    ? null
    : cancellationPending
      ? {
          tone: "warning" as const,
          title: t("abonamentulCurrentplannameExpiraPeAccess", { currentPlanName, accessUntilLabel }),
          detail:
            daysToRenewal !== null
              ? t("maiAiAccesRenewalcountdownDupa", { renewalCountdown })
              : t("dupaAceastaDataContulTrece"),
        }
      : {
          tone: "neutral" as const,
          title: t("abonamentulCurrentplannameSeReinnoiesteP", { currentPlanName, accessUntilLabel }),
          detail:
            daysToRenewal !== null
              ? t("urmatoareaPlataAreLocRenewalcountdown", { renewalCountdown })
              : t("potiOpriReinnoireaOricandPana"),
        };

  useEffect(() => {
    let isMounted = true;

    if (isLoading || !currentUserId) {
      return () => {
        isMounted = false;
      };
    }

    getCurrentSubscription()
      .then((response) => {
        if (!isMounted) return;
        setCurrentSubscription(response.subscription);
      })
      .catch(() => {
        if (!isMounted) return;
        setCurrentSubscription(null);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUserId, isLoading, userPlanSlug]);

  useEffect(() => {
    let isMounted = true;

    if (
      checkoutStatus !== "success" ||
      !checkoutSessionId ||
      isLoading ||
      !user ||
      syncedCheckoutSessionRef.current === checkoutSessionId
    ) {
      return () => {
        isMounted = false;
      };
    }

    const activeCheckoutSessionId = checkoutSessionId;

    async function syncCheckoutUntilConfirmed() {
      syncedCheckoutSessionRef.current = activeCheckoutSessionId;

      for (let attempt = 1; attempt <= CHECKOUT_SYNC_ATTEMPTS; attempt += 1) {
        try {
          const updatedUser = await syncCheckoutSession(activeCheckoutSessionId);
          if (!isMounted) return;

          setUser(updatedUser);
          const subscriptionStatus = await getCurrentSubscription();
          if (!isMounted) return;
          setCurrentSubscription(subscriptionStatus.subscription);
          router.refresh();
          return;
        } catch {
          if (!isMounted) return;

          if (attempt < CHECKOUT_SYNC_ATTEMPTS) {
            await wait(CHECKOUT_SYNC_INTERVAL_MS);
          }
        }
      }

      if (!isMounted) return;
      syncedCheckoutSessionRef.current = null;
    }

    void syncCheckoutUntilConfirmed();

    return () => {
      isMounted = false;
    };
  }, [checkoutSessionId, checkoutStatus, isLoading, router, setUser, user]);

  async function cancelRenewal() {
    if (!currentPlanIsPaid || isUpdatingSubscription) return;

    setIsUpdatingSubscription(true);

    try {
      const response = await cancelCurrentSubscription();
      setUser(response.user);
      setCurrentSubscription(response.subscription);
      toast.success(
        t("reinnoireaEsteAnulataAiAcces", { value: formatSubscriptionDate(
          t,
          locale,
          response.subscription?.current_period_end,
        ) }),
      );
      setIsCancelModalOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(subscriptionActionError(t, error));
    } finally {
      setIsUpdatingSubscription(false);
    }
  }

  async function resumeRenewal() {
    if (!currentPlanIsPaid || isUpdatingSubscription) return;

    setIsUpdatingSubscription(true);

    try {
      const response = await resumeCurrentSubscription();
      setUser(response.user);
      setCurrentSubscription(response.subscription);
      toast.success(t("reinnoireaAbonamentuluiEsteActivaDin"));
      router.refresh();
    } catch (error) {
      toast.error(subscriptionActionError(t, error));
    } finally {
      setIsUpdatingSubscription(false);
    }
  }

  return (
    <>
      <AccountStaticShell activePage="upgrade"
      loadingBody={<UpgradePageSkeletonBody />}>
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              {t("abonament")}
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {t("alegePlanulPotrivit")}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              {t("planuriSimpleTransparenteCuReinnoire")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-content">
                {currentPlanName}
              </span>
              {t("activ")}
            </span>
            {cancellationPending ? (
              <span className="inline-flex items-center rounded-md border border-warning-border bg-warning-soft px-4 py-2 text-xs font-bold text-warning">
                {t("seOpresteLa")} {accessUntilLabel}
              </span>
            ) : null}
            {showRenewalInfo ? (
              <span className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted">
                {t("seReinnoieste")}
                <span className="text-content">{accessUntilLabel}</span>
              </span>
            ) : null}
            <Link
              href="/upgrade/facturi"
              className="inline-flex cursor-pointer items-center rounded-md border border-subtle bg-surface px-4 py-2 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              {t("facturi")}
            </Link>
          </div>
        </div>

        {billingNotice ? (
          <div
            className={`flex flex-col gap-1 rounded-md border px-5 py-4 ${
              billingNotice.tone === "warning"
                ? "border-warning-border bg-warning-soft text-warning"
                : "border-subtle bg-surface text-content"
            }`}
          >
            <p className="text-sm font-black">{billingNotice.title}</p>
            <p
              className={`text-xs leading-6 ${
                billingNotice.tone === "warning" ? "" : "text-muted"
              }`}
            >
              {billingNotice.detail}
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {upgradePlans.map((plan) => {
            const isCurrentPlan = plan.slug === currentPlanSlug;
            const listBorderClass = plan.highlighted
              ? "divide-on-action/15 border-on-action/15"
              : "divide-subtle border-subtle";

            return (
              <article
                key={plan.slug}
                className={`relative flex min-h-[25rem] flex-col rounded-xl border p-6 ${
                  plan.highlighted
                    ? "border-action bg-action text-on-action"
                    : "border-subtle bg-surface text-content"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`text-xs font-black uppercase tracking-[0.18em] ${
                      plan.highlighted ? "text-on-action/65" : "text-muted"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {isCurrentPlan ? (
                      <span
                        className={`rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                          plan.highlighted
                            ? "bg-on-action text-action"
                            : "bg-success-soft text-success"
                        }`}
                      >
                        {t("activ2")}
                      </span>
                    ) : null}
                    {plan.highlighted ? (
                      <span className="rounded-md bg-on-action px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-action">
                        {t("recomandat")}
                      </span>
                    ) : null}
                  </div>
                </div>

                <h2 className="mt-2 font-serif text-2xl font-semibold">
                  {plan.title}
                </h2>

                <p className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
                  <span className="font-serif text-5xl font-semibold leading-none">
                    {plan.price}
                  </span>
                  <span
                    className={`pb-1 text-sm font-medium ${
                      plan.highlighted ? "text-on-action/75" : "text-muted"
                    }`}
                  >
                    {plan.note}
                  </span>
                  {plan.oldPrice ? (
                    <span
                      className={`pb-1 text-xs font-bold line-through ${
                        plan.highlighted ? "text-on-action/45" : "text-muted"
                      }`}
                    >
                      {plan.oldPrice} RON
                    </span>
                  ) : null}
                </p>

                {plan.discount ? (
                  <p
                    className={`mt-3 w-fit rounded-md border px-3 py-1 text-[10px] font-black ${
                      plan.highlighted
                        ? "border-on-action/20 bg-on-action/10 text-on-action"
                        : "border-success-border bg-success-soft text-success"
                    }`}
                  >
                    {plan.discount}
                  </p>
                ) : null}

                <p
                  className={`mt-5 text-sm leading-6 ${
                    plan.highlighted ? "text-on-action/75" : "text-muted"
                  }`}
                >
                  {plan.description}
                </p>

                <ul
                  className={`mt-6 divide-y border-y text-sm ${listBorderClass}`}
                >
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 py-3">
                      <span
                        className={`mt-0.5 shrink-0 ${
                          plan.highlighted ? "text-on-action" : "text-success"
                        }`}
                      >
                        <CheckIcon />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto space-y-2 pt-8">
                  {isCurrentPlan ? (
                    <>
                      <button
                        type="button"
                        className={`w-full cursor-default rounded-md border px-5 py-3 text-sm font-black ${
                          plan.highlighted
                            ? "border-on-action/35 bg-on-action text-action"
                            : "border-subtle bg-surface-hover text-content"
                        }`}
                      >
                        {cancellationPending
                          ? t("activPanaLaAccessuntillabel", { accessUntilLabel })
                          : t("planActual")}
                      </button>
                      {plan.paid ? (
                        cancellationPending ? (
                          <button
                            type="button"
                            onClick={resumeRenewal}
                            disabled={isUpdatingSubscription}
                            className={`w-full cursor-pointer rounded-md border px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              plan.highlighted
                                ? "border-on-action/35 text-on-action hover:bg-on-action/10"
                                : "border-subtle text-content hover:bg-surface-hover"
                            }`}
                          >
                            {isUpdatingSubscription
                              ? t("seActualizeaza")
                              : t("reactiveazaReinnoirea")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsCancelModalOpen(true)}
                            disabled={isUpdatingSubscription}
                            className={`w-full cursor-pointer rounded-md border px-5 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                              plan.highlighted
                                ? "border-on-action/35 text-on-action hover:bg-on-action/10"
                                : "border-danger-border text-danger hover:bg-danger-soft"
                            }`}
                          >
                            {t("anuleazaReinnoirea")}
                          </button>
                        )
                      ) : null}
                    </>
                  ) : !plan.paid && currentPlanIsPaid ? (
                    cancellationPending ? (
                      <button
                        type="button"
                        disabled
                        className="w-full cursor-default rounded-md border border-subtle bg-surface-hover px-5 py-3 text-sm font-black text-muted"
                      >
                        {t("programatPe")} {accessUntilLabel}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsCancelModalOpen(true)}
                        disabled={isUpdatingSubscription}
                        className="w-full cursor-pointer rounded-md border border-subtle bg-surface px-5 py-3 text-sm font-black text-content transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t("trecePePlanulGratuit")}
                      </button>
                    )
                  ) : (
                    <Link
                      href={planDetailPath(plan.slug)}
                      className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-black transition ${
                        plan.highlighted
                          ? "bg-on-action text-action hover:bg-on-action/90"
                          : "bg-action text-on-action hover:bg-action-hover"
                      }`}
                    >
                      {t("veziDetaliilePlanului")}
                      <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      </AccountStaticShell>

      {isCancelModalOpen ? (
        <CancelRenewalModal
          planName={currentPlanName}
          accessUntilLabel={accessUntilLabel}
          isSubmitting={isUpdatingSubscription}
          onCancel={() => setIsCancelModalOpen(false)}
          onConfirm={cancelRenewal}
        />
      ) : null}
    </>
  );
}

function CancelRenewalModal({
  planName,
  accessUntilLabel,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  planName: string;
  accessUntilLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("upgrade");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-8">
      <section className="w-full max-w-xl rounded-xl border border-subtle bg-surface p-6 text-content shadow-2xl shadow-black/20">
        <p className="inline-flex rounded-md border border-danger-border bg-danger-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-danger">
          {t("anulareReinnoire")}
        </p>
        <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight">
          {t("oprestiPlataLunaraPentru")} {planName}?
        </h2>
        <p className="mt-4 text-sm leading-7 text-muted">
          {t("nuVeiMaiFiTaxat")} {accessUntilLabel}{t("apoiContulTreceAutomatPe")}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="cursor-pointer rounded-md border border-subtle px-5 py-3 text-sm font-black transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("renunta")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="cursor-pointer rounded-md bg-danger px-5 py-3 text-sm font-black text-on-action transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("seAnuleaza") : t("anuleazaReinnoirea")}
          </button>
        </div>
      </section>
    </div>
  );
}
