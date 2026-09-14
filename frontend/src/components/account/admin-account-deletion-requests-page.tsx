"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/components/auth/auth-provider";
import {
  deleteAccountFromDeletionRequest,
  getAdminAccountDeletionRequests,
  type AccountDeletionRequestStatus,
  type AdminAccountDeletionRequest,
} from "@/lib/admin-account-deletion-requests-api";
import { toast } from "@/lib/toast-store";

type AdminAccountDeletionRequestsPageProps = {
  initialRequests: AdminAccountDeletionRequest[];
};

const ACCOUNT_DELETION_REQUESTS_PAGE_SIZE = 10;

const statusFilters: Array<{
  value: AccountDeletionRequestStatus | "";
  label: string;
}> = [
  { value: "", label: "Toate" },
  { value: "pending", label: "În așteptare" },
  { value: "completed", label: "Rezolvate" },
  { value: "cancelled", label: "Anulate" },
];

const statusLabels: Record<AccountDeletionRequestStatus, string> = {
  pending: "În așteptare",
  completed: "Rezolvată",
  cancelled: "Anulată",
};

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

function statusClass(status: AccountDeletionRequestStatus) {
  if (status === "completed") {
    return "border-success-border bg-success-soft text-success";
  }
  if (status === "cancelled") {
    return "border-subtle bg-app text-muted";
  }
  return "border-warning-border bg-warning-soft text-warning";
}

