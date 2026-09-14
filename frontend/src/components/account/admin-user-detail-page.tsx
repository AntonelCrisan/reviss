"use client";
import { Select } from "@/components/ui/select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { AdminUserSubscriptionSection } from "@/components/account/admin-user-subscription-section";
import { AdminUserUsageSection } from "@/components/account/admin-user-usage-section";
import { TablePagination } from "@/components/account/table-pagination";
import { useAuth } from "@/components/auth/auth-provider";
import {
  deleteAdminUser,
  sendAdminUserVerificationEmail,
  type AdminUser,
  type AdminUserSession,
  type AdminUserSubscription,
  updateAdminUser,
} from "@/lib/admin-users-api";
import { toast } from "@/lib/toast-store";

type AdminUserDetailPageProps = {
  user: AdminUser;
  plans: { slug: string; name: string }[];
};

const SESSIONS_PAGE_SIZE = 8;
type VerificationEmailState = "idle" | "sending" | "sent";
const VERIFICATION_EMAIL_SUCCESS_MESSAGE =
  "Emailul de verificare a fost trimis.";

function formatDate(value: string | null) {
  if (!value) return "Niciodată";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function roleLabel(role: AdminUser["role"]) {
  return role === "admin" ? "Administrator" : "Utilizator";
}

function themeLabel(theme: AdminUser["theme_preference"]) {
  if (theme === "dark") return "Dark";
  if (theme === "light") return "Luminos";
  return "Sistem";
}

function sessionStatusClass(status: AdminUserSession["status"]) {
  if (status === "activă") {
    return "border-success-border bg-success-soft text-success";
  }
  if (status === "revocată") {
    return "border-danger-border bg-danger-soft text-danger";
  }
  return "border-subtle bg-app text-muted";
}

function statusBadgeClass(active: boolean) {
  return active
    ? "border-success-border bg-success-soft text-success"
    : "border-danger-border bg-danger-soft text-danger";
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-[13rem_1fr] sm:gap-5">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-semibold text-content">{value}</dd>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-subtle bg-surface p-5">
      <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
        {title}
      </h2>
      <dl className="mt-4 divide-y divide-subtle border-y border-subtle">
        {children}
      </dl>
    </section>
  );
}

