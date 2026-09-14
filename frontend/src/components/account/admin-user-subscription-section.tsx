"use client";

import { useState } from "react";
import {
  cancelAdminUserSubscription,
  grantAdminUserManualPlan,
  resumeAdminUserSubscription,
  resyncAdminUserSubscription,
  revokeAdminUserManualPlan,
  type AdminUserSubscription,
} from "@/lib/admin-users-api";
import { toast } from "@/lib/toast-store";

type PlanOption = {
  slug: string;
  name: string;
};

type AdminUserSubscriptionSectionProps = {
  userId: string;
  userEmail: string;
  subscription: AdminUserSubscription;
  plans: PlanOption[];
  onSubscriptionChange: (subscription: AdminUserSubscription) => void;
};

const MIN_REASON_LENGTH = 10;

const STATUS_LABELS: Record<string, string> = {
  active: "Activ",
  trialing: "Perioadă de probă",
  past_due: "Plată întârziată",
  unpaid: "Neplătit",
  canceled: "Anulat",
  incomplete: "Incomplet",
  incomplete_expired: "Incomplet, expirat",
  paused: "Suspendat",
};

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function statusTone(status: string | null, cancelAtPeriodEnd: boolean) {
  if (status === "active" || status === "trialing") {
    return cancelAtPeriodEnd
      ? "border-warning-border bg-warning-soft text-warning"
      : "border-success-border bg-success-soft text-success";
  }
  if (status === "past_due" || status === "unpaid") {
    return "border-danger-border bg-danger-soft text-danger";
  }
  return "border-subtle bg-app text-muted";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-[13rem_1fr] sm:gap-5">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-semibold text-content">{value}</dd>
    </div>
  );
}

