"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { CookieSettingsButton } from "@/components/legal/cookie-consent";
import {
  type ThemePreference,
  useTheme,
} from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import {
  AuthApiError,
  type LanguagePreference,
  requestAccountDeletion,
  updateLanguagePreference,
  updateThemePreference,
  withdrawNewsletterConsent,
} from "@/lib/auth-api";
import {
  getActivePlanBadge,
  getActivePlanMaterialLimit,
  getActivePlanName,
  getActivePlanPriceLabel,
} from "@/lib/account-plan";
import {
  colorThemePresets,
  getColorThemePreset,
  themeColorVariables,
} from "@/lib/theme-colors";
import {
  deleteAllFlashcards,
  deleteAllMaterials,
  deleteStudyProject,
  listArchivedStudyProjects,
  restoreStudyProject,
  type StudyProject,
} from "@/lib/projects-api";
import {
  getStudyPreferences,
  updateStudyPreferences,
  type StudyPreferences,
  type StudyPreferencesUpdate,
} from "@/lib/preferences-api";
import { toast } from "@/lib/toast-store";
import { SettingsPageSkeletonBody } from "@/components/account/account-page-skeletons";

type SettingsTabId =
  | "account"
  | "study"
  | "appearance"
  | "colors"
  | "notifications"
  | "security"
  | "privacy";
type AccountDeletionRequestState = "idle" | "submitting" | "sent";
type SettingsTranslator = ReturnType<typeof useTranslations<"settings">>;

// Ids of the colour presets and variables in src/lib/theme-colors.ts; their
// names and descriptions live in messages/*.json under settings.themePresets
// and settings.colorVariables.
type ColorPresetId = "classic" | "forest" | "ocean" | "rose" | "graphite";
type ColorVariableKey =
  | "app"
  | "sidebar"
  | "surface"
  | "border"
  | "content"
  | "muted"
  | "action"
  | "actionSoft"
  | "successText"
  | "warningText"
  | "infoText";

const settingsSectionChangeEvent = "revizzio:settings-section-change";

const settingsTabIds: SettingsTabId[] = [
  "account",
  "study",
  "appearance",
  "colors",
  "notifications",
  "security",
  "privacy",
];

const defaultSettingsTab: SettingsTabId = "account";

const languageIds: LanguagePreference[] = ["ro", "en", "fr"];
const themeIds: ThemePreference[] = ["light", "dark", "system"];
const studyPaceIds = ["light", "balanced", "exam"] as const;
const aiFeedbackIds = ["short", "guided", "exam"] as const;
const deliveryIds = ["instant", "daily"] as const;

type BooleanPreferenceKey = {
  [K in keyof StudyPreferences]: StudyPreferences[K] extends boolean ? K : never;
}[keyof StudyPreferences];

const studyAutomationPreferenceKey = {
  dailyReview: "automation_daily_review",
  weakConceptAlerts: "automation_weak_concept_alerts",
  weeklyProgress: "automation_weekly_progress",
  inactivityReminder: "automation_inactivity_reminder",
} as const satisfies Record<string, BooleanPreferenceKey>;

type StudyAutomationId = keyof typeof studyAutomationPreferenceKey;
const studyAutomationIds = Object.keys(
  studyAutomationPreferenceKey,
) as StudyAutomationId[];

const notificationChannelPreferenceKey = {
  email: "notify_email_enabled",
  study: "automation_daily_review",
  product: "newsletter_consent",
} as const satisfies Record<string, BooleanPreferenceKey>;

type NotificationChannelId = keyof typeof notificationChannelPreferenceKey;
const notificationChannelIds = Object.keys(
  notificationChannelPreferenceKey,
) as NotificationChannelId[];

const notificationAlertPreferenceKey = {
  projectReady: "notify_alert_project_ready",
  weakConcepts: "automation_weak_concept_alerts",
  billing: "notify_alert_billing",
  weeklyProgress: "automation_weekly_progress",
  inactivityReminder: "automation_inactivity_reminder",
  streakMilestone: "notify_alert_streak_milestone",
} as const satisfies Record<string, BooleanPreferenceKey>;

type NotificationAlertId = keyof typeof notificationAlertPreferenceKey;
const notificationAlertIds = Object.keys(
  notificationAlertPreferenceKey,
) as NotificationAlertId[];

function formatDate(locale: string, value: string | null | undefined, fallback: string) {
  if (!value) return fallback;

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return fallback;
  }
}

function dataExportHref() {
  return "/api/auth/me/data-export";
}

function isSettingsTabId(value: string): value is SettingsTabId {
  return (settingsTabIds as string[]).includes(value);
}

// Distance from the viewport top marking the section considered "current".
// Kept above the first card so the badge still reads the tab name at scroll 0,
// then switches early enough to be seen before the header scrolls away.
const sectionReadingLinePx = 140;

// Tracks which [data-settings-section] block sits at the reading line, so the
// header badge can follow the scroll position instead of only the active tab.
function useActiveSectionLabel(
  containerRef: React.RefObject<HTMLElement | null>,
  activeTab: SettingsTabId,
) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  useEffect(() => {
    let frame: number | null = null;

    function readActiveSection() {
      frame = null;
      const container = containerRef.current;
      if (!container) return;

      const sections = container.querySelectorAll<HTMLElement>(
        "[data-settings-section]",
      );
      let current: string | null = null;
      let currentTop = -Infinity;

      // Pick the section closest to the reading line from above, so cards laid
      // out side by side in a grid resolve by position rather than DOM order.
      for (const section of sections) {
        const { top } = section.getBoundingClientRect();
        if (top <= sectionReadingLinePx && top > currentTop) {
          current = section.dataset.settingsSection ?? null;
          currentTop = top;
        }
      }

      setActiveLabel(current);
    }

    function scheduleRead() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(readActiveSection);
    }

    scheduleRead();
    window.addEventListener("scroll", scheduleRead, { passive: true });
    window.addEventListener("resize", scheduleRead);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleRead);
      window.removeEventListener("resize", scheduleRead);
    };
  }, [activeTab, containerRef]);

  return activeLabel;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "RZ"
  );
}