function UserMetric({
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

export function AdminUserDetailPage({
  user: initialUser,
  plans,
}: AdminUserDetailPageProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState(initialUser);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [verificationEmailState, setVerificationEmailState] =
    useState<VerificationEmailState>("idle");
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
  const [usageRefreshToken, setUsageRefreshToken] = useState(0);
  const verificationEmailRequestInFlightRef = useRef(false);
  const isCurrentUser = currentUser?.id === user.id;
  const hasSentVerificationEmail = verificationEmailState === "sent";
  const showVerificationEmailSpinner =
    verificationEmailState === "sending" && !hasSentVerificationEmail;
  const verificationEmailButtonLabel = hasSentVerificationEmail
    ? "Trimite din nou email"
    : "Trimite email verificare";
  const pageCount = Math.max(
    1,
    Math.ceil(user.sessions.length / SESSIONS_PAGE_SIZE),
  );
  const safeCurrentPage = Math.min(currentPage, pageCount);
  const paginatedSessions = useMemo(() => {
    const start = (safeCurrentPage - 1) * SESSIONS_PAGE_SIZE;
    return user.sessions.slice(start, start + SESSIONS_PAGE_SIZE);
  }, [safeCurrentPage, user.sessions]);

  async function changeRole(nextRole: AdminUser["role"]) {
    if (nextRole === user.role || isSavingRole) return;

    setIsSavingRole(true);

    try {
      setUser(await updateAdminUser(user.id, { role: nextRole }));
      toast.success("Rolul utilizatorului a fost actualizat.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Rolul nu a putut fi actualizat.",
      );
    } finally {
      setIsSavingRole(false);
    }
  }

  async function toggleUserStatus() {
    if (isSavingStatus) return;

    const nextIsActive = !user.is_active;
    setIsSavingStatus(true);

    try {
      setUser(await updateAdminUser(user.id, { is_active: nextIsActive }));
      toast.success(
        nextIsActive
          ? "Contul utilizatorului a fost reactivat."
          : "Contul utilizatorului a fost dezactivat.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Statusul contului nu a putut fi actualizat.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function sendVerificationEmail() {
    if (verificationEmailRequestInFlightRef.current || user.is_active) return;

    verificationEmailRequestInFlightRef.current = true;
    setVerificationEmailState("sending");

    try {
      const updatedUser = await sendAdminUserVerificationEmail(user.id);
      setUser(updatedUser);
      setVerificationEmailState("sent");
      toast.success(VERIFICATION_EMAIL_SUCCESS_MESSAGE);
    } catch (error) {
      setVerificationEmailState("idle");
      toast.error(
        error instanceof Error ? error.message : "Emailul de verificare nu a putut fi trimis.",
      );
    } finally {
      verificationEmailRequestInFlightRef.current = false;
    }
  }

  async function verifyUserManually() {
    if (isSavingStatus || user.is_active) return;

    setIsSavingStatus(true);

    try {
      setUser(await updateAdminUser(user.id, { is_active: true }));
      setVerificationEmailState("idle");
      toast.success("Contul utilizatorului a fost verificat manual.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Contul nu a putut fi verificat manual.",
      );
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function removeUser() {
    if (isDeletingUser) return;

    setIsDeletingUser(true);
    setIsDeleteUserModalOpen(false);

    try {
      await deleteAdminUser(user.id);
      router.push(
        `/admin/settings/utilizatori?deleted=${encodeURIComponent(user.email)}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Utilizatorul nu a putut fi sters.",
      );
      setIsDeletingUser(false);
    }
  }

  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/admin/settings/utilizatori"
              className="mb-5 flex w-fit items-center rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              ← Utilizatori
            </Link>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Utilizator
            </p>
            <h1 className="mt-3 max-w-3xl break-words font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {user.full_name || "Fără nume"}
            </h1>
            <p className="mt-3 break-all text-sm leading-6 text-muted">
              {user.email}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-md border border-action bg-action px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-on-action">
              {roleLabel(user.role)}
            </span>
            <span
              className={`inline-flex rounded-md border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusBadgeClass(user.is_active)}`}
            >
              {user.is_active ? "Activ" : "Inactiv"}
            </span>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <UserMetric
            label="Rol"
            value={roleLabel(user.role)}
            detail="permisiune curentă"
          />
          <UserMetric
            label="Sesiuni active"
            value={String(user.active_sessions)}
            detail={`${user.total_sessions} sesiuni totale`}
          />
          <UserMetric
            label="Ultima activitate"
            value={formatDate(user.last_seen_at)}
            detail={themeLabel(user.theme_preference)}
          />
        </div>

        <AdminUserSubscriptionSection
          userId={user.id}
          userEmail={user.email}
          subscription={user.subscription}
          plans={plans}
          onSubscriptionChange={(subscription: AdminUserSubscription) => {
            setUser((current) => ({ ...current, subscription }));
            setUsageRefreshToken((token) => token + 1);
          }}
        />

        <AdminUserUsageSection
          userId={user.id}
          refreshToken={usageRefreshToken}
        />

        <section className="rounded-xl border border-subtle bg-surface p-5">
          <div className="flex flex-col gap-3 border-b border-subtle pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
                Administrare utilizator
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Controleaza rolul, verificarea emailului si accesul contului.
                Schimbarile importante revoca automat sesiunile active.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                user.is_active
                  ? "border-success-border bg-success-soft text-success"
                  : "border-warning-border bg-warning-soft text-warning"
              }`}
            >
              {user.is_active ? "Activ / verificat" : "Inactiv / neverificat"}
            </span>
          </div>

          {isCurrentUser ? (
            <p className="mt-5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
              Pentru siguranta, nu iti poti sterge contul, dezactiva accesul sau
              elimina propriul rol de administrator.
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-xl border border-subtle bg-app p-4">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                  Rol utilizator
                </span>
                <Select
                  value={user.role}
                  onChange={(next) => void changeRole(next as AdminUser["role"])}
                  disabled={isSavingRole || isCurrentUser}
                  options={[
                    { value: "user", label: "Utilizator" },
                    { value: "admin", label: "Administrator" },
                  ]}
                  className="mt-3"
                  aria-label="Rolul contului"
                />
              </label>
              <p className="mt-3 text-xs leading-5 text-muted">
                Rolul decide accesul la setarile administrative. La schimbarea
                rolului, sesiunile utilizatorului sunt revocate.
              </p>
            </div>

            <div className="rounded-xl border border-subtle bg-app p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                    Verificare si acces
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {user.is_active
                      ? "Contul poate accesa aplicatia. Il poti dezactiva daca este nevoie."
                      : "Trimite un link nou de verificare sau verifica manual contul daca emailul nu ajunge."}
                  </p>
                </div>
                <span className="w-fit rounded-md border border-subtle bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                  {user.is_active ? "Acces permis" : "Acces blocat"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {!user.is_active ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void sendVerificationEmail()}
                      disabled={isCurrentUser}
                      aria-busy={showVerificationEmailSpinner}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-action px-5 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {showVerificationEmailSpinner ? (
                        <svg
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
                          <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
                        </svg>
                      ) : null}
                      {verificationEmailButtonLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void verifyUserManually()}
                      disabled={isSavingStatus || isCurrentUser}
                      className="inline-flex h-11 items-center justify-center rounded-md border border-success-border bg-success-soft px-5 text-sm font-black text-success transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingStatus ? "Se verifica..." : "Verifica manual"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void toggleUserStatus()}
                    disabled={isSavingStatus || isCurrentUser}
                    className="inline-flex h-11 items-center justify-center rounded-md border border-warning-border bg-warning-soft px-5 text-sm font-black text-warning transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingStatus ? "Se salveaza..." : "Dezactiveaza contul"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-danger-border bg-danger-soft p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-danger">Stergere cont</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-danger">
                  Sterge utilizatorul si datele asociate contului. Actiunea este
                  permanenta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteUserModalOpen(true)}
                disabled={isDeletingUser || isCurrentUser}
                className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-danger px-5 text-sm font-black text-danger-soft transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingUser ? "Se sterge..." : "Sterge utilizator"}
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <DetailSection title="Date cont">
            <DataRow label="ID utilizator" value={user.id} />
            <DataRow label="Nume" value={user.full_name || "Fără nume"} />
            <DataRow label="Email" value={user.email} />
            <DataRow label="Rol" value={roleLabel(user.role)} />
            <DataRow label="Status" value={user.is_active ? "Activ" : "Inactiv"} />
            <DataRow
              label="Tema preferată"
              value={themeLabel(user.theme_preference)}
            />
            <DataRow label="Creat la" value={formatDate(user.created_at)} />
            <DataRow label="Actualizat la" value={formatDate(user.updated_at)} />
          </DetailSection>

          <DetailSection title="Legal și consimțăminte">
            <DataRow
              label="Termeni acceptați"
              value={formatDate(user.terms_accepted_at)}
            />
            <DataRow label="Versiune termeni" value={user.terms_version} />
            <DataRow
              label="Newsletter"
              value={user.newsletter_consent ? "Acceptat" : "Neacceptat"}
            />
            <DataRow
              label="Newsletter acceptat la"
              value={formatDate(user.newsletter_consent_at)}
            />
          </DetailSection>
        </div>

        <section className="rounded-xl border border-subtle bg-surface p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
              Sesiuni
            </h2>
            <span className="text-xs font-bold text-muted">
              {user.sessions.length} înregistrări
            </span>
          </div>

          <dl className="mt-4 grid gap-0 divide-y divide-subtle border-y border-subtle md:grid-cols-2 md:divide-x md:divide-y-0">
            <DataRow label="Sesiuni totale" value={user.total_sessions} />
            <DataRow label="Sesiuni active" value={user.active_sessions} />
            <DataRow label="Ultima sesiune" value={formatDate(user.last_session_at)} />
            <DataRow
              label="Ultima activitate"
              value={formatDate(user.last_seen_at)}
            />
          </dl>

          <div className="data-table-scroll mt-5 max-h-[32rem] overflow-auto border-t border-subtle pt-5">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-subtle bg-surface text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Creată</th>
                  <th className="px-4 py-3">Expiră</th>
                  <th className="px-4 py-3">Revocată</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">User agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {paginatedSessions.map((session) => (
                  <tr key={session.id} className="transition hover:bg-surface-hover/45">
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${sessionStatusClass(session.status)}`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {formatDate(session.created_at)}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {formatDate(session.expires_at)}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {formatDate(session.revoked_at)}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {session.ip_address ?? "Necunoscut"}
                    </td>
                    <td className="min-w-[420px] whitespace-normal break-words px-4 py-4 text-muted">
                      {session.user_agent ?? "Necunoscut"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {user.sessions.length === 0 ? (
            <p className="border-t border-subtle p-5 text-sm text-muted">
              Utilizatorul nu are sesiuni înregistrate.
            </p>
          ) : null}
          <TablePagination
            currentPage={safeCurrentPage}
            pageCount={pageCount}
            pageSize={SESSIONS_PAGE_SIZE}
            totalItems={user.sessions.length}
            itemLabel="sesiuni"
            onPageChange={setCurrentPage}
          />
        </section>

        {isDeleteUserModalOpen ? (
          <DeleteAdminUserModal
            user={user}
            isDeleting={isDeletingUser}
            onCancel={() => setIsDeleteUserModalOpen(false)}
            onConfirm={() => void removeUser()}
          />
        ) : null}
      </section>
    </AccountStaticShell>
  );
}

function DeleteAdminUserModal({
  user,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  user: AdminUser;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-admin-user-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-danger-border bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-danger">
          Ștergere utilizator
        </p>
        <h2
          id="delete-admin-user-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          Ștergi definitiv utilizatorul?
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Utilizatorul {user.email} și datele asociate contului vor fi șterse.
          Va primi un email de confirmare dacă operația se finalizează.
        </p>
        <div className="mt-5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
          Această acțiune este permanentă și nu poate fi anulată.
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-danger-soft transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? "Se șterge..." : "Șterge utilizatorul"}
          </button>
        </div>
      </div>
    </div>
  );
}
