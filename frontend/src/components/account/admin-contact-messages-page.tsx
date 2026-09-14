"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { TablePagination } from "@/components/account/table-pagination";
import { Select } from "@/components/ui/select";
import {
  type AdminContactMessage,
  type ContactMessageCategory,
  getAdminContactMessages,
} from "@/lib/admin-contact-messages-api";
import { toast } from "@/lib/toast-store";

type AdminContactMessagesPageProps = {
  initialMessages: AdminContactMessage[];
};

const CONTACT_MESSAGES_PAGE_SIZE = 10;

const categoryLabels: Record<ContactMessageCategory, string> = {
  suport: "Suport",
  facturare: "Facturare",
  confidentialitate: "Confidențialitate",
  raportare_continut: "Raportare conținut",
};

const categoryFilters: Array<{ value: ContactMessageCategory | ""; label: string }> =
  [
    { value: "", label: "Toate" },
    { value: "suport", label: "Suport" },
    { value: "facturare", label: "Facturare" },
    { value: "confidentialitate", label: "Confidențialitate" },
    { value: "raportare_continut", label: "Raportare conținut" },
  ];

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

function messagePreview(message: string) {
  const compactMessage = message.replace(/\s+/g, " ").trim();
  if (compactMessage.length <= 160) return compactMessage;
  return `${compactMessage.slice(0, 160)}...`;
}

function replyHref(message: AdminContactMessage) {
  const subject = encodeURIComponent(`Re: ${message.subject}`);
  const body = encodeURIComponent(
    `Bună, ${message.name}\n\nÎți răspundem la mesajul ${message.reference}.\n\n`,
  );

  return `mailto:${message.email}?subject=${subject}&body=${body}`;
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

function MessageMetric({
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

export function AdminContactMessagesPage({
  initialMessages,
}: AdminContactMessagesPageProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ContactMessageCategory | "">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const latestMessage = messages[0] ?? null;
  const supportCount = messages.filter(
    (message) => message.category === "suport",
  ).length;

  const filteredMessages = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return messages.filter((message) => {
      const matchesCategory = !category || message.category === category;
      const matchesSearch =
        !normalizedSearch ||
        normalizeText(message.reference).includes(normalizedSearch) ||
        normalizeText(message.name).includes(normalizedSearch) ||
        normalizeText(message.email).includes(normalizedSearch) ||
        normalizeText(categoryLabels[message.category]).includes(
          normalizedSearch,
        ) ||
        normalizeText(message.subject).includes(normalizedSearch) ||
        normalizeText(message.message).includes(normalizedSearch) ||
        normalizeText(message.ip_address).includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [category, messages, search]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredMessages.length / CONTACT_MESSAGES_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedMessages = useMemo(() => {
    const start = (safeCurrentPage - 1) * CONTACT_MESSAGES_PAGE_SIZE;
    return filteredMessages.slice(start, start + CONTACT_MESSAGES_PAGE_SIZE);
  }, [filteredMessages, safeCurrentPage]);

  async function refreshMessages() {
    setIsRefreshing(true);

    try {
      setMessages(await getAdminContactMessages({ limit: 200 }));
      setCurrentPage(1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Mesajele de contact nu au putut fi încărcate.",
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
              Contact
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Mesaje contact.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Mesaje primite prin formularul public, cu datele utile pentru
              răspuns și verificare.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshMessages}
            disabled={isRefreshing}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshing} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <MessageMetric
            label="Mesaje"
            value={String(messages.length)}
            detail={`${filteredMessages.length} afișate`}
          />
          <MessageMetric
            label="Suport"
            value={String(supportCount)}
            detail="Mesaje de suport"
          />
          <MessageMetric
            label="Ultimul mesaj"
            value={formatDate(latestMessage?.created_at ?? null)}
            detail={latestMessage?.subject ?? "fără mesaje"}
          />
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-center">
            <label className="min-w-0">
              <span className="sr-only">Caută în mesaje</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Caută după nume, email, subiect, mesaj sau IP..."
                className="h-12 w-full rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
              />
            </label>

            <div className="min-w-0">
              <Select
                value={category}
                onChange={(next) => {
                  setCategory(next as ContactMessageCategory | "");
                  setCurrentPage(1);
                }}
                options={categoryFilters.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
                aria-label="Filtrează după categorie"
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
                  <th className="px-5 py-4">Expeditor</th>
                  <th className="px-5 py-4">Categorie</th>
                  <th className="px-5 py-4">Subiect</th>
                  <th className="px-5 py-4">Mesaj</th>
                  <th className="px-5 py-4">Context</th>
                  <th className="px-5 py-4">Acțiune</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedMessages.map((message) => (
                  <tr
                    key={message.id}
                    className="align-top transition hover:bg-surface-hover/45"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-muted">
                      <span className="block">{formatDate(message.created_at)}</span>
                      <span className="mt-1 block font-mono text-[11px] text-muted">
                        {message.reference}
                      </span>
                    </td>
                    <td className="max-w-[260px] px-5 py-4">
                      <span className="block break-words font-bold text-content">
                        {message.name}
                      </span>
                      <a
                        href={`mailto:${message.email}`}
                        className="mt-1 block break-all text-xs font-semibold text-muted transition hover:text-content"
                      >
                        {message.email}
                      </a>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                        {categoryLabels[message.category]}
                      </span>
                    </td>
                    <td className="max-w-[260px] break-words px-5 py-4 font-bold text-content">
                      {message.subject}
                    </td>
                    <td className="min-w-[340px] max-w-[420px] px-5 py-4">
                      <p className="break-words leading-6 text-muted">
                        {messagePreview(message.message)}
                      </p>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-black text-content">
                          Vezi mesajul complet
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-subtle bg-app p-3 text-sm leading-6 text-muted">
                          {message.message}
                        </p>
                      </details>
                    </td>
                    <td className="max-w-[260px] px-5 py-4 text-xs leading-5 text-muted">
                      <span className="block break-all">
                        IP: {message.ip_address ?? "-"}
                      </span>
                      <span className="mt-2 block break-words">
                        User agent: {message.user_agent ?? "-"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <a
                        href={replyHref(message)}
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

          {filteredMessages.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Nu există mesaje pentru filtrele alese.
            </p>
          ) : null}
          <TablePagination
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={CONTACT_MESSAGES_PAGE_SIZE}
            totalItems={filteredMessages.length}
            itemLabel="mesaje"
            onPageChange={setCurrentPage}
          />
        </section>
      </section>
    </AccountStaticShell>
  );
}
