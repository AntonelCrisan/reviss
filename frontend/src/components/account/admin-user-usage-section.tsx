"use client";

import { useEffect, useState } from "react";
import {
  getAdminUserUsage,
  resetAdminUserUsage,
  type AdminUserUsage,
  type AdminUserUsageEntry,
} from "@/lib/admin-users-api";
import { toast } from "@/lib/toast-store";

type AdminUserUsageSectionProps = {
  userId: string;
  /** Bumped by the parent after a plan change, to re-read the new limits. */
  refreshToken: number;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function UsageBar({ label, entry }: { label: string; entry: AdminUserUsageEntry }) {
  const limit = Math.max(entry.limit, 0);
  const used = Math.max(entry.used, 0);
  // A zero limit means the plan does not include this at all, which is not
  // the same as an allowance nobody has touched yet.
  const isUnavailable = limit === 0;
  const ratio = isUnavailable ? 0 : used / limit;
  const isExhausted = !isUnavailable && ratio >= 1;
  // Amber before the wall, red at it: support should see a user about to be
  // blocked, not only one already blocked.
  const tone = isExhausted
    ? "bg-danger"
    : ratio >= 0.8
      ? "bg-warning"
      : "bg-action";
  // Keep a visible sliver once there is real usage, but never paint one for
  // zero -- an empty allowance has to read as empty.
  const percent =
    used === 0 ? 0 : Math.min(Math.max(Math.round(ratio * 100), 2), 100);

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-content">{label}</span>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-bold ${
            isExhausted ? "bg-danger-soft text-danger" : "bg-app text-muted"
          }`}
        >
          {isUnavailable ? "Inclus în alt plan" : `${used} / ${limit}`}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-subtle bg-app p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl font-semibold text-content">
        {value}
      </p>
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-[13rem_1fr] sm:gap-5">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="font-semibold text-content">{value}</dd>
    </div>
  );
}

export function AdminUserUsageSection({
  userId,
  refreshToken,
}: AdminUserUsageSectionProps) {
  const [usage, setUsage] = useState<AdminUserUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // A refresh keeps the previous numbers on screen until the new ones
    // arrive, so a plan change does not blank the panel out.
    getAdminUserUsage(userId)
      .then((result) => {
        if (!isMounted) return;
        setUsage(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!isMounted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Utilizarea nu a putut fi încărcată.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId, refreshToken]);

  return (
    <section className="rounded-xl border border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
          Proiecte și limite
        </h2>
        {usage ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-md border border-subtle bg-app px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted">
              Ciclu până la {formatDate(usage.cycle_reset_at)}
            </span>
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              disabled={isResetting}
              className="rounded-md border border-subtle px-4 py-2 text-xs font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
            >
              {isResetting ? "Se resetează..." : "Resetează limitele"}
            </button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted">Se încarcă utilizarea...</p>
      ) : error ? (
        <p className="mt-4 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : usage ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <CountTile label="Proiecte total" value={usage.projects.total} />
            <CountTile label="Active" value={usage.projects.active} />
            <CountTile
              label="Dezactivate"
              value={usage.projects.deactivated}
            />
            <CountTile label="Arhivate" value={usage.projects.archived} />
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
            Consum în ciclul curent
          </p>
          <div className="mt-1 divide-y divide-subtle border-y border-subtle">
            <UsageBar
              label="Proiecte create"
              entry={usage.monthly_projects}
            />
            <UsageBar label="Materiale" entry={usage.monthly_materials} />
            <UsageBar label="Pagini procesate" entry={usage.monthly_pages} />
            <UsageBar label="Credite AI" entry={usage.ai_credits} />
            <UsageBar label="Pagini OCR" entry={usage.ocr_pages} />
          </div>

          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
            Limite fixe ale planului {usage.plan_name ?? ""}
          </p>
          <dl className="mt-1 divide-y divide-subtle border-y border-subtle">
            <LimitRow
              label="Sloturi active"
              value={`${usage.active_project_slots} proiecte`}
            />
            <LimitRow
              label="Fișiere pe proiect"
              value={`${usage.files_per_project_limit}`}
            />
            <LimitRow
              label="Mărime fișier"
              value={`${usage.file_size_limit_mb} MB`}
            />
            <LimitRow
              label="Mărime proiect"
              value={`${usage.project_size_limit_mb} MB`}
            />
            <LimitRow
              label="Quiz-uri pe proiect"
              value={`${usage.quizzes_per_project_limit}`}
            />
            <LimitRow
              label="Documente scanate"
              value={usage.allow_scanned_documents ? "Permise" : "Blocate"}
            />
          </dl>
        </>
      ) : null}

      {isResetModalOpen && usage ? (
        <ResetUsageModal
          isResetting={isResetting}
          cycleEndLabel={formatDate(usage.cycle_reset_at)}
          onCancel={() => setIsResetModalOpen(false)}
          onConfirm={() => {
            if (isResetting) return;
            setIsResetting(true);

            resetAdminUserUsage(userId)
              .then((result) => {
                setUsage(result);
                setIsResetModalOpen(false);
                toast.success("Limitele contului au fost resetate.");
              })
              .catch((cause: unknown) => {
                toast.error(
                  cause instanceof Error
                    ? cause.message
                    : "Limitele nu au putut fi resetate.",
                );
              })
              .finally(() => setIsResetting(false));
          }}
        />
      ) : null}
    </section>
  );
}

function ResetUsageModal({
  isResetting,
  cycleEndLabel,
  onCancel,
  onConfirm,
}: {
  isResetting: boolean;
  cycleEndLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-usage-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
          Resetare limite
        </p>
        <h2
          id="reset-usage-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          Sigur resetezi limitele acestui cont?
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Contul primește din nou întreaga alocare a planului: proiecte,
          materiale, pagini procesate, credite AI și pagini OCR. Nimic nu se
          șterge — proiectele și facturile rămân neatinse.
        </p>
        <div className="mt-5 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-sm leading-6 text-info">
          Ciclul curent se încheie tot pe {cycleEndLabel}. La reînnoire, contul
          intră normal în ciclul următor.
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isResetting}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isResetting}
            className="rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            {isResetting ? "Se resetează..." : "Da, resetează"}
          </button>
        </div>
      </div>
    </div>
  );
}
