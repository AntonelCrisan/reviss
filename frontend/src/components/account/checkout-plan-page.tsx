"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { createCheckoutSession, PaymentsApiError } from "@/lib/payments-api";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
import { toast } from "@/lib/toast-store";

type CheckoutPlanPageProps = {
  plan: SubscriptionPlanPublic;
};

type CheckoutTranslator = ReturnType<typeof useTranslations<"checkout">>;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
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

function billingPeriod(t: CheckoutTranslator, interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun")) return t("lunar");
  if (normalized.includes("an")) return t("anual");
  return interval;
}

function paymentFrequency(t: CheckoutTranslator, interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun")) return t("lunarReinnoireAutomata");
  if (normalized.includes("an")) return t("anualReinnoireAutomata");
  return t("intervalReinnoireAutomata", { interval });
}

function uniqueFeatures(plan: SubscriptionPlanPublic) {
  const sortedFeatures = [...plan.features].sort(
    (first, second) => first.sort_order - second.sort_order,
  );
  const seen = new Set<string>();

  return [
    plan.material_limit,
    ...sortedFeatures.map((feature) => feature.label),
  ].filter((feature) => {
    const normalized = feature.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function paymentErrorMessage(t: CheckoutTranslator, error: unknown) {
  if (error instanceof PaymentsApiError) {
    if (error.status === 401) {
      return t("trebuieSaFiiAutentificatCa");
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return t("plataNuAPututFi");
}

export function CheckoutPlanPage({ plan }: CheckoutPlanPageProps) {
  const t = useTranslations("checkout");
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const price = formatPlanPrice(plan.price_ron);
  const isFree = Number(plan.price_ron) === 0;
  const hasStripePrice = plan.is_purchasable;
  const canStartPayment = !isFree && hasStripePrice && !isStartingPayment;
  const features = uniqueFeatures(plan).slice(0, 6);
  const period = billingPeriod(t, plan.billing_interval);

  async function startPayment() {
    if (!canStartPayment) return;
    setIsStartingPayment(true);

    try {
      const checkoutSession = await createCheckoutSession(plan.slug);
      window.location.assign(checkoutSession.checkout_url);
    } catch (error) {
      toast.error(paymentErrorMessage(t, error));
      setIsStartingPayment(false);
    }
  }

  return (
    <AccountStaticShell activePage="upgrade">
      <div className="grid gap-6 lg:grid-cols-[1fr_23rem] lg:items-start">
        <section>
          <Link
            href="/upgrade"
            className="inline-flex items-center gap-2 text-sm font-bold text-muted transition hover:text-content"
          >
            <span aria-hidden="true">←</span>
            {t("inapoiLaAbonamente")}
          </Link>

          <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-warning">
            {t("confirmareAbonament")}
          </p>
          <h1 className="mt-2 max-w-3xl font-serif text-2xl font-semibold leading-tight sm:text-3xl">
            {t("verificaPlanulInainteDePlata")}
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted">
            {t("planulAlesPretulSiBeneficiile")}
          </p>

          <div className="mt-6 rounded-md border border-subtle bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {plan.discount_label ? (
                  <span className="rounded-md bg-warning-soft px-3 py-1 text-[10px] font-black uppercase text-warning">
                    {plan.discount_label}
                  </span>
                ) : null}
                <h2 className="mt-2 font-serif text-2xl font-semibold">
                  {plan.name}
                </h2>
                <p className="mt-1 max-w-xl text-[13px] leading-6 text-muted">
                  {plan.description}
                </p>
              </div>

              <p className="text-right">
                <span className="block font-serif text-4xl font-semibold leading-none">
                  {price}
                </span>
                <span className="text-xs text-muted">
                  {isFree ? "RON" : t("ronLuna")}
                </span>
              </p>
            </div>

            <div className="my-5 h-px bg-subtle" />

            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <span className="mt-0.5 text-success">
                    <CheckIcon />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="rounded-md border border-subtle bg-surface p-5 shadow-lg shadow-black/10 lg:sticky lg:top-6">
          <h2 className="text-base font-black">{t("sumarPlata")}</h2>

          <dl className="mt-4 space-y-0 text-sm">
            {[
              [t("planSelectat"), `${plan.name} (${period})`],
              [t("monedaPlata"), "RON"],
              [t("tvaInclus"), t("daDacaEsteAplicabil")],
              [t("frecventaPlata"), paymentFrequency(t, plan.billing_interval)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-subtle py-3"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right text-xs font-black">{value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-4">
              <dt className="font-black">{t("pretTotal")}</dt>
              <dd className="text-lg font-black">{price} RON</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-subtle pt-4 text-xs leading-6 text-muted">
            <p className="font-black text-content">{t("ceUrmeaza")}</p>
            <p className="mt-2">
              {t("dupaPlataPlanulDevineActiv")}
            </p>
            {plan.conditions ? (
              <p className="mt-4 border-t border-subtle pt-4">
                {plan.conditions}
              </p>
            ) : null}
          </div>

          {!hasStripePrice && !isFree ? (
            <p className="mt-4 rounded-2xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-bold text-warning">
              {t("planulNuAreIncaUn")}
            </p>
          ) : null}

          {isFree ? (
            <Link
              href="/myaccount"
              className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-content px-5 py-3 text-sm font-black text-app transition hover:opacity-90"
            >
              {t("continuaInCont")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={startPayment}
              disabled={!canStartPayment}
              className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-content px-5 py-3 text-sm font-black text-app transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isStartingPayment
                ? t("sePregatesteCheckoutUl")
                : t("continuaCatrePlataSecurizata")}
            </button>
          )}

          <p className="mt-5 text-center text-[10px] leading-5 text-muted">
            {t("prinApasareaButonuluiEstiDe")}{" "}
            <Link href="/termeni-si-conditii" className="underline">
              {t("termeniiSiConditiile")}
            </Link>
            {t("informatiiDespreRetragereSuntIn")}
          </p>
        </aside>
      </div>
    </AccountStaticShell>
  );
}
