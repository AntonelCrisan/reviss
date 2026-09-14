"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { Select } from "@/components/ui/select";
import {
  type AdminWithdrawalRequest,
  getAdminWithdrawalRequests,
} from "@/lib/admin-withdrawal-requests-api";
import { toast } from "@/lib/toast-store";

type AdminWithdrawalRequestsPageProps = {
  initialRequests: AdminWithdrawalRequest[];
};

const WITHDRAWAL_REQUESTS_PAGE_SIZE = 10;

const emailStatusLabels: Record<string, string> = {
  failed: "Email eșuat",
  queued: "În așteptare",
  sent: "Email trimis",
};

const emailStatusFilters = [
  { value: "", label: "Toate" },
  { value: "queued", label: "În așteptare" },
  { value: "sent", label: "Email trimis" },
  { value: "failed", label: "Email eșuat" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "Niciodată";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function compactPreview(value: string | null | undefined, maxLength = 160) {
  const compactValue = (value ?? "").replace(/\s+/g, " ").trim();
  if (!compactValue) return "-";
  if (compactValue.length <= maxLength) return compactValue;
  return `${compactValue.slice(0, maxLength)}...`;
}

function statusLabel(status: string) {
  return emailStatusLabels[status] ?? (status || "necunoscut");
}

function replyHref(request: AdminWithdrawalRequest) {
  const subject = encodeURIComponent(`Re: ${request.registration_number}`);
  const body = encodeURIComponent(
    `Bună, ${request.full_name}\n\nÎți răspundem la solicitarea de retragere ${request.registration_number}.\n\n`,
  );

  return `mailto:${request.email}?subject=${subject}&body=${body}`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
    </svg>
  );
}

function WithdrawalMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-subtle bg-surface p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-4 font-serif text-2xl font-semibold leading-tight text-content">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </article>
  );
}

export function AdminWithdrawalRequestsPage({
  initialRequests,
}: AdminWithdrawalRequestsPageProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latestRequest = requests[0] ?? null;
  const failedEmailCount = requests.filter(
    (request) => request.email_confirmation_status === "failed",
  ).length;

  const filteredRequests = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return requests.filter((request) => {
      const matchesStatus =
        !emailStatus || request.email_confirmation_status === emailStatus;
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(request.registration_number).includes(normalizedSearch) ||
        normalizeText(request.full_name).includes(normalizedSearch) ||
        normalizeText(request.email).includes(normalizedSearch) ||
        normalizeText(request.subscription_or_order).includes(
          normalizedSearch,
        ) ||
        normalizeText(request.order_number).includes(normalizedSearch) ||
        normalizeText(request.reason).includes(normalizedSearch) ||
        normalizeText(statusLabel(request.email_confirmation_status)).includes(
          normalizedSearch,
        ) ||
        normalizeText(request.ip_address).includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [emailStatus, requests, search]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRequests.length / WITHDRAWAL_REQUESTS_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedRequests = useMemo(() => {
    const start = (safeCurrentPage - 1) * WITHDRAWAL_REQUESTS_PAGE_SIZE;
    return filteredRequests.slice(start, start + WITHDRAWAL_REQUESTS_PAGE_SIZE);
  }, [filteredRequests, safeCurrentPage]);

  async function refreshRequests() {
    setIsRefreshing(true);

    try {
      setRequests(await getAdminWithdrawalRequests({ limit: 200 }));
      setCurrentPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Cererile de retragere nu au putut fi încărcate.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin/settings"
              className="mb-5 flex w-fit items-center rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              ← Setări admin
            </Link>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Contracte
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Retrageri contract.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Cereri trimise prin formularul public pentru exercitarea dreptului
              de retragere din contract.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshRequests}
            disabled={isRefreshing}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshing} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <WithdrawalMetric
            label="Retrageri"
            value={String(requests.length)}
            detail={`${filteredRequests.length} afișate`}
          />
          <WithdrawalMetric
            label="Email eșuat"
            value={String(failedEmailCount)}
            detail="Confirmări netrimise"
          />
          <WithdrawalMetric
            label="Ultima cerere"
            value={formatDate(latestRequest?.created_at ?? null)}
            detail={latestRequest?.registration_number ?? "fără cereri"}
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
            <label className="min-w-0">
              <span className="sr-only">Caută în cereri</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Caută după nume, email, abonament, referință sau IP..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
              />
            </label>

            <div className="min-w-0">
              <Select
                value={emailStatus}
                onChange={(next) => {
                  setEmailStatus(next);
                  setCurrentPage(1);
                }}
                options={emailStatusFilters.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                aria-label="Filtrează după status email"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="data-table-scroll max-h-[38rem] overflow-auto">
            <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Dată</th>
                  <th className="px-5 py-4">Solicitant</th>
                  <th className="px-5 py-4">Abonament / comandă</th>
                  <th className="px-5 py-4">Motiv</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Context</th>
                  <th className="px-5 py-4">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="align-top transition hover:bg-surface-hover/45"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      <span className="block">
                        {formatDate(request.created_at)}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {request.registration_number}
                      </span>
                    </td>
                    <td className="max-w-[250px] px-5 py-4">
                      <span className="block break-words font-bold text-content">
                        {request.full_name}
                      </span>
                      <a
                        href={`mailto:${request.email}`}
                        className="mt-1 block break-all text-xs font-semibold text-muted transition hover:text-content"
                      >
                        {request.email}
                      </a>
                    </td>
                    <td className="max-w-[280px] px-5 py-4">
                      <span className="block break-words font-bold text-content">
                        {request.subscription_or_order}
                      </span>
                      <span className="mt-1 block break-words text-xs font-semibold text-muted">
                        Comandă: {request.order_number ?? "-"}
                      </span>
                    </td>
                    <td className="min-w-[320px] max-w-[420px] px-5 py-4">
                      <p className="break-words leading-6 text-muted">
                        {compactPreview(request.reason)}
                      </p>
                      {request.reason ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-black text-content">
                            Vezi motivul complet
                          </summary>
                          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-subtle bg-app p-3 text-sm leading-6 text-muted">
                            {request.reason}
                          </p>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                        {statusLabel(request.email_confirmation_status)}
                      </span>
                      <span className="mt-2 block text-xs font-semibold text-muted">
                        Confirmat: {request.confirmation ? "Da" : "Nu"}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-5 py-4 text-xs leading-5 text-muted">
                      <span className="block break-all">
                        IP: {request.ip_address ?? "-"}
                      </span>
                      <span className="mt-2 block break-words">
                        User agent: {request.user_agent ?? "-"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={replyHref(request)}
                        className="inline-flex items-center justify-center rounded-md bg-action px-4 py-2 text-xs font-black text-on-action transition hover:bg-action-hover"
                      >
                        Răspunde
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRequests.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Nu există cereri pentru filtrele alese.
            </p>
          ) : null}
          <TablePagination
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={WITHDRAWAL_REQUESTS_PAGE_SIZE}
            totalItems={filteredRequests.length}
            itemLabel="cereri"
            onPageChange={setCurrentPage}
          />
        </section>
      </section>
    </AccountStaticShell>
  );
}
