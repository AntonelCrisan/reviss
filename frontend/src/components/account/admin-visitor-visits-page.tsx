"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { DatePicker } from "@/components/ui/date-picker";
import {
  type Paged,
  type VisitorStats,
  type VisitorVisit,
  getAdminVisitorStats,
  getAdminVisitorVisits,
} from "@/lib/admin-audit-api";
import { toast } from "@/lib/toast-store";

type AdminVisitorVisitsPageProps = {
  initialVisits: Paged<VisitorVisit>;
  initialStats: VisitorStats | null;
};

const numberFormatter = new Intl.NumberFormat("ro-RO");
const VISITS_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function truncateHash(hash: string) {
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

function VisitorMetric({
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

export function AdminVisitorVisitsPage({
  initialVisits,
  initialStats,
}: AdminVisitorVisitsPageProps) {
  const [page, setPage] = useState<Paged<VisitorVisit>>(initialVisits);
  const [stats, setStats] = useState(initialStats);
  const [path, setPath] = useState("");
  const [debouncedPath, setDebouncedPath] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const isInitialRender = useRef(true);

  const pageCount = Math.max(1, Math.ceil(page.total / VISITS_PAGE_SIZE));
  const hasFilters = Boolean(path || dateFrom || dateTo);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPath(path.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [path]);

  useEffect(() => {
    // The server already rendered this exact page, so the first run would
    // only fetch it a second time.
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    let cancelled = false;

    getAdminVisitorVisits({
      path: debouncedPath || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: VISITS_PAGE_SIZE,
      offset: (currentPage - 1) * VISITS_PAGE_SIZE,
    })
      .then((next) => {
        if (!cancelled) setPage(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Vizitele nu au putut fi încărcate.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPage, dateFrom, dateTo, debouncedPath, reloadToken]);

  function changeFilter(apply: () => void) {
    setIsLoading(true);
    setCurrentPage(1);
    apply();
  }

  function resetFilters() {
    changeFilter(() => {
      setPath("");
      setDebouncedPath("");
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
              Trafic
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Vizitatori fără cont.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Vizite anonime pe platformă, identificate printr-un hash
              nereversibil, rotit zilnic. Utilizatorii autentificați nu sunt
              numărați aici.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadToken((token) => token + 1);
              // The counters move with the visits, so they are refreshed
              // together; a failure here must not hide the table.
              getAdminVisitorStats()
                .then(setStats)
                .catch(() => undefined);
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

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <VisitorMetric
            label="Azi"
            value={stats ? numberFormatter.format(stats.visitors_today) : "-"}
            detail="vizitatori unici azi"
          />
          <VisitorMetric
            label="Ultimele 7 zile"
            value={
              stats ? numberFormatter.format(stats.visitors_last_7_days) : "-"
            }
            detail="vizitatori unici"
          />
          <VisitorMetric
            label="Ultimele 30 de zile"
            value={
              stats ? numberFormatter.format(stats.visitors_last_30_days) : "-"
            }
            detail="vizitatori unici"
          />
          <VisitorMetric
            label="Total"
            value={stats ? numberFormatter.format(stats.total_visitors) : "-"}
            detail="de la activarea urmăririi"
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                Pagină
              </span>
              <input
                value={path}
                onChange={(event) => {
                  setIsLoading(true);
                  setCurrentPage(1);
                  setPath(event.target.value);
                }}
                placeholder="Caută după pagină, de exemplu /login..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
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

          <p className="mt-3 text-xs leading-5 text-muted">
            Se reține o singură intrare pe vizitator și pe zi, așa că
            <span className="font-bold text-content"> Pagină </span>
            este pagina pe care a intrat în ziua respectivă, nu tot parcursul
            lui prin site.
          </p>
        </section>

        <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="data-table-scroll max-h-[34rem] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Dată</th>
                  <th className="px-5 py-4">Pagină</th>
                  <th className="px-5 py-4">Hash vizitator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {page.items.map((visit) => (
                  <tr
                    key={visit.id}
                    className="align-top transition hover:bg-surface-hover/45"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      {formatDate(visit.created_at)}
                    </td>
                    <td className="max-w-[280px] break-words px-5 py-4 font-bold text-content">
                      {visit.path || "-"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-[11px] text-muted">
                      {truncateHash(visit.visitor_hash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {page.items.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              {hasFilters
                ? "Nu există vizite pentru filtrele alese."
                : "Nu există vizite înregistrate momentan."}
            </p>
          ) : null}
          <TablePagination
            currentPage={Math.min(currentPage, pageCount)}
            pageCount={pageCount}
            pageSize={VISITS_PAGE_SIZE}
            totalItems={page.total}
            itemLabel="vizite"
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