function compactPreview(value: string | null | undefined, maxLength = 140) {
  const compactValue = (value ?? "").replace(/\s+/g, " ").trim();
  if (!compactValue) return "-";
  if (compactValue.length <= maxLength) return compactValue;
  return `${compactValue.slice(0, maxLength)}...`;
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

function DeletionMetric({
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

export function AdminAccountDeletionRequestsPage({
  initialRequests,
}: AdminAccountDeletionRequestsPageProps) {
  const { user: currentUser } = useAuth();
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [requestStatus, setRequestStatus] = useState<
    AccountDeletionRequestStatus | ""
  >("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [requestToResolve, setRequestToResolve] =
    useState<AdminAccountDeletionRequest | null>(null);

  const latestRequest = requests[0] ?? null;
  const pendingCount = requests.filter(
    (request) => request.status === "pending",
  ).length;
  const completedCount = requests.filter(
    (request) => request.status === "completed",
  ).length;

  const filteredRequests = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return requests.filter((request) => {
      const matchesStatus = !requestStatus || request.status === requestStatus;
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(request.full_name).includes(normalizedSearch) ||
        normalizeText(request.email).includes(normalizedSearch) ||
        normalizeText(request.status).includes(normalizedSearch) ||
        normalizeText(request.resolution_note).includes(normalizedSearch) ||
        normalizeText(request.ip_address).includes(normalizedSearch) ||
        normalizeText(request.user_id).includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [requestStatus, requests, search]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredRequests.length / ACCOUNT_DELETION_REQUESTS_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedRequests = useMemo(() => {
    const start = (safeCurrentPage - 1) * ACCOUNT_DELETION_REQUESTS_PAGE_SIZE;
    return filteredRequests.slice(
      start,
      start + ACCOUNT_DELETION_REQUESTS_PAGE_SIZE,
    );
  }, [filteredRequests, safeCurrentPage]);

  async function refreshRequests() {
    setIsRefreshing(true);

    try {
      setRequests(await getAdminAccountDeletionRequests({ limit: 200 }));
      setCurrentPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Solicitările de ștergere nu au putut fi încărcate.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function resolveDeletionRequest(request: AdminAccountDeletionRequest) {
    if (actionRequestId) return;

    const alreadyDeleted = request.user_id === null;
    setActionRequestId(request.id);
    setRequestToResolve(null);

    try {
      const updatedRequest = await deleteAccountFromDeletionRequest(request.id);
      setRequests((currentRequests) =>
        currentRequests.map((item) =>
          item.id === updatedRequest.id ? updatedRequest : item,
        ),
      );
      toast.success(
        alreadyDeleted
          ? "Solicitarea a fost marcată ca rezolvată."
          : "Contul a fost șters și solicitarea a fost marcată ca rezolvată.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Contul nu a putut fi șters.",
      );
    } finally {
      setActionRequestId(null);
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
              Conturi
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Ștergeri conturi.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Cereri trimise de utilizatori din setările de securitate ale
              contului.
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
          <DeletionMetric
            label="În așteptare"
            value={String(pendingCount)}
            detail={`${filteredRequests.length} afișate`}
          />
          <DeletionMetric
            label="Rezolvate"
            value={String(completedCount)}
            detail="Conturi procesate"
          />
          <DeletionMetric
            label="Ultima solicitare"
            value={formatDate(latestRequest?.created_at ?? null)}
            detail={latestRequest?.email ?? "fără solicitări"}
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
            <label className="min-w-0">
              <span className="sr-only">Caută solicitări de ștergere</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Caută după nume, email, status, user ID sau IP..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
              />
            </label>

            <div className="min-w-0">
              <Select
                value={requestStatus}
                onChange={(next) => {
                  setRequestStatus(next as AccountDeletionRequestStatus | "");
                  setCurrentPage(1);
                }}
                options={statusFilters.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                aria-label="Filtrează după status"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
          <div className="data-table-scroll max-h-[38rem] overflow-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-5 py-4">Dată</th>
                  <th className="px-5 py-4">Utilizator</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Rezolvare</th>
                  <th className="px-5 py-4">Context</th>
                  <th className="px-5 py-4">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedRequests.map((request) => {
                  const isOwnAccount = currentUser?.id === request.user_id;
                  const isBusy = actionRequestId === request.id;
                  const isPending = request.status === "pending";
                  const canResolve = isPending && !isOwnAccount;

                  return (
                    <tr
                      key={request.id}
                      className="align-top transition hover:bg-surface-hover/45"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        {formatDate(request.created_at)}
                      </td>
                      <td className="max-w-[280px] px-5 py-4">
                        <span className="block break-words font-bold text-content">
                          {request.full_name}
                        </span>
                        <a
                          href={`mailto:${request.email}`}
                          className="mt-1 block break-all text-xs font-semibold text-muted transition hover:text-content"
                        >
                          {request.email}
                        </a>
                        {request.user_id ? (
                          <Link
                            href={`/admin/settings/utilizatori/${request.user_id}`}
                            className="mt-2 block break-all text-xs font-black text-content transition hover:text-muted"
                          >
                            Vezi utilizatorul
                          </Link>
                        ) : (
                          <span className="mt-2 block text-xs font-semibold text-muted">
                            Contul nu mai există
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClass(
                            request.status,
                          )}`}
                        >
                          {statusLabels[request.status]}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-5 py-4 text-xs leading-5 text-muted">
                        <span className="block">
                          Rezolvat la: {formatDate(request.resolved_at)}
                        </span>
                        <span className="mt-2 block break-words">
                          {compactPreview(request.resolution_note)}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-5 py-4 text-xs leading-5 text-muted">
                        <span className="block break-all">
                          IP: {request.ip_address ?? "-"}
                        </span>
                        <span className="mt-2 block break-words">
                          User agent: {request.user_agent ?? "-"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {canResolve ? (
                          <button
                            type="button"
                            onClick={() => setRequestToResolve(request)}
                            disabled={Boolean(actionRequestId)}
                            className="inline-flex items-center justify-center rounded-md bg-danger px-4 py-2 text-xs font-black text-danger-soft transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
                          >
                            {isBusy
                              ? "Se procesează..."
                              : request.user_id
                                ? "Șterge contul"
                                : "Finalizează"}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-muted">
                            {isOwnAccount
                              ? "Nu poți șterge propriul cont"
                              : "Fără acțiune"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRequests.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Nu există solicitări pentru filtrele alese.
            </p>
          ) : null}
          <TablePagination
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={ACCOUNT_DELETION_REQUESTS_PAGE_SIZE}
            totalItems={filteredRequests.length}
            itemLabel="solicitări"
            onPageChange={setCurrentPage}
          />
        </section>

        {requestToResolve ? (
          <ResolveAccountDeletionRequestModal
            request={requestToResolve}
            isProcessing={actionRequestId === requestToResolve.id}
            onCancel={() => setRequestToResolve(null)}
            onConfirm={() => void resolveDeletionRequest(requestToResolve)}
          />
        ) : null}
      </section>
    </AccountStaticShell>
  );
}

function ResolveAccountDeletionRequestModal({
  request,
  isProcessing,
  onCancel,
  onConfirm,
}: {
  request: AdminAccountDeletionRequest;
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const alreadyDeleted = request.user_id === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolve-account-deletion-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-danger-border bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-danger">
          {alreadyDeleted ? "Finalizare cerere" : "Ștergere definitivă"}
        </p>
        <h2
          id="resolve-account-deletion-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          {alreadyDeleted
            ? "Marchezi solicitarea ca rezolvată?"
            : "Ștergi definitiv acest cont?"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {alreadyDeleted
            ? `Contul ${request.email} nu mai există. Poți marca solicitarea ca rezolvată.`
            : `Contul ${request.email} va fi șters definitiv, iar utilizatorul va primi email de confirmare.`}
        </p>
        {!alreadyDeleted ? (
          <div className="mt-5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
            Acțiunea nu poate fi anulată după confirmare.
          </div>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-danger-soft transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {isProcessing
              ? "Se procesează..."
              : alreadyDeleted
                ? "Marchează rezolvată"
                : "Șterge contul"}
          </button>
        </div>
      </div>
    </div>
  );
}