type PreviewColors = {
  app: string;
  surface: string;
  border: string;
  content: string;
  muted: string;
  action: string;
  actionSoft: string;
  onAction: string;
  hover: string;
  successBg: string;
  successText: string;
  successBorder: string;
  warningBg: string;
  warningText: string;
  warningBorder: string;
  dangerBg: string;
  dangerText: string;
  dangerBorder: string;
  infoBg: string;
  infoText: string;
  infoBorder: string;
};

function getPreviewStyle(colors: PreviewColors): CSSProperties {
  return {
    "--settings-preview-app": colors.app,
    "--settings-preview-surface": colors.surface,
    "--settings-preview-border": colors.border,
    "--settings-preview-content": colors.content,
    "--settings-preview-muted": colors.muted,
    "--settings-preview-action": colors.action,
    "--settings-preview-action-soft": colors.actionSoft,
    "--settings-preview-on-action": colors.onAction,
    "--settings-preview-hover": colors.hover,
    "--settings-preview-success-bg": colors.successBg,
    "--settings-preview-success-text": colors.successText,
    "--settings-preview-success-border": colors.successBorder,
    "--settings-preview-warning-bg": colors.warningBg,
    "--settings-preview-warning-text": colors.warningText,
    "--settings-preview-warning-border": colors.warningBorder,
    "--settings-preview-danger-bg": colors.dangerBg,
    "--settings-preview-danger-text": colors.dangerText,
    "--settings-preview-danger-border": colors.dangerBorder,
    "--settings-preview-info-bg": colors.infoBg,
    "--settings-preview-info-text": colors.infoText,
    "--settings-preview-info-border": colors.infoBorder,
  } as CSSProperties;
}

