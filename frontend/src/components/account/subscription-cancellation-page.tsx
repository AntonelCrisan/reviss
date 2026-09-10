"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { toast } from "@/lib/toast-store";

type CancellationState =
  | { status: "idle"; message: null; activeUntil: string }
  | { status: "success"; message: string; activeUntil: string }
  | { status: "error"; message: string; activeUntil: string };

async function requestCancellation(fallbackError: string) {
  const response = await fetch("/api/compliance/subscription-cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reviss-Form-Intent": "subscription-cancel",
    },
    body: JSON.stringify({
      plan_name: "Focus",
      renewal_date: "2026-07-24",
      price: "29 RON",
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    active_until?: string;
  };

  if (!response.ok) {
    throw new Error(body.detail || fallbackError);
  }

  return body;
}

export function SubscriptionCancellationPage() {
  const t = useTranslations("cancellation");
  const activeUntil = t("t24Iulie2026");
  const [state, setState] = useState<CancellationState>({
    status: "idle",
    message: null,
    activeUntil,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCancelRenewal() {
    setIsSubmitting(true);
    setState({ status: "idle", message: null, activeUntil });
    try {
      const response = await requestCancellation(t("anulareaNuAPututFi"));
      const successMessage =
        response.message ||
        t("reinnoireaAutomataAFostOprita");
      setState({
        status: "success",
        message: successMessage,
        activeUntil: response.active_until || activeUntil,
      });
      toast.success(successMessage);
    } catch (error) {
      const failureMessage =
        error instanceof Error
          ? error.message
          : t("anulareaNuAPututFi");
      setState({ status: "error", message: failureMessage, activeUntil });
      toast.error(failureMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AccountStaticShell activePage="upgrade">
      <section className="space-y-5">
        <div className="rounded-[2rem] border border-subtle bg-surface p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            {t("abonament")}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">
            {t("anulareAbonament")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            {t("potiOpriReinnoireaAutomataDirect")}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <section className="rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
            <div className="divide-y divide-subtle border-y border-subtle">
              <SubscriptionDetail label={t("planActiv")} value="Focus" />
              <SubscriptionDetail label={t("pret")} value={t("t29RonLuna")} />
              <SubscriptionDetail
                label={t("urmatoareaDataDeFacturare")}
                value={t("t24Iulie2026")}
              />
              <SubscriptionDetail
                label={t("reinnoireAutomata")}
                value={state.status === "success" ? t("oprita") : t("activa")}
              />
            </div>

            <div className="mt-5 rounded-2xl border border-info-border bg-info-soft p-4 text-sm leading-6 text-info">
              {t("dacaOprestiReinnoireaAccesulRamane")}{" "}
              <strong>{state.activeUntil}</strong>{t("dupaAceastaDataPlanulRevine")}
            </div>

            <button
              type="button"
              onClick={handleCancelRenewal}
              disabled={isSubmitting || state.status === "success"}
              className="mt-5 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? t("seProceseaza")
                : state.status === "success"
                  ? t("reinnoireAutomataOprita")
                  : t("opresteReinnoireaAutomata")}
            </button>
          </section>

          <aside className="h-fit rounded-[2rem] border border-subtle bg-surface p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
              {t("ceSeIntamplaDupaAnulare")}
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
              <li>{t("nuVeiMaiFiTaxat")}</li>
              <li>{t("materialeleSiProgresulRamanIn")}</li>
              <li>{t("potiReactivaUnPlanOricand")}</li>
            </ul>
          </aside>
        </div>
      </section>
    </AccountStaticShell>
  );
}

function SubscriptionDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="font-serif text-2xl font-semibold sm:text-right">
        {value}
      </p>
    </div>
  );
}