export function AdminUserSubscriptionSection({
  userId,
  userEmail,
  subscription,
  plans,
  onSubscriptionChange,
}: AdminUserSubscriptionSectionProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);

  const isBusy = pendingAction !== null;
  const hasStripeSubscription = subscription.stripe_subscription_id !== null;
  const manualGrant = subscription.manual_grant;

  async function run(
    action: string,
    request: () => Promise<{
      subscription: AdminUserSubscription;
      message: string;
    }>,
  ) {
    if (isBusy) return;

    setPendingAction(action);

    try {
      const result = await request();
      onSubscriptionChange(result.subscription);
      toast.success(result.message);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Acțiunea nu a putut fi finalizată.",
      );
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="rounded-xl border border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
          Abonament
        </h2>
        <span
          className={`rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(
            subscription.status,
            subscription.cancel_at_period_end,
          )}`}
        >
          {subscription.status
            ? (STATUS_LABELS[subscription.status] ?? subscription.status)
            : "Fără abonament Stripe"}
        </span>
      </div>

      {manualGrant ? (
        <div className="mt-4 rounded-xl border border-info-border bg-info-soft p-4 text-info">
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">
            Plan acordat manual
          </p>
          <p className="mt-2 text-sm font-bold">
            {manualGrant.plan_name} — acordat de{" "}
            {manualGrant.granted_by_email ?? "un administrator șters"} pe{" "}
            {formatDate(manualGrant.created_at)}
          </p>
          <p className="mt-1 text-sm leading-6 opacity-90">
            Motiv: {manualGrant.reason}
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void run("revoke", () =>
                revokeAdminUserManualPlan(userId, { reason: null }),
              );
            }}
            className="mt-4 rounded-md border border-info-border px-4 py-2 text-xs font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction === "revoke" ? "Se revocă..." : "Revocă planul manual"}
          </button>
        </div>
      ) : null}

      <dl className="mt-4 divide-y divide-subtle border-y border-subtle">
        <Row label="Plan curent" value={subscription.current_plan_name ?? "—"} />
        <Row
          label="Preț plan"
          value={
            subscription.current_plan_price_ron !== null
              ? `${subscription.current_plan_price_ron} RON`
              : "—"
          }
        />
        <Row
          label="Reînnoire"
          value={
            !hasStripeSubscription
              ? "—"
              : subscription.cancel_at_period_end
                ? "Oprită, accesul expiră la finalul perioadei"
                : "Activă"
          }
        />
        <Row
          label="Perioada curentă"
          value={
            subscription.current_period_start || subscription.current_period_end
              ? `${formatDate(subscription.current_period_start)} → ${formatDate(
                  subscription.current_period_end,
                )}`
              : "—"
          }
        />
        <Row
          label="Client Stripe"
          value={subscription.stripe_customer_id ?? "—"}
        />
        <Row
          label="Abonament Stripe"
          value={subscription.stripe_subscription_id ?? "—"}
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isBusy || !subscription.stripe_customer_id}
          onClick={() => {
            void run("resync", () => resyncAdminUserSubscription(userId));
          }}
          className="rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingAction === "resync"
            ? "Se sincronizează..."
            : "Resincronizează din Stripe"}
        </button>

        {hasStripeSubscription && subscription.cancel_at_period_end ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void run("resume", () => resumeAdminUserSubscription(userId));
            }}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction === "resume"
              ? "Se reactivează..."
              : "Reactivează reînnoirea"}
          </button>
        ) : null}

        {hasStripeSubscription && !subscription.cancel_at_period_end ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              void run("cancel", () => cancelAdminUserSubscription(userId));
            }}
            className="rounded-md border border-danger-border px-5 py-3 text-sm font-bold text-danger transition hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
          >
            {pendingAction === "cancel"
              ? "Se anulează..."
              : "Oprește reînnoirea"}
          </button>
        ) : null}

        {manualGrant === null ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setIsGrantModalOpen(true)}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Acordă plan manual
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-muted">
        Resincronizarea citește abonamentele reale din Stripe și le aplică aici.
        Este soluția pentru o plată reușită căreia nu i s-a aplicat planul.
        Oprirea reînnoirii păstrează accesul până la finalul perioadei plătite.
      </p>

      {isGrantModalOpen ? (
        <GrantManualPlanModal
          userEmail={userEmail}
          plans={plans}
          isSaving={pendingAction === "grant"}
          onCancel={() => setIsGrantModalOpen(false)}
          onConfirm={async (planSlug, reason) => {
            const succeeded = await run("grant", () =>
              grantAdminUserManualPlan(userId, {
                plan_slug: planSlug,
                reason,
              }),
            );
            if (succeeded) setIsGrantModalOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function GrantManualPlanModal({
  userEmail,
  plans,
  isSaving,
  onCancel,
  onConfirm,
}: {
  userEmail: string;
  plans: PlanOption[];
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (planSlug: string, reason: string) => void;
}) {
  const [planSlug, setPlanSlug] = useState(plans[0]?.slug ?? "");
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();
  const canSubmit =
    planSlug !== "" && trimmedReason.length >= MIN_REASON_LENGTH && !isSaving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-manual-plan-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
          Plan manual
        </p>
        <h2
          id="grant-manual-plan-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          Acorzi un plan fără plată?
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {userEmail} va primi planul ales fără abonament Stripe. Planul rămâne
          activ până când îl revocă un administrator.
        </p>

        <label className="mt-5 block">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
            Plan
          </span>
          <select
            value={planSlug}
            onChange={(event) => setPlanSlug(event.target.value)}
            disabled={isSaving}
            className="mt-2 w-full rounded-md border border-subtle bg-app px-4 py-3 text-sm font-semibold text-content disabled:opacity-60"
          >
            {plans.map((plan) => (
              <option key={plan.slug} value={plan.slug}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
            Motiv (obligatoriu)
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSaving}
            rows={3}
            placeholder="De ce primește acest plan fără plată?"
            className="mt-2 w-full rounded-md border border-subtle bg-app px-4 py-3 text-sm leading-6 text-content disabled:opacity-60"
          />
        </label>
        <p className="mt-2 text-xs text-muted">
          Motivul ajunge în jurnalul de audit. Minim {MIN_REASON_LENGTH}{" "}
          caractere.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={() => onConfirm(planSlug, trimmedReason)}
            disabled={!canSubmit}
            className="rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Se acordă..." : "Acordă planul"}
          </button>
        </div>
      </div>
    </div>
  );
}