export function SettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { user, setUser } = useAuth();
  const {
    preference,
    resolvedTheme,
    colorScheme,
    customColors,
    setTheme,
    setColorScheme,
    setCustomColor,
    resetCustomColors,
  } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [activeTab, setActiveTab] =
    useState<SettingsTabId>(defaultSettingsTab);
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<StudyProject[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [archiveActionProjectId, setArchiveActionProjectId] = useState<
    string | null
  >(null);
  const [accountDeletionState, setAccountDeletionState] =
    useState<AccountDeletionRequestState>("idle");
  const [isAccountDeletionModalOpen, setIsAccountDeletionModalOpen] =
    useState(false);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveDeleteCandidate, setArchiveDeleteCandidate] =
    useState<StudyProject | null>(null);
  const [privacyActionState, setPrivacyActionState] = useState<
    "idle" | "materials" | "flashcards" | "newsletter"
  >("idle");
  const [privacyWipeConfirm, setPrivacyWipeConfirm] = useState<
    "materials" | "flashcards" | null
  >(null);
  const deletingArchivedProjectIdsRef = useRef(new Set<string>());
  const [preferences, setPreferences] = useState<StudyPreferences | null>(null);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const selectedPreset = getColorThemePreset(colorScheme);
  const selectedColors = {
    ...selectedPreset.colors[resolvedTheme],
    ...customColors,
  };
  const customColorCount = Object.keys(customColors).length;
  const settingsContentRef = useRef<HTMLElement | null>(null);
  const activeSectionLabel = useActiveSectionLabel(
    settingsContentRef,
    activeTab,
  );
  const selectedStudyPace =
    studyPaceIds.find((id) => id === preferences?.study_pace) ?? "balanced";
  const hasPendingAccountDeletionRequest =
    accountDeletionState === "sent" ||
    Boolean(user?.account_deletion_request_pending);

  const themeLabel = (value: ThemePreference) => t(`theme.${value}`);
  const presetName = (id: string) => t(`themePresets.${id as ColorPresetId}.name`);
  const presetDescription = (id: string) =>
    t(`themePresets.${id as ColorPresetId}.description`);
  const unknownDate = t("dates.unknown");

  useEffect(() => {
    let isMounted = true;

    async function loadPreferences() {
      setIsLoadingPreferences(true);

      try {
        const result = await getStudyPreferences();
        if (isMounted) setPreferences(result);
      } catch (error) {
        if (!isMounted) return;
        toast.error(
          error instanceof Error ? error.message : t("toasts.preferencesLoadFailed"),
        );
      } finally {
        if (isMounted) setIsLoadingPreferences(false);
      }
    }

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [t]);

  async function savePreference(patch: StudyPreferencesUpdate) {
    if (!preferences || isSavingPreferences) return;

    const previousPreferences = preferences;
    setPreferences({ ...preferences, ...patch });
    setIsSavingPreferences(true);

    try {
      const result = await updateStudyPreferences(patch);
      setPreferences(result);
    } catch (error) {
      setPreferences(previousPreferences);
      toast.error(
        error instanceof Error ? error.message : t("toasts.preferenceSaveFailed"),
      );
    } finally {
      setIsSavingPreferences(false);
    }
  }

  useEffect(() => {
    function syncActiveTab() {
      const hashTab = window.location.hash.replace("#", "");
      setActiveTab(isSettingsTabId(hashTab) ? hashTab : defaultSettingsTab);
    }

    function syncActiveTabFromEvent(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      const nextTab = event.detail;
      if (typeof nextTab !== "string" || !isSettingsTabId(nextTab)) return;
      setActiveTab(nextTab);
    }

    const frame = window.requestAnimationFrame(syncActiveTab);
    window.addEventListener("hashchange", syncActiveTab);
    window.addEventListener("popstate", syncActiveTab);
    window.addEventListener(settingsSectionChangeEvent, syncActiveTabFromEvent);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncActiveTab);
      window.removeEventListener("popstate", syncActiveTab);
      window.removeEventListener(
        settingsSectionChangeEvent,
        syncActiveTabFromEvent,
      );
    };
  }, []);

  function selectSettingsTab(nextTab: SettingsTabId) {
    setActiveTab(nextTab);

    const nextHash = `#${nextTab}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  useEffect(() => {
    if (activeTab !== "privacy" || !user) return;

    let isMounted = true;

    async function loadArchivedProjects() {
      setIsLoadingArchive(true);

      try {
        const projects = await listArchivedStudyProjects();
        if (isMounted) {
          setArchivedProjects(projects);
        }
      } catch (error) {
        if (!isMounted) return;
        setArchivedProjects([]);
        toast.error(
          error instanceof Error ? error.message : t("toasts.archiveLoadFailed"),
        );
      } finally {
        if (isMounted) {
          setIsLoadingArchive(false);
        }
      }
    }

    void loadArchivedProjects();

    return () => {
      isMounted = false;
    };
  }, [activeTab, t, user]);

  async function restoreArchivedProject(projectId: string) {
    setArchiveActionProjectId(projectId);
    try {
      await restoreStudyProject(projectId);
      setArchivedProjects((projects) =>
        projects.filter((project) => project.id !== projectId),
      );
      toast.success(t("toasts.projectRestored"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.projectRestoreFailed"),
      );
    } finally {
      setArchiveActionProjectId(null);
    }
  }

  async function deleteArchivedProject(projectId: string) {
    if (deletingArchivedProjectIdsRef.current.has(projectId)) return;

    deletingArchivedProjectIdsRef.current.add(projectId);
    setArchiveActionProjectId(projectId);
    try {
      await deleteStudyProject(projectId);
      setArchivedProjects((projects) =>
        projects.filter((project) => project.id !== projectId),
      );
      setArchiveDeleteCandidate(null);
      toast.success(t("toasts.archivedDeleted"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.projectDeleteFailed"),
      );
    } finally {
      deletingArchivedProjectIdsRef.current.delete(projectId);
      setArchiveActionProjectId(null);
    }
  }

  async function confirmPrivacyWipe(target: "materials" | "flashcards") {
    setPrivacyWipeConfirm(null);
    setPrivacyActionState(target);

    try {
      const result =
        target === "materials"
          ? await deleteAllMaterials()
          : await deleteAllFlashcards();
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.actionFailed"),
      );
    } finally {
      setPrivacyActionState("idle");
    }
  }

  async function withdrawNewsletter() {
    if (privacyActionState !== "idle") return;

    setPrivacyActionState("newsletter");

    try {
      const result = await withdrawNewsletterConsent();
      toast.success(result.message);
    } catch (error) {
      toast.error(
        error instanceof AuthApiError
          ? error.message
          : t("toasts.newsletterWithdrawFailed"),
      );
    } finally {
      setPrivacyActionState("idle");
    }
  }

  function openAccountDeletionModal() {
    if (hasPendingAccountDeletionRequest) {
      setAccountDeletionState("sent");
      toast.info(t("toasts.deletionAlreadyPending"));
      return;
    }

    setIsAccountDeletionModalOpen(true);
  }

  async function submitAccountDeletionRequest() {
    if (accountDeletionState === "submitting" || hasPendingAccountDeletionRequest) {
      return;
    }

    setAccountDeletionState("submitting");
    setIsAccountDeletionModalOpen(false);

    try {
      const result = await requestAccountDeletion();
      toast.success(result.message);
      setAccountDeletionState("sent");
      if (user) {
        setUser({ ...user, account_deletion_request_pending: true });
      }
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 409) {
        toast.success(error.message);
        setAccountDeletionState("sent");
        if (user) {
          setUser({ ...user, account_deletion_request_pending: true });
        }
        return;
      }

      toast.error(
        error instanceof Error ? error.message : t("toasts.deletionRequestFailed"),
      );
      setAccountDeletionState("idle");
    }
  }

  async function saveThemePreference(themePreference: ThemePreference) {
    if (!user || isSavingTheme) return;

    const previousPreference = user.theme_preference;
    setIsSavingTheme(true);
    setTheme(themePreference);
    setUser({ ...user, theme_preference: themePreference });

    try {
      const updatedUser = await updateThemePreference(themePreference);
      setUser(updatedUser);
    } catch {
      setTheme(previousPreference);
      setUser({ ...user, theme_preference: previousPreference });
    } finally {
      setIsSavingTheme(false);
    }
  }

  async function saveLanguagePreference(
    languagePreference: LanguagePreference,
  ) {
    if (!user || isSavingLanguage) return;

    const previousPreference = user.language_preference;
    setIsSavingLanguage(true);
    setLanguage(languagePreference);
    setUser({ ...user, language_preference: languagePreference });

    try {
      const updatedUser = await updateLanguagePreference(languagePreference);
      setUser(updatedUser);
    } catch {
      setLanguage(previousPreference);
      setUser({ ...user, language_preference: previousPreference });
    } finally {
      setIsSavingLanguage(false);
    }
  }

  function renderActiveTab() {
    switch (activeTab) {
      case "account":
        return (
          <div className="space-y-5">
            <section
              data-settings-section={t("account.section")}
              className="rounded-xl border border-subtle bg-surface p-6 sm:p-7"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="relative w-fit">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-action font-serif text-2xl font-semibold text-on-action">
                      {initials(user?.full_name ?? t("account.defaultName"))}
                    </span>
                    <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface text-success">
                      <svg
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m5 13 4 4L19 7"
                        />
                      </svg>
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-3xl font-semibold leading-tight text-content">
                        {user?.full_name ?? t("account.defaultName")}
                      </h2>
                      <span className="inline-flex rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-success">
                        {user?.is_active ? t("account.active") : t("account.unverified")}
                      </span>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted">
                      {user?.email ?? "student@universitate.ro"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 border-t border-subtle pt-5 text-sm sm:grid-cols-2 xl:grid-cols-4 lg:min-w-[520px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <AccountDetail
                    label={t("account.memberSince")}
                    value={formatDate(locale, user?.created_at, unknownDate)}
                  />
                  <AccountDetail
                    label={t("account.interface")}
                    value={themeLabel(preference)}
                  />
                  <AccountDetail
                    label={t("account.language")}
                    value={t(`languages.${user?.language_preference ?? language}.title`)}
                  />
                  <AccountDetail
                    label={t("account.role")}
                    value={
                      user?.role.trim().toLowerCase() === "admin"
                        ? t("account.admin")
                        : t("account.userRole")
                    }
                  />
                </div>
              </div>
            </section>

            <SettingsList
              title={t("account.languageTitle")}
              detail={t("account.languageDetail")}
            >
              {languageIds.map((id) => {
                const isSelected = (user?.language_preference ?? language) === id;
                return (
                  <SettingsOptionButton
                    key={id}
                    disabled={isSavingLanguage}
                    onClick={() => saveLanguagePreference(id)}
                    title={t(`languages.${id}.title`)}
                    description={t(`languages.${id}.description`)}
                  >
                    <ToggleSwitch checked={isSelected} />
                    <OptionState active={isSelected} activeLabel={t("state.active")} />
                  </SettingsOptionButton>
                );
              })}
            </SettingsList>

            <div
              data-settings-section={t("account.planSection")}
              className="grid gap-5 md:grid-cols-3"
            >
              <SettingsMetric
                label={t("account.currentPlan")}
                value={getActivePlanName(user)}
                detail={`${getActivePlanBadge(user)} · ${getActivePlanPriceLabel(user)}`}
              />
              <SettingsMetric
                label={t("account.materialLimit")}
                value={getActivePlanMaterialLimit(user)}
                detail={t("account.materialLimitDetail")}
              />
              <SettingsMetric
                label={t("account.dataProtection")}
                value={t("account.secured")}
                detail={t("account.securedDetail")}
              />
            </div>
          </div>
        );

      case "study":
        return (
          <div className="space-y-5">
            <section
              data-settings-section={t("study.paceSection")}
              className="rounded-xl border border-subtle bg-surface p-6"
            >
              <div>
                <SectionLabel>{t("study.paceSection")}</SectionLabel>
                <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight text-content">
                  {t(`studyPace.${selectedStudyPace}.title`)}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                  {t(`studyPace.${selectedStudyPace}.description`)}
                </p>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <SettingsList title={t("study.choosePace")}>
                {studyPaceIds.map((id) => {
                  const isSelected = id === preferences?.study_pace;
                  return (
                    <SettingsOptionButton
                      key={id}
                      disabled={isLoadingPreferences || isSavingPreferences}
                      title={t(`studyPace.${id}.title`)}
                      description={t(`studyPace.${id}.description`)}
                      onClick={() => void savePreference({ study_pace: id })}
                    >
                      <ToggleSwitch checked={isSelected} />
                      <OptionState active={isSelected} activeLabel={t("state.active")} />
                    </SettingsOptionButton>
                  );
                })}
              </SettingsList>

              <SettingsList title={t("study.aiFeedback")}>
                {aiFeedbackIds.map((id) => {
                  const isSelected = id === preferences?.ai_feedback_style;
                  return (
                    <SettingsOptionButton
                      key={id}
                      disabled={isLoadingPreferences || isSavingPreferences}
                      title={t(`aiFeedback.${id}.title`)}
                      description={t(`aiFeedback.${id}.description`)}
                      onClick={() => void savePreference({ ai_feedback_style: id })}
                    >
                      <ToggleSwitch checked={isSelected} />
                      <OptionState active={isSelected} activeLabel={t("state.active")} />
                    </SettingsOptionButton>
                  );
                })}
              </SettingsList>
            </div>

            <SettingsList title={t("study.automations")}>
              {studyAutomationIds.map((id) => {
                const key = studyAutomationPreferenceKey[id];
                const isActive = Boolean(preferences?.[key]);
                return (
                  <SettingsOptionButton
                    key={id}
                    disabled={isLoadingPreferences || isSavingPreferences}
                    title={t(`automation.${id}.title`)}
                    description={t(`automation.${id}.description`)}
                    onClick={() => void savePreference({ [key]: !isActive })}
                  >
                    <ToggleSwitch checked={isActive} />
                    <OptionState active={isActive} />
                  </SettingsOptionButton>
                );
              })}
            </SettingsList>
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-5">
            <div
              data-settings-section={t("appearance.stateSection")}
              className="grid gap-5 md:grid-cols-3"
            >
              <SettingsMetric
                label={t("appearance.activeMode")}
                value={themeLabel(preference)}
                detail={t("appearance.displayedAs", { mode: themeLabel(resolvedTheme) })}
              />
              <SettingsMetric
                label={t("appearance.palette")}
                value={presetName(selectedPreset.id)}
                detail={t("appearance.paletteDetail")}
              />
              <SettingsMetric
                label={t("appearance.sync")}
                value={isSavingTheme ? t("appearance.saving") : t("appearance.accountPreference")}
                detail={t("appearance.syncDetail")}
              />
            </div>

            <SettingsList title={t("appearance.displayMode")}>
              {themeIds.map((id) => {
                const isSelected = (user?.theme_preference ?? preference) === id;
                return (
                  <SettingsOptionButton
                    key={id}
                    disabled={isSavingTheme}
                    onClick={() => saveThemePreference(id)}
                    title={t(`themeOptions.${id}.title`)}
                    description={t(`themeOptions.${id}.description`)}
                  >
                    <ToggleSwitch checked={isSelected} />
                    <OptionState active={isSelected} activeLabel={t("state.active")} />
                  </SettingsOptionButton>
                );
              })}
            </SettingsList>
          </div>
        );

      case "colors":
        return (
          <div className="space-y-5">
            <section
              data-settings-section={t("colors.currentSection")}
              className="rounded-xl border border-subtle bg-surface p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <SectionLabel>{t("colors.currentSection")}</SectionLabel>
                  <p className="mt-2 font-serif text-2xl font-semibold text-content">
                    {presetName(selectedPreset.id)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {t("colors.customCount", { count: customColorCount })}
                  </p>
                </div>

                {customColorCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetCustomColors}
                    className="w-fit rounded-md border border-danger-border bg-danger-soft px-4 py-2 text-xs font-bold text-danger transition hover:opacity-80"
                  >
                    {t("colors.reset")}
                  </button>
                ) : null}
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <SettingsList title={t("colors.presets")}>
                {colorThemePresets.map((preset) => {
                  const isSelected = preset.id === colorScheme;
                  return (
                    <SettingsOptionButton
                      key={preset.id}
                      title={presetName(preset.id)}
                      description={presetDescription(preset.id)}
                      onClick={() => setColorScheme(preset.id)}
                    >
                      <span className="flex items-center gap-2">
                        {preset.preview.map((color) => (
                          <span
                            key={color}
                            className="h-6 w-6 rounded-full border border-subtle"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <ToggleSwitch checked={isSelected} />
                      <OptionState active={isSelected} activeLabel={t("state.active")} />
                    </SettingsOptionButton>
                  );
                })}
              </SettingsList>

              <ThemePreview colors={selectedColors} t={t} />
            </div>

            <SettingsList
              title={t("colors.editor")}
              detail={t("colors.editorDetail")}
              meta={t("colors.customMeta", { count: customColorCount })}
            >
              {themeColorVariables.map((variable) => (
                <ColorControl
                  key={variable.key}
                  label={t(`colorVariables.${variable.key as ColorVariableKey}.label`)}
                  description={t(
                    `colorVariables.${variable.key as ColorVariableKey}.description`,
                  )}
                  value={selectedColors[variable.key]}
                  isCustom={customColors[variable.key] !== undefined}
                  onChange={(value) => setCustomColor(variable.key, value)}
                  t={t}
                />
              ))}
            </SettingsList>
          </div>
        );

      case "notifications": {
        const activeChannelCount = notificationChannelIds.filter(
          (id) => preferences?.[notificationChannelPreferenceKey[id]],
        ).length;
        const activeAlertCount = notificationAlertIds.filter(
          (id) => preferences?.[notificationAlertPreferenceKey[id]],
        ).length;

        return (
          <div className="space-y-5">
            <div
              data-settings-section={t("notifications.summarySection")}
              className="grid gap-5 md:grid-cols-3"
            >
              <SettingsMetric
                label={t("notifications.frequency")}
                value={
                  preferences?.notify_frequency === "instant"
                    ? t("delivery.instant.title")
                    : t("notifications.daily")
                }
                detail={t("notifications.frequencyDetail")}
              />
              <SettingsMetric
                label={t("notifications.activeChannels")}
                value={`${activeChannelCount}/${notificationChannelIds.length}`}
                detail={t("notifications.channelsDetail")}
              />
              <SettingsMetric
                label={t("notifications.events")}
                value={`${activeAlertCount}/${notificationAlertIds.length}`}
                detail={t("notifications.eventsDetail")}
              />
            </div>

            <SettingsList title={t("notifications.delivery")}>
              {deliveryIds.map((id) => {
                const isSelected = preferences?.notify_frequency === id;
                return (
                  <SettingsOptionButton
                    key={id}
                    disabled={isLoadingPreferences || isSavingPreferences}
                    title={t(`delivery.${id}.title`)}
                    description={t(`delivery.${id}.description`)}
                    onClick={() => void savePreference({ notify_frequency: id })}
                  >
                    <ToggleSwitch checked={isSelected} />
                    <OptionState active={isSelected} activeLabel={t("state.active")} />
                  </SettingsOptionButton>
                );
              })}
            </SettingsList>

            <div className="grid gap-5 lg:grid-cols-2">
              <SettingsList title={t("notifications.channels")}>
                {notificationChannelIds.map((id) => {
                  const key = notificationChannelPreferenceKey[id];
                  const isActive = Boolean(preferences?.[key]);
                  return (
                    <SettingsOptionButton
                      key={id}
                      disabled={isLoadingPreferences || isSavingPreferences}
                      title={t(`channels.${id}.title`)}
                      description={t(`channels.${id}.description`)}
                      onClick={() => void savePreference({ [key]: !isActive })}
                    >
                      <ToggleSwitch checked={isActive} />
                      <OptionState active={isActive} />
                    </SettingsOptionButton>
                  );
                })}
              </SettingsList>

              <SettingsList title={t("notifications.events")}>
                {notificationAlertIds.map((id) => {
                  const key = notificationAlertPreferenceKey[id];
                  const isActive = Boolean(preferences?.[key]);
                  return (
                    <SettingsOptionButton
                      key={id}
                      disabled={isLoadingPreferences || isSavingPreferences}
                      title={t(`alerts.${id}.title`)}
                      description={t(`alerts.${id}.description`)}
                      onClick={() => void savePreference({ [key]: !isActive })}
                    >
                      <ToggleSwitch checked={isActive} />
                      <OptionState active={isActive} activeLabel={t("state.active")} />
                    </SettingsOptionButton>
                  );
                })}
              </SettingsList>
            </div>
          </div>
        );
      }

      case "security":
        return (
          <div className="space-y-5">
            <SettingsList title={t("security.actions")}>
              <SettingsActionRow
                title={t("security.changeName")}
                description={t("security.changeNameDesc")}
              >
                <Link href="/settings/schimba-numele" className="group inline-flex">
                  <ActionPill>{t("security.change")}</ActionPill>
                </Link>
              </SettingsActionRow>
              <SettingsActionRow
                title={t("security.changeEmail")}
                description={t("security.changeEmailDesc")}
              >
                <Link href="/settings/schimba-email" className="group inline-flex">
                  <ActionPill>{t("security.change")}</ActionPill>
                </Link>
              </SettingsActionRow>
              <SettingsActionRow
                title={t("security.changePassword")}
                description={t("security.changePasswordDesc")}
              >
                <Link href="/settings/schimba-parola" className="group inline-flex">
                  <ActionPill>{t("security.change")}</ActionPill>
                </Link>
              </SettingsActionRow>
              <SettingsOptionButton
                title={t("security.deleteAccount")}
                description={t("security.deleteAccountDesc")}
                disabled={
                  accountDeletionState === "submitting" ||
                  hasPendingAccountDeletionRequest
                }
                onClick={openAccountDeletionModal}
                tone="danger"
              >
                <ActionPill tone="danger">
                  {accountDeletionState === "submitting"
                    ? t("security.sending")
                    : hasPendingAccountDeletionRequest
                      ? t("security.requested")
                      : t("security.request")}
                </ActionPill>
              </SettingsOptionButton>
            </SettingsList>
          </div>
        );

      case "privacy":
        return (
          <div className="space-y-5">
            <SettingsList title={t("privacy.section")}>
              <SettingsActionRow
                title={t("privacy.download")}
                description={t("privacy.downloadDesc")}
              >
                <a
                  href={dataExportHref()}
                  className="w-fit rounded-md border border-action px-4 py-2 text-xs font-bold transition hover:bg-action hover:text-on-action"
                >
                  {t("privacy.downloadAction")}
                </a>
              </SettingsActionRow>

              <SettingsOptionButton
                title={t("privacy.deleteMaterials")}
                description={t("privacy.deleteMaterialsDesc")}
                disabled={privacyActionState !== "idle"}
                onClick={() => setPrivacyWipeConfirm("materials")}
              >
                <ActionPill tone="danger">
                  {privacyActionState === "materials"
                    ? t("privacy.deleting")
                    : t("privacy.delete")}
                </ActionPill>
              </SettingsOptionButton>

              <SettingsOptionButton
                title={t("privacy.deleteFlashcards")}
                description={t("privacy.deleteFlashcardsDesc")}
                disabled={privacyActionState !== "idle"}
                onClick={() => setPrivacyWipeConfirm("flashcards")}
              >
                <ActionPill tone="danger">
                  {privacyActionState === "flashcards"
                    ? t("privacy.deleting")
                    : t("privacy.delete")}
                </ActionPill>
              </SettingsOptionButton>

              <SettingsOptionButton
                title={t("privacy.withdrawNewsletter")}
                description={t("privacy.withdrawNewsletterDesc")}
                disabled={privacyActionState !== "idle"}
                onClick={() => void withdrawNewsletter()}
              >
                <ActionPill>
                  {privacyActionState === "newsletter"
                    ? t("privacy.withdrawing")
                    : t("privacy.withdraw")}
                </ActionPill>
              </SettingsOptionButton>

              <SettingsActionRow
                title={t("privacy.cookies")}
                description={t("privacy.cookiesDesc")}
              >
                <CookieSettingsButton className="w-fit rounded-md bg-action px-4 py-2 text-xs font-bold text-on-action transition hover:bg-action-hover" />
              </SettingsActionRow>

              <SettingsActionRow
                title={t("privacy.archive")}
                description={t("privacy.archiveDesc")}
              >
                <button
                  type="button"
                  onClick={() => setIsArchiveModalOpen(true)}
                  className="group inline-flex w-fit items-center gap-2 rounded-md border border-action px-4 py-2 text-xs font-bold transition hover:bg-action hover:text-on-action"
                >
                  {t("privacy.viewArchive")}
                  <span className="rounded-md border border-subtle bg-surface px-2 py-0.5 text-[10px] text-content transition">
                    {archivedProjects.length}
                  </span>
                </button>
              </SettingsActionRow>
            </SettingsList>

            {isArchiveModalOpen ? (
              <ArchivedProjectsModal
                projects={archivedProjects}
                isLoading={isLoadingArchive}
                actionProjectId={archiveActionProjectId}
                onClose={() => setIsArchiveModalOpen(false)}
                onRestore={(projectId) => void restoreArchivedProject(projectId)}
                onDelete={(project) => setArchiveDeleteCandidate(project)}
                t={t}
                locale={locale}
              />
            ) : null}

            {archiveDeleteCandidate ? (
              <ArchiveDeleteModal
                project={archiveDeleteCandidate}
                isDeleting={
                  archiveActionProjectId === archiveDeleteCandidate.id
                }
                onCancel={() => setArchiveDeleteCandidate(null)}
                onConfirm={() =>
                  void deleteArchivedProject(archiveDeleteCandidate.id)
                }
                t={t}
              />
            ) : null}

            {privacyWipeConfirm ? (
              <PrivacyWipeConfirmModal
                target={privacyWipeConfirm}
                isProcessing={privacyActionState === privacyWipeConfirm}
                onCancel={() => setPrivacyWipeConfirm(null)}
                onConfirm={() => void confirmPrivacyWipe(privacyWipeConfirm)}
                t={t}
              />
            ) : null}
          </div>
        );
    }
  }

  return (
    <AccountStaticShell
      activePage="settings"
      loadingBody={<SettingsPageSkeletonBody />}
      settingsSection={activeTab}
      onSettingsSectionChange={selectSettingsTab}
    >
      <section className="space-y-7" ref={settingsContentRef}>
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              {t(`tabs.${activeTab}.eyebrow`)}
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              {t(`tabs.${activeTab}.title`)}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              {t(`tabs.${activeTab}.description`)}
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-xs text-muted">
            <span>{t("header.section")}</span>
            <span className="font-black text-content">
              {activeSectionLabel ?? t(`tabs.${activeTab}.label`)}
            </span>
          </div>
        </div>

        {renderActiveTab()}

        {isAccountDeletionModalOpen ? (
          <AccountDeletionRequestModal
            isSubmitting={accountDeletionState === "submitting"}
            onCancel={() => setIsAccountDeletionModalOpen(false)}
            onConfirm={() => void submitAccountDeletionRequest()}
            t={t}
          />
        ) : null}
      </section>
    </AccountStaticShell>
  );
}

function AccountDeletionRequestModal({
  isSubmitting,
  onCancel,
  onConfirm,
  t,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: SettingsTranslator;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-deletion-request-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-danger-border bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-danger">
          {t("deletionModal.eyebrow")}
        </p>
        <h2
          id="account-deletion-request-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          {t("deletionModal.title")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t("deletionModal.description")}
        </p>
        <div className="mt-5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
          {t("deletionModal.warning")}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            {t("modals.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-on-action transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? t("deletionModal.submitting") : t("deletionModal.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchivedProjectsModal({
  projects,
  isLoading,
  actionProjectId,
  onClose,
  onRestore,
  onDelete,
  t,
  locale,
}: {
  projects: StudyProject[];
  isLoading: boolean;
  actionProjectId: string | null;
  onClose: () => void;
  onRestore: (projectId: string) => void;
  onDelete: (project: StudyProject) => void;
  t: SettingsTranslator;
  locale: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-projects-title"
    >
      <div className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-subtle bg-surface shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-4 border-b border-subtle p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-warning">
              {t("archiveModal.eyebrow")}
            </p>
            <h2
              id="archive-projects-title"
              className="mt-2 font-serif text-3xl font-semibold leading-tight"
            >
              {t("archiveModal.title")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t("archiveModal.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-subtle transition hover:bg-surface-hover"
            aria-label={t("archiveModal.close")}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-6">
          {isLoading ? (
            <div className="py-8 text-sm font-semibold text-muted">
              {t("archiveModal.loading")}
            </div>
          ) : projects.length ? (
            <div className="divide-y divide-subtle">
              {projects.map((project) => {
                const isBusy = actionProjectId === project.id;
                return (
                  <div
                    key={project.id}
                    className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-black">
                        {project.name}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">
                        {t("archiveModal.meta", {
                          subject: project.subject_name,
                          count: project.file_count,
                          date: formatDate(
                            locale,
                            project.archived_at,
                            t("dates.unknownArchive"),
                          ),
                        })}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRestore(project.id)}
                        className="rounded-md border border-action px-4 py-2 text-xs font-bold transition hover:bg-action hover:text-on-action disabled:cursor-wait disabled:opacity-60"
                      >
                        {t("archiveModal.restore")}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onDelete(project)}
                        className="rounded-md border border-danger-border px-4 py-2 text-xs font-bold text-danger transition hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
                      >
                        {t("privacy.delete")}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-sm font-semibold text-muted">
              {t("archiveModal.empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArchiveDeleteModal({
  project,
  isDeleting,
  onCancel,
  onConfirm,
  t,
}: {
  project: StudyProject;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: SettingsTranslator;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-delete-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-danger">
          {t("modals.permanentDeletion")}
        </p>
        <h2
          id="archive-delete-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight"
        >
          {t("archiveDelete.title", { name: project.name })}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t("archiveDelete.description")}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            {t("modals.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-on-action transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? t("modals.deleting") : t("archiveDelete.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrivacyWipeConfirmModal({
  target,
  isProcessing,
  onCancel,
  onConfirm,
  t,
}: {
  target: "materials" | "flashcards";
  isProcessing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  t: SettingsTranslator;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-wipe-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-danger">
          {t("modals.permanentDeletion")}
        </p>
        <h2
          id="privacy-wipe-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight"
        >
          {t(`wipe.${target}.title`)}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t(`wipe.${target}.description`)}
        </p>
        <div className="mt-5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-semibold leading-6 text-warning">
          {t("wipe.warning")}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            {t("modals.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-on-action transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isProcessing ? t("modals.deleting") : t(`wipe.${target}.confirm`)}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-semibold text-content">{value}</p>
    </div>
  );
}

function SettingsMetric({
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
      {children}
    </p>
  );
}

function SettingsList({
  title,
  detail,
  meta,
  children,
}: {
  title: string;
  detail?: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-settings-section={title}
      className="rounded-xl border border-subtle bg-surface p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionLabel>{title}</SectionLabel>
          {detail ? (
            <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
          ) : null}
        </div>
        {meta ? (
          <span className="text-xs font-bold text-muted">{meta}</span>
        ) : null}
      </div>
      <div className="mt-4 divide-y divide-subtle border-y border-subtle">
        {children}
      </div>
    </section>
  );
}

function SettingsOptionButton({
  title,
  description,
  children,
  onClick,
  disabled = false,
  tone = "default",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group -mx-3 grid w-[calc(100%+1.5rem)] gap-3 rounded-xl px-3 py-4 text-left transition disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[1fr_auto] sm:items-center ${
        tone === "danger" ? "hover:bg-danger-soft" : "hover:bg-surface-hover"
      }`}
    >
      <span className={tone === "danger" ? "text-danger" : undefined}>
        <span className="block text-sm font-black">{title}</span>
        <span
          className={`mt-1 block text-xs leading-5 ${
            tone === "danger" ? "text-danger/80" : "text-muted"
          }`}
        >
          {description}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3 sm:justify-end">
        {children}
      </span>
    </button>
  );
}

function SettingsActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="group -mx-3 grid w-[calc(100%+1.5rem)] gap-3 rounded-xl px-3 py-4 transition hover:bg-surface-hover sm:grid-cols-[1fr_auto] sm:items-center">
      <span>
        <span className="block text-sm font-black">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
      <span className="flex flex-wrap gap-2 sm:justify-end">{children}</span>
    </div>
  );
}

function OptionState({
  active,
  activeLabel,
}: {
  active: boolean;
  activeLabel?: string;
}) {
  const t = useTranslations("settings.state");
  return (
    <span className="text-xs font-black text-muted group-hover:text-content">
      {active ? (activeLabel ?? t("on")) : t("off")}
    </span>
  );
}

function ToggleSwitch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border p-0.5 transition ${
        checked
          ? "border-success-border bg-success-soft"
          : "border-subtle bg-surface"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-5 bg-success" : "translate-x-0 bg-muted/55"
        }`}
      />
    </span>
  );
}

function ActionPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-md px-4 py-2 text-xs font-black transition group-hover:translate-x-0.5 ${
        tone === "danger"
          ? "bg-danger-soft text-danger"
          : "bg-action text-on-action"
      }`}
    >
      {children}
      <span aria-hidden="true">→</span>
    </span>
  );
}

function ThemePreview({
  colors,
  t,
}: {
  colors: PreviewColors;
  t: SettingsTranslator;
}) {
  const rows = [
    [t("colors.previewStatus"), t("colors.previewStatusValue"), "success"],
    [t("colors.previewChat"), t("colors.previewChatValue"), "info"],
    [t("colors.previewWarn"), t("colors.previewWarnValue"), "warning"],
  ] as const;

  return (
    <section
      className="rounded-xl border border-subtle bg-surface p-5"
      style={getPreviewStyle(colors)}
    >
      <SectionLabel>{t("colors.preview")}</SectionLabel>
      <div className="mt-4 rounded-xl border border-[var(--settings-preview-border)] bg-[var(--settings-preview-app)] p-5 text-[var(--settings-preview-content)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--settings-preview-border)] pb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--settings-preview-muted)]">
              {t("colors.previewCourse")}
            </p>
            <p className="mt-1 font-serif text-3xl font-semibold leading-tight">
              {t("colors.previewCourseName")}
            </p>
          </div>
          <span className="rounded-md bg-[var(--settings-preview-action)] px-4 py-2 text-xs font-black text-[var(--settings-preview-on-action)]">
            {t("colors.previewContinue")}
          </span>
        </div>

        <div className="divide-y divide-[var(--settings-preview-border)]">
          {rows.map(([label, value, tone]) => (
            <div
              key={label}
              className="grid gap-3 py-4 text-sm sm:grid-cols-[0.3fr_1fr] sm:items-center"
            >
              <span
                className={
                  tone === "success"
                    ? "font-black text-[var(--settings-preview-success-text)]"
                    : tone === "warning"
                      ? "font-black text-[var(--settings-preview-warning-text)]"
                      : "font-black text-[var(--settings-preview-info-text)]"
                }
              >
                {label}
              </span>
              <span className="text-[var(--settings-preview-muted)]">
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="pt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[var(--settings-preview-hover)]">
            <div className="h-full w-[72%] rounded-full bg-[var(--settings-preview-action)]" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ColorControl({
  label,
  description,
  value,
  isCustom,
  onChange,
  t,
}: {
  label: string;
  description: string;
  value: string;
  isCustom: boolean;
  onChange: (value: string) => void;
  t: SettingsTranslator;
}) {
  return (
    <label className="group -mx-3 grid w-[calc(100%+1.5rem)] cursor-pointer gap-3 rounded-xl px-3 py-4 transition hover:bg-surface-hover sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-subtle"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-12 -translate-x-1 -translate-y-1 cursor-pointer opacity-0"
          aria-label={t("colors.changeColor", { label })}
        />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-black">
          {label}
          {isCustom ? (
            <span className="rounded-md bg-warning-soft px-2 py-0.5 text-[10px] text-warning">
              {t("colors.custom")}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
      <span className="flex items-center gap-3 sm:justify-end">
        <span className="rounded-md border border-subtle bg-surface px-3 py-1.5 text-xs font-black text-content transition group-hover:border-content">
          {t("colors.modify")}
        </span>
      </span>
    </label>
  );
}
