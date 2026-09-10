"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { applyActiveProjectSelection } from "@/lib/projects-api";
import { toast } from "@/lib/toast-store";

/** The fields this modal needs; the dashboard passes its own view model. */
export type SlotSelectableProject = {
  id: string;
  name: string;
  subjectName: string;
  updatedAt: string;
  isDeactivated: boolean;
};

type ProjectSlotsModalProps<TProject extends SlotSelectableProject> = {
  projects: TProject[];
  slots: number;
  planName: string;
  /** Ids to mark deactivated, and ids to mark active, after a successful save. */
  onResolved: (result: { deactivated: string[]; activated: string[] }) => void;
};

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

/**
 * Shown when the account holds more active projects than the plan allows.
 *
 * Deliberately has no dismiss control: the API refuses every study route while
 * the account is over its slot count, so letting the modal be closed would only
 * produce an app that looks usable and fails on every click.
 */
export function ProjectSlotsModal<TProject extends SlotSelectableProject>({
  projects,
  slots,
  planName,
  onResolved,
}: ProjectSlotsModalProps<TProject>) {
  const t = useTranslations("projectSlots");
  // Pre-select the most recently updated projects: the likely intent, and it
  // means a user who just wants out can confirm immediately.
  const ordered = useMemo(
    () =>
      [...projects].sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime(),
      ),
    [projects],
  );
  const [keptIds, setKeptIds] = useState<string[]>(() =>
    ordered.slice(0, slots).map((project) => project.id),
  );
  const [isSaving, setIsSaving] = useState(false);

  const remaining = slots - keptIds.length;
  const deactivatedCount = ordered.length - keptIds.length;

  function toggle(projectId: string) {
    setKeptIds((current) => {
      if (current.includes(projectId)) {
        return current.filter((id) => id !== projectId);
      }
      if (current.length >= slots) return current;
      return [...current, projectId];
    });
  }

  async function confirm() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // One request for the whole selection: per-project calls meant dozens of
      // round trips after a downgrade, each re-reading the full study pack.
      await applyActiveProjectSelection(keptIds);

      onResolved({
        deactivated: ordered
          .filter((project) => !keptIds.includes(project.id))
          .map((project) => project.id),
        activated: ordered
          .filter((project) => keptIds.includes(project.id))
          .map((project) => project.id),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("nuAmPututSalvaSelectia"),
      );
      setIsSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-slots-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 py-8"
    >
      <section className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-md border border-subtle bg-surface text-content shadow-2xl shadow-black/30">
        <div className="shrink-0 border-b border-subtle p-6">
          <p className="inline-flex rounded-md border border-warning-border bg-warning-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-warning">
            {t("planulSASchimbat")}
          </p>
          <h2
            id="project-slots-title"
            className="mt-4 font-serif text-2xl font-semibold leading-tight sm:text-3xl"
          >
            {t("alegeCeProiecteRamanActive")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Planul {planName} permite{" "}
            <strong className="text-content">
              {slots} {slots === 1 ? t("proiectActiv") : t("proiecteActive")}
            </strong>
            {t("iarTuAi")} {ordered.length}{t("restulRamanInContSi")}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <ul className="space-y-2">
            {ordered.map((project) => {
              const isKept = keptIds.includes(project.id);
              const isDisabled = !isKept && keptIds.length >= slots;

              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => toggle(project.id)}
                    disabled={isSaving || isDisabled}
                    aria-pressed={isKept}
                    className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition ${
                      isKept
                        ? "border-action bg-action-soft"
                        : isDisabled
                          ? "cursor-not-allowed border-subtle opacity-45"
                          : "border-subtle hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        isKept
                          ? "border-action bg-action text-on-action"
                          : "border-subtle"
                      }`}
                    >
                      {isKept ? <CheckIcon /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {project.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {project.subjectName}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-subtle p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted">
              {remaining > 0
                ? t("potiAlegeIncaRemaining", { remaining })
                : t("aiFolositToateSloturile")}
              {deactivatedCount > 0
                ? ` ${deactivatedCount} ${
                    deactivatedCount === 1
                      ? t("proiectVaFiDezactivat")
                      : t("proiecteVorFiDezactivate")
                  }.`
                : ""}
            </p>
            <button
              type="button"
              onClick={confirm}
              disabled={isSaving || keptIds.length === 0}
              className="inline-flex cursor-pointer items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? t("seSalveaza") : t("confirmaSelectia")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
