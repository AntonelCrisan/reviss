"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import {
  createAdminLegalDocumentSection,
  deleteAdminLegalDocumentSection,
  getAdminLegalDocument,
  type LegalDocument,
  type LegalDocumentSection,
  updateAdminLegalDocumentSection,
  type LegalLocale,
} from "@/lib/legal-api";
import { toast } from "@/lib/toast-store";

type AdminLegalEditorPageProps = {
  document: LegalDocument;
  description: string;
  publicHref: string;
};

type DraftSection = {
  title: string;
  content: string;
};

function createEmptyDraft(): DraftSection {
  return {
    title: "",
    content: "",
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "necunoscut";

  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function countWords(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function EditorMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-subtle bg-surface p-5">
      <p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-4 min-w-0 break-words font-serif text-xl font-semibold leading-tight text-content sm:text-2xl">
        {value}
      </p>
      <p className="mt-2 min-w-0 break-words text-sm leading-6 text-muted">
        {detail}
      </p>
    </article>
  );
}

/** Romanian is the authoritative text; the others are informative. */
const LEGAL_LOCALES = [
  { code: "ro" as const, label: "Română" },
  { code: "en" as const, label: "English" },
  { code: "fr" as const, label: "Français" },
];

export function AdminLegalEditorPage({
  document,
  description,
  publicHref,
}: AdminLegalEditorPageProps) {
  const [locale, setLocale] = useState<LegalLocale>("ro");
  const [sections, setSections] = useState(document.sections);
  const [isLoadingLocale, setIsLoadingLocale] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSection | null>(null);
  const [newDraft, setNewDraft] = useState<DraftSection>(createEmptyDraft);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Every language goes through the same fetch, Romanian included, so there is
  // one code path and no synchronous state write before it. Opening a
  // translation for the first time makes the backend copy the Romanian
  // sections across, so the translator starts from the real structure.
  useEffect(() => {
    let isMounted = true;

    getAdminLegalDocument(document.slug, locale)
      .then((result) => {
        if (!isMounted) return;
        setSections(result.sections);
        setEditingKey(null);
        setDraft(null);
      })
      .catch((cause: unknown) => {
        if (!isMounted) return;
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Documentul nu a putut fi încărcat.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingLocale(false);
      });

    return () => {
      isMounted = false;
    };
  }, [document.slug, locale]);

  function startEditing(section: LegalDocumentSection) {
    setEditingKey(section.section_key);
    setDraft({ title: section.title, content: section.content });
    setDeleteConfirmKey(null);
  }

  function resetNewSection() {
    setNewDraft(createEmptyDraft());
    setIsAdding(false);
  }

  async function createSection() {
    const payload = {
      title: newDraft.title.trim(),
      content: newDraft.content.trim(),
    };

    if (!payload.title || !payload.content) {
      toast.error("Completează titlul și conținutul secțiunii.");
      return;
    }

    setIsCreating(true);
    try {
      const updatedDocument = await createAdminLegalDocumentSection(
        document.slug,
        payload,
        locale,
      );
      setSections(updatedDocument.sections);
      setNewDraft(createEmptyDraft());
      setIsAdding(false);
      toast.success(`Secțiunea „${payload.title}” a fost adăugată.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Secțiunea nu a putut fi adăugată.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function saveSection(section: LegalDocumentSection) {
    if (!draft) return;

    const payload = {
      title: draft.title.trim(),
      content: draft.content.trim(),
    };

    if (!payload.title || !payload.content) {
      toast.error("Completează titlul și conținutul secțiunii.");
      return;
    }

    setSavingKey(section.section_key);
    try {
      const updatedDocument = await updateAdminLegalDocumentSection(
        document.slug,
        section.section_key,
        payload,
        locale,
      );
      setSections(updatedDocument.sections);
      setEditingKey(null);
      setDraft(null);
      toast.success(`Secțiunea „${payload.title}” a fost salvată.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Secțiunea nu a putut fi salvată.",
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteSection(section: LegalDocumentSection) {
    if (sections.length <= 1) {
      toast.error("Documentul trebuie să păstreze cel puțin o secțiune.");
      return;
    }

    setDeletingKey(section.section_key);
    try {
      const updatedDocument = await deleteAdminLegalDocumentSection(
        document.slug,
        section.section_key,
        locale,
      );
      setSections(updatedDocument.sections);
      setDeleteConfirmKey(null);
      if (editingKey === section.section_key) {
        setEditingKey(null);
        setDraft(null);
      }
      toast.success(`Secțiunea „${section.title}” a fost ștearsă.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Secțiunea nu a putut fi ștearsă.",
      );
    } finally {
      setDeletingKey(null);
    }
  }

  const totalWords = sections.reduce(
    (total, section) => total + countWords(section.content),
    0,
  );
  const latestModified = sections
    .map((section) => new Date(section.last_date_modified))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        {locale !== "ro" ? (
          <div className="rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
            <strong className="font-bold">Editezi o traducere.</strong> Versiunea
            în limba română rămâne cea care obligă juridic; aceasta este
            informativă. O secțiune lăsată neschimbată păstrează textul copiat
            din română.
          </div>
        ) : null}
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/settings"
              className="mb-5 flex w-fit max-w-full items-center rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              ← Setări admin
            </Link>
            <p className="inline-flex max-w-full rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Document legal
            </p>
            <h1 className="mt-3 max-w-3xl break-words font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {document.title}
            </h1>
            <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-muted">
              {description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {LEGAL_LOCALES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    if (item.code === locale) return;
                    setIsLoadingLocale(true);
                    setLocale(item.code);
                  }}
                  disabled={isLoadingLocale}
                  className={`rounded-md border px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                    locale === item.code
                      ? "border-transparent bg-action text-on-action"
                      : "border-subtle hover:bg-surface-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              {isLoadingLocale ? (
                <span className="text-xs text-muted">Se încarcă...</span>
              ) : null}
            </div>
          </div>

          <Link
            href={publicHref}
            target="_blank"
            className="inline-flex min-h-12 w-fit max-w-full items-center justify-center rounded-md border border-subtle bg-surface px-5 py-3 text-center text-sm font-bold leading-tight text-content transition hover:bg-surface-hover"
          >
            Vezi public
          </Link>
        </div>

        <div className="grid min-w-0 gap-5 md:grid-cols-3">
          <EditorMetric
            label="Secțiuni"
            value={String(sections.length)}
            detail="create, editare și ștergere"
          />
          <EditorMetric
            label="Conținut"
            value={String(totalWords)}
            detail="cuvinte aproximative"
          />
          <EditorMetric
            label="Ultima modificare"
            value={
              latestModified ? formatDate(latestModified.toISOString()) : "necunoscut"
            }
            detail="sincronizat cu pagina publică"
          />
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,19rem)]">
          <div className="min-w-0 space-y-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-muted">
                  Secțiuni document
                </p>
                <h2 className="mt-2 break-words font-serif text-3xl font-semibold leading-tight text-content">
                  Editează direct textul final.
                </h2>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                <span className="min-w-0 break-words text-sm leading-6 text-muted sm:text-right">
                  Salvarea se face pe secțiunea deschisă.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding((current) => !current);
                    setDeleteConfirmKey(null);
                  }}
                  className="inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-md bg-action px-4 py-2.5 text-center text-sm font-black leading-tight text-on-action transition hover:bg-action-hover sm:w-auto"
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span>Adaugă secțiune</span>
                </button>
              </div>
            </div>

            {isAdding ? (
              <section className="min-w-0 rounded-xl border border-action bg-surface p-5">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-xs font-black uppercase tracking-[0.18em] text-muted">
                      Secțiune nouă
                    </p>
                    <h3 className="mt-2 break-words font-serif text-2xl font-semibold leading-tight text-content">
                      Adaugă un bloc nou în document.
                    </h3>
                  </div>
                  <span className="min-w-0 break-words text-xs font-bold text-muted sm:text-right">
                    Va fi publicat la finalul listei.
                  </span>
                </div>

                <div className="mt-5 space-y-4 border-t border-subtle pt-5">
                  <label className="block min-w-0">
                    <span className="block min-w-0 break-words text-sm font-bold text-content">
                      Titlu secțiune
                    </span>
                    <input
                      value={newDraft.title}
                      onChange={(event) =>
                        setNewDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Ex. Drepturile utilizatorilor"
                      className="mt-2 h-12 w-full min-w-0 rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
                    />
                  </label>

                  <label className="block min-w-0">
                    <span className="block min-w-0 break-words text-sm font-bold text-content">
                      Conținut secțiune
                    </span>
                    <span className="mt-1 block min-w-0 break-words text-xs leading-5 text-muted">
                      Poți folosi HTML și variabile precum {"{phone}"} sau{" "}
                      {"{DATA_ULTIMEI_ACTUALIZĂRI}"}.
                    </span>
                    <textarea
                      value={newDraft.content}
                      onChange={(event) =>
                        setNewDraft((current) => ({
                          ...current,
                          content: event.target.value,
                        }))
                      }
                      spellCheck={false}
                      placeholder="<h2>Drepturile utilizatorilor</h2><p>...</p>"
                      className="mt-2 min-h-56 w-full min-w-0 resize-y rounded-lg border border-subtle bg-app p-4 font-mono text-sm leading-6 text-content outline-none transition placeholder:text-muted focus:border-action"
                    />
                  </label>

                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={resetNewSection}
                      disabled={isCreating}
                      className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-md border border-subtle bg-app px-5 py-3 text-center text-sm font-bold leading-tight text-content transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                    >
                      Renunță
                    </button>
                    <button
                      type="button"
                      onClick={createSection}
                      disabled={isCreating}
                      className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-md bg-action px-5 py-3 text-center text-sm font-black leading-tight text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                    >
                      {isCreating ? "Se adaugă..." : "Creează secțiunea"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {sections.map((section) => {
              const isEditing = editingKey === section.section_key;
              const isSaving = savingKey === section.section_key;
              const isDeleting = deletingKey === section.section_key;
              const isConfirmingDelete =
                deleteConfirmKey === section.section_key;

              return (
                <article
                  key={section.id}
                  className={`min-w-0 rounded-xl border bg-surface p-5 transition ${
                    isEditing ? "border-action" : "border-subtle"
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="max-w-full break-all rounded-md border border-subtle bg-app px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                          {section.section_key}
                        </span>
                        <span className="min-w-0 break-words text-xs font-bold text-muted">
                          modificat {formatDate(section.last_date_modified)}
                        </span>
                      </div>
                      <h3 className="mt-3 min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-content">
                        {section.title}
                      </h3>
                    </div>

                    {!isEditing ? (
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                        {isConfirmingDelete ? (
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <span className="min-w-0 break-words text-xs font-bold text-danger sm:text-right">
                              Ștergi secțiunea?
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmKey(null)}
                              disabled={isDeleting}
                              className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-md border border-subtle bg-app px-4 py-2 text-center text-xs font-bold leading-tight text-content transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                            >
                              Anulează
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSection(section)}
                              disabled={isDeleting}
                              className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-md bg-danger px-4 py-2 text-center text-xs font-black leading-tight text-danger-soft transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                            >
                              {isDeleting ? "Se șterge..." : "Confirmă"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(section)}
                              disabled={Boolean(savingKey || deletingKey)}
                              className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-md border border-subtle bg-app px-4 py-2.5 text-center text-sm font-bold leading-tight text-content transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                            >
                              Editează
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteConfirmKey(section.section_key);
                              }}
                              disabled={sections.length <= 1 || Boolean(deletingKey)}
                              className="inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-md border border-danger-border bg-danger-soft px-4 py-2.5 text-center text-sm font-bold leading-tight text-danger transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                              Șterge
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {isEditing && draft ? (
                    <div className="mt-5 space-y-4 border-t border-subtle pt-5">
                      <label className="block min-w-0">
                        <span className="block min-w-0 break-words text-sm font-bold text-content">
                          Titlu secțiune
                        </span>
                        <input
                          value={draft.title}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, title: event.target.value }
                                : current,
                            )
                          }
                          className="mt-2 h-12 w-full min-w-0 rounded-lg border border-subtle bg-app px-4 text-sm text-content outline-none transition placeholder:text-muted focus:border-action"
                        />
                      </label>

                      <label className="block min-w-0">
                        <span className="block min-w-0 break-words text-sm font-bold text-content">
                          Conținut secțiune
                        </span>
                        <span className="mt-1 block min-w-0 break-words text-xs leading-5 text-muted">
                          Poți folosi HTML și variabile precum {"{phone}"} sau{" "}
                          {"{DATA_ULTIMEI_ACTUALIZĂRI}"}.
                        </span>
                        <textarea
                          value={draft.content}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? { ...current, content: event.target.value }
                                : current,
                            )
                          }
                          spellCheck={false}
                          className="mt-2 min-h-72 w-full min-w-0 resize-y rounded-lg border border-subtle bg-app p-4 font-mono text-sm leading-6 text-content outline-none transition placeholder:text-muted focus:border-action"
                        />
                      </label>

                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingKey(null);
                            setDraft(null);
                          }}
                          disabled={isSaving}
                          className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-md border border-subtle bg-app px-5 py-3 text-center text-sm font-bold leading-tight text-content transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                        >
                          Renunță
                        </button>
                        <button
                          type="button"
                          onClick={() => saveSection(section)}
                          disabled={isSaving}
                          className="inline-flex min-h-12 w-full min-w-0 items-center justify-center rounded-md bg-action px-5 py-3 text-center text-sm font-black leading-tight text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                        >
                          {isSaving ? "Se salvează..." : "Salvează secțiunea"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="legal-document mt-5 min-w-0 break-words border-t border-subtle pt-5"
                      dangerouslySetInnerHTML={{
                        __html: section.rendered_content,
                      }}
                    />
                  )}
                </article>
              );
            })}
          </div>

          <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
            <section className="min-w-0 rounded-xl border border-subtle bg-surface p-5">
              <p className="break-words text-xs font-black uppercase tracking-[0.16em] text-muted">
                Variabile
              </p>
              <p className="mt-3 min-w-0 break-words text-sm leading-6 text-muted">
                Le folosești în text, iar pagina publică le înlocuiește automat
                cu datele firmei.
              </p>
              <div className="mt-4 flex min-w-0 flex-wrap gap-2">
                {document.available_variables.length > 0 ? (
                  document.available_variables.map((variable) => (
                    <code
                      key={variable}
                      className="max-w-full break-all rounded-md border border-subtle bg-app px-3 py-1 text-xs font-bold text-muted"
                    >
                      {variable}
                    </code>
                  ))
                ) : (
                  <span className="min-w-0 break-words text-sm text-muted">
                    Nu există variabile configurate.
                  </span>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-subtle bg-surface p-5">
              <p className="break-words text-xs font-black uppercase tracking-[0.16em] text-muted">
                Publicare
              </p>
              <p className="mt-3 min-w-0 break-words text-sm leading-6 text-muted">
                Salvarea, adăugarea și ștergerea actualizează direct conținutul
                afișat public.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </AccountStaticShell>
  );
}
