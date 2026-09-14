"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { actionLabel } from "@/components/account/audit-action-labels";
import { TablePagination } from "@/components/account/table-pagination";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  type AuditLog,
  type AuditLogActionOption,
  type AuditLogStatus,
  type Paged,
  getAdminAuditLogs,
} from "@/lib/admin-audit-api";
import { toast } from "@/lib/toast-store";

type AdminAuditLogsPageProps = {
  initialLogs: Paged<AuditLog>;
  initialActions: AuditLogActionOption[];
  initialFailureTotal: number;
};

const AUDIT_LOGS_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

const statusFilters: Array<{ value: AuditLogStatus | ""; label: string }> = [
  { value: "", label: "Toate" },
  { value: "success", label: "Succes" },
  { value: "failure", label: "Erori" },
];

const numberFormatter = new Intl.NumberFormat("ro-RO");

function formatDate(value: string | null) {
  if (!value) return "Niciodată";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function actorLabel(log: AuditLog) {
  if (log.actor_name && log.actor_email) {
    return `${log.actor_name} <${log.actor_email}>`;
  }
  return log.actor_email || log.actor_name || "Sistem";
}

function statusLabel(status: AuditLogStatus) {
  return status === "success" ? "Succes" : "Eroare";
}

function statusClass(status: AuditLogStatus) {
  return status === "success"
    ? "border-success-border bg-success-soft text-success"
    : "border-danger-border bg-danger-soft text-danger";
}

function resourceLabel(log: AuditLog) {
  if (!log.resource_type && !log.resource_id) return "-";
  if (!log.resource_id) return log.resource_type ?? "-";
  return `${log.resource_type ?? "resursă"} / ${log.resource_id}`;
}

function LogMetric({
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

export function AdminAuditLogsPage({
  initialLogs,
  initialActions,
  initialFailureTotal,
}: AdminAuditLogsPageProps) {
  const [page, setPage] = useState<Paged<AuditLog>>(initialLogs);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<AuditLogStatus | "">("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const isInitialRender = useRef(true);

  const recordedTotal = initialActions.reduce(
    (total, option) => total + option.total,
    0,
  );
  const latestLog = page.items[0] ?? null;
  const pageCount = Math.max(1, Math.ceil(page.total / AUDIT_LOGS_PAGE_SIZE));
  const hasFilters = Boolean(search || status || action || dateFrom || dateTo);

  // Typing sends one request when the admin stops, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  // Filtering happens in the database. Narrowing the rows already on screen
  // would only ever search the newest page, so an event from last month could
  // never be found however precise the filter.
  useEffect(() => {
    // The server already rendered this exact page, so the first run would
    // only fetch it a second time.
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    let cancelled = false;

    getAdminAuditLogs({
      action: action || undefined,
      actor: debouncedSearch || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: AUDIT_LOGS_PAGE_SIZE,
      offset: (currentPage - 1) * AUDIT_LOGS_PAGE_SIZE,
    })
      .then((next) => {
        if (!cancelled) setPage(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Jurnalul de activitate nu a putut fi încărcat.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, currentPage, dateFrom, dateTo, debouncedSearch, reloadToken, status]);

  function changeFilter(apply: () => void) {
    setIsLoading(true);
    setCurrentPage(1);
    apply();
  }

  function resetFilters() {
    changeFilter(() => {
      setSearch("");
      setDebouncedSearch("");
      setStatus("");
      setAction("");
      setDateFrom("");
      setDateTo("");
    });
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
              Audit
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Jurnal activitate.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Evenimente administrative, acțiuni de cont și erori importante din
              platformă. Filtrele caută în tot jurnalul, nu doar în pagina
              afișată.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadToken((token) => token + 1);
            }}
            disabled={isLoading}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            <svg
              aria-hidden="true"
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
            </svg>
            <span>{isLoading ? "Se încarcă..." : "Reîmprospătează"}</span>
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <LogMetric
            label="Total înregistrări"
            value={numberFormatter.format(recordedTotal)}
            detail={`${initialActions.length} tipuri de acțiuni`}
          />
          <LogMetric
            label="Rezultate"
            value={numberFormatter.format(page.total)}
            detail={hasFilters ? "pentru filtrele alese" : "fără filtre active"}
          />
          <LogMetric
            label="Erori în total"
            value={numberFormatter.format(initialFailureTotal)}
            detail={
              latestLog
                ? `ultimul eveniment: ${formatDate(latestLog.created_at)}`
                : "fără evenimente"
            }
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <label className="min-w-0">
              <span className="sr-only">Caută în jurnal</span>
              <input
                value={search}
                onChange={(event) => {
                  setIsLoading(true);
                  setCurrentPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Caută după nume, email sau IP (ID de resursă: exact)..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {statusFilters.map((item) => {
                const isActive = status === item.value;

                return (
                  <button
                    key={item.value || "all"}
                    type="button"
                    onClick={() => changeFilter(() => setStatus(item.value))}
                    className={`rounded-md border px-4 py-2 text-xs font-black transition ${
                      isActive
                        ? "border-action bg-action text-on-action"
                        : "border-subtle bg-app text-muted hover:bg-surface-hover hover:text-content"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                Acțiune
              </span>
              <Select
                value={action}
                onChange={(next) => changeFilter(() => setAction(next))}
                options={[
                  { value: "", label: "Toate acțiunile" },
                  ...initialActions.map((option) => ({
                    value: option.action,
                    label: actionLabel(option.action),
                    description: `${option.total} înregistrări`,
                  })),
                ]}
                aria-label="Filtrează după acțiune"
              />
            </label>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                De la
              </span>
              <DatePicker
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(next) => changeFilter(() => setDateFrom(next))}
                placeholder="De la"
                aria-label="De la"
              />
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                Până la
              </span>
              <DatePicker
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(next) => changeFilter(() => setDateTo(next))}
                placeholder="Până la"
                aria-label="Până la"
              />
            </div>

            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasFilters}
              className="h-12 self-end rounded-md border border-subtle bg-app px-5 text-xs font-black text-muted transition hover:bg-surface-hover hover:text-content disabled:opacity-40"
            >
              Resetează
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="data-table-scroll max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Dată</th>
                  <th className="px-5 py-4">Actor</th>
                  <th className="px-5 py-4">Acțiune</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Resursă</th>
                  <th className="px-5 py-4">IP</th>
                  <th className="px-5 py-4">Detalii</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {page.items.map((log) => (
                  <tr
                    key={log.id}
                    className="align-top transition hover:bg-surface-hover/45"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="max-w-[280px] break-words px-5 py-4 font-bold text-content">
                      {actorLabel(log)}
                    </td>
                    <td className="max-w-[300px] px-5 py-4">
                      <span className="block font-bold text-content">
                        {actionLabel(log.action)}
                      </span>
                      <span className="mt-1 block break-all font-mono text-[11px] text-muted">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(
                          log.status,
                        )}`}
                      >
                        {statusLabel(log.status)}
                      </span>
                    </td>
                    <td className="max-w-[280px] break-words px-5 py-4 text-muted">
                      {resourceLabel(log)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {log.ip_address ?? "-"}
                    </td>
                    <td className="min-w-[300px] px-5 py-4">
                      <details>
                        <summary className="cursor-pointer text-xs font-black text-content">
                          Vezi detalii
                        </summary>
                        <pre className="data-table-scroll mt-3 max-h-72 overflow-auto rounded-lg border border-subtle bg-app p-3 text-xs leading-5 text-muted">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {page.items.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Nu există loguri pentru filtrele alese.
            </p>
          ) : null}
          <TablePagination
            currentPage={Math.min(currentPage, pageCount)}
            pageCount={pageCount}
            pageSize={AUDIT_LOGS_PAGE_SIZE}
            totalItems={page.total}
            itemLabel="loguri"
            onPageChange={(nextPage) => {
              setIsLoading(true);
              setCurrentPage(nextPage);
            }}
          />
        </section>
      </section>
    </AccountStaticShell>
  );
}
