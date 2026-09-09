"use client";

import { useOpenCloseTransition } from "@/components/use-open-close-transition";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AccountMobileTopBar } from "@/components/account/account-mobile-top-bar";
import { AccountSkeleton } from "@/components/account/account-skeleton";
import { ProjectTabSkeleton } from "@/components/account/project-tab-skeletons";
import { ProjectSlotsModal } from "@/components/account/project-slots-modal";
import { QuizConfigModal } from "@/components/account/quiz-config-modal";
import {
  QuizClozeAnswer,
  QuizMatchingAnswer,
  QuizOrderingAnswer,
} from "@/components/account/quiz-interactive-answers";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import {
  ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
  AccountSidebarTooltip,
  getAccountSidebarActionClass,
  getAccountSidebarActionLabelClass,
  getAccountSidebarChevronClass,
  getAccountSidebarHeaderClass,
  getAccountSidebarItemClass,
  getAccountSidebarLabelClass,
  getAccountSidebarProjectClass,
  getAccountSidebarScrollClass,
  getAccountSidebarShellClass,
} from "@/components/account/account-sidebar-ui";
import { useLanguage } from "@/components/language-provider";
import {
  getCurrentUser,
  type AuthUserPlan,
  type LanguagePreference,
} from "@/lib/auth-api";
import { getUsage, type Usage } from "@/lib/usage-api";
import {
  archiveStudyProject,
  cancelStudyProjectGeneration,
  cancelStudyProjectPrepare,
  chatWithStudyProjectAi,
  completeQuiz,
  createManualStudyProjectFlashcard,
  createQuizMistakeFlashcard,
  createSummaryHighlight,
  createSummaryNote,
  deleteAllSummaryHighlights,
  deleteStudyProject,
  deleteSummaryHighlight,
  deleteSummaryNote,
  explainStudyProjectFlashcardSelection,
  explainStudyProjectSummarySelection,
  generateStudyProjectQuiz,
  getStudyProject,
  activateStudyProject,
  deactivateStudyProject,
  getActiveProjectSlots,
  listStudyProjects,
  prepareStudyProject,
  renameStudyProject,
  setFlashcardReview,
  updateSummaryHighlightColor,
  updateSummaryNote,
  type QuizGenerationConfig,
  type QuizCompletionResult,
  type StudyProjectQuizOption,
  type StudyProject as ApiStudyProject,
  type StudyProjectPrepareResponse,
  type SummaryHighlightColor as ApiSummaryHighlightColor,
} from "@/lib/projects-api";
import { toast } from "@/lib/toast-store";

type ViewId = "home" | "project" | "new";
export type TabId =
  | "rezumat"
  | "flashcards"
  | "quiz"
  | "strategii"
  | "progres"
  | "chat";
export type FlashcardPanelMode = "packages" | "create";
type GenerationState = "form" | "generating" | "done";
type SidebarGroupId = "settings" | "billing";
type StudyFlashcardTone = "success" | "warning" | "info" | "danger";

type StudyFlashcardCard = {
  id: string;
  flashcardId: string;
  topic: string;
  question: string;
  answer: string;
  tone: StudyFlashcardTone;
  sourceQuestionId?: string;
  questionImage?: string;
  category?: string;
  difficulty?: string;
  review: boolean;
};

type StudyProject = {
  id: string;
  name: string;
  subjectName: string;
  institutionName: string;
  status: ApiStudyProject["status"];
  errorMessage: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  isDeactivated: boolean;
  createdAt: string;
  updatedAt: string;
  meta: string;
  flashcardsDue: number;
  flashcardsTotal: number;
  progress: number;
  summary: ApiStudyProject["summary"];
  keywords: ApiStudyProject["keywords"];
  flashcards: ApiStudyProject["flashcards"];
  quizzes: ApiStudyProject["quizzes"];
  quizMistakeFlashcards: StudyFlashcardCard[];
  manualFlashcards: StudyFlashcardCard[];
  summaryHighlights: UserSummaryHighlight[];
  summaryNotes: UserSummaryNote[];
  strategies: Array<{
    title: string;
    description: string;
  }>;
};

type UploadedFile = {
  name: string;
  size: number;
  file: File;
};

type ProjectUploadPlanLimits = {
  planName: string;
  monthlyProjects: number;
  filesPerProject: number;
  monthlyMaterials: number;
  monthlyPageLimit: number;
  fileSizeMb: number;
  projectSizeMb: number;
  estimatedPages: number;
  allowScannedDocuments: boolean;
};

type QuizPlanLimits = {
  quizQuestionsPerQuiz: number;
  quizzesPerProject: number;
};

type QuizPlanLimitSnapshot = QuizPlanLimits & {
  userId: string;
};

const initialProjects: StudyProject[] = [];
const AI_ACCESS_UNAVAILABLE_MESSAGE =
  "Funcționalitatea AI nu este disponibilă pe planul curent.";
const AI_ACCESS_UPGRADE_MESSAGE =
  "Alege un plan care include Chat AI, explicații AI și întrebări pe text selectat.";

function hasPlanAiAccess(plan: AuthUserPlan | null | undefined) {
  return Boolean(plan?.ai_chat_enabled);
}

function isAdminRole(role: string | undefined) {
  return role?.trim().toLowerCase() === "admin";
}

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "rezumat", label: "Rezumat" },
  { id: "flashcards", label: "Flashcard-uri" },
  { id: "strategii", label: "Strategii" },
  { id: "quiz", label: "Quiz-uri" },
  { id: "progres", label: "Progres" },
  { id: "chat", label: "Chat AI" },
];

const tabRoutes: Record<TabId, string> = {
  rezumat: "/myaccount/rezumat",
  flashcards: "/myaccount/flashcarduri",
  quiz: "/myaccount/quizuri",
  strategii: "/myaccount/strategii",
  progres: "/myaccount/progres",
  chat: "/myaccount/chat-ai",
};

const sidebarSettingsItems = [
  { href: "/settings#account", label: "Cont" },
  { href: "/settings#study", label: "Studiu" },
  { href: "/settings#appearance", label: "Aspect" },
  { href: "/settings#colors", label: "Culori" },
  { href: "/settings#notifications", label: "Notificări" },
  { href: "/settings#security", label: "Securitate" },
  { href: "/settings#privacy", label: "Date" },
];

const sidebarBillingItems = [
  { href: "/upgrade", label: "Planuri" },
  { href: "/upgrade/facturi", label: "Facturi" },
];

const generationSteps = [
  "Încărcare materiale",
  "Sumarizare conținut",
  "Creare flashcarduri",
  "Pregătire strategie învățare",
];

const GENERATION_POLL_INTERVAL_MS = 2000;
const GENERATION_POLL_ATTEMPTS = 180;
const QUIZ_GENERATION_POLL_ATTEMPTS = 450;
const PROJECT_DETAIL_MIN_LENGTH = 2;
const quizGenerationLoadingCopy: Record<
  LanguagePreference,
  {
    buttonIdle: string;
    buttonBusy: string;
    title: string;
    description: string;
    steps: [string, string, string];
  }
> = {
  ro: {
    buttonIdle: "Generează un quiz",
    buttonBusy: "Se generează...",
    title: "Construiesc quizurile...",
    description:
      "Analizez materialul complet, echilibrez dificultățile și verific variantele corecte. Poate dura câteva minute.",
    steps: [
      "Citesc materialul",
      "Compun întrebările",
      "Verific răspunsurile",
    ],
  },
  en: {
    buttonIdle: "Generate a quiz",
    buttonBusy: "Generating...",
    title: "Building your quizzes...",
    description:
      "Analyzing the full material, balancing difficulty and checking the correct answers. This can take a few minutes.",
    steps: [
      "Reading the material",
      "Writing the questions",
      "Checking the answers",
    ],
  },
  fr: {
    buttonIdle: "Générer un quiz",
    buttonBusy: "Génération...",
    title: "Création des quiz...",
    description:
      "J'analyse tout le contenu, j'équilibre la difficulté et je vérifie les bonnes réponses. Cela peut prendre quelques minutes.",
    steps: [
      "Lecture du contenu",
      "Rédaction des questions",
      "Vérification des réponses",
    ],
  },
};

class ProjectGenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectGenerationFailedError";
  }
}

function Icon({
  children,
  className = "h-4 w-4",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {children}
    </svg>
  );
}

function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <>
      <span className={collapsed ? "hidden lg:inline-flex" : "hidden"}>
        <BrandLogo
          href="/"
          variant="mark"
          className="text-content transition hover:text-action"
          logoClassName="h-8 w-8"
        />
      </span>
      <span className={collapsed ? "lg:hidden" : ""}>
        <BrandLogo
          href="/"
          className="text-content transition hover:text-action"
          logoClassName="h-7 w-28"
        />
      </span>
    </>
  );
}

function isDesktopSidebarViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mbToBytes(value: number) {
  return value * 1024 * 1024;
}

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getProjectUploadPlanLimits(
  userPlan: AuthUserPlan | null | undefined,
): ProjectUploadPlanLimits {
  return {
    planName: userPlan?.name ?? "Start",
    monthlyProjects: Math.max(0, Number(userPlan?.active_project_limit ?? 1)),
    filesPerProject: Math.max(1, Number(userPlan?.files_per_project_limit ?? 2)),
    monthlyMaterials: Math.max(0, Number(userPlan?.monthly_material_limit ?? 3)),
    monthlyPageLimit: Math.max(0, Number(userPlan?.monthly_page_limit ?? 40)),
    fileSizeMb: Math.max(1, Number(userPlan?.file_size_limit_mb ?? 10)),
    projectSizeMb: Math.max(1, Number(userPlan?.project_size_limit_mb ?? 20)),
    estimatedPages: Math.max(1, Number(userPlan?.estimated_page_limit ?? 25)),
    allowScannedDocuments: Boolean(userPlan?.allow_scanned_documents),
  };
}

function getQuizPlanLimits(
  userPlan: AuthUserPlan | null | undefined,
): QuizPlanLimits {
  return {
    quizQuestionsPerQuiz: Math.max(
      1,
      Number(userPlan?.quiz_questions_per_quiz ?? 10),
    ),
    quizzesPerProject: Math.max(
      1,
      Number(userPlan?.quizzes_per_project_limit ?? 3),
    ),
  };
}

function quotaReached(used: number, limit: number) {
  return limit <= 0 || used >= limit;
}

function quotaExceededBy(used: number, incoming: number, limit: number) {
  return limit <= 0 ? incoming > 0 : used + incoming > limit;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", abortDelay);
      resolve();
    }, ms);

    function abortDelay() {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal?.addEventListener("abort", abortDelay, { once: true });
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function toFriendlyGenerationError(message?: string | null) {
  const cleanMessage = message?.trim();
  if (!cleanMessage) return null;

  const lowerMessage = cleanMessage.toLocaleLowerCase("ro-RO");
  if (
    lowerMessage.includes("insufficient_quota") ||
    lowerMessage.includes("exceeded your current quota")
  ) {
    return "Generarea nu este disponibilă momentan. Încearcă din nou în câteva minute.";
  }

  if (
    lowerMessage.includes("a refuzat") ||
    lowerMessage.includes("nu a putut procesa")
  ) {
    return "Pachetul nu a putut fi generat momentan. Încearcă din nou.";
  }

  return cleanMessage
    .replaceAll("OPENAI_API_KEY", "serviciul de generare")
    .replaceAll("OpenAI", "serviciul de generare")
    .replaceAll("Markdown", "conținut")
    .replaceAll("markdown", "conținut")
    .replaceAll("JSON-ul", "pachetul generat")
    .replaceAll("JSON", "pachet generat");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "EQ";
}

function getProjectById(projects: StudyProject[], projectId?: string) {
  if (!projectId) return projects[0];
  return projects.find((project) => project.id === projectId);
}

function apiProjectStatusLabel(status: ApiStudyProject["status"]) {
  if (status === "ready") return "";
  if (status === "generating_study_pack") return "creează pachet";
  if (status === "generating_quizzes") return "creează quizuri";
  if (status === "awaiting_ai_json") return "în așteptare";
  if (status === "processing") return "în procesare";
  if (status === "failed") return "eroare";
  return status;
}

function isVisibleStudyProjectStatus(status: ApiStudyProject["status"]) {
  return status === "ready" || status === "generating_quizzes";
}

function stripQuizMistakeAnswerPrefix(answer: string) {
  const cleanAnswer = answer.trim();
  const strippedAnswer = cleanAnswer
    .replace(/^R(?:a|\u0103)spuns corect:\s*/i, "")
    .trim();

  return strippedAnswer || cleanAnswer;
}

function mapQuizMistakeFlashcards(
  flashcards: ApiStudyProject["flashcards"],
): StudyFlashcardCard[] {
  return flashcards
    .filter((flashcard) => flashcard.source_type === "quiz_mistake")
    .map((flashcard, index) => ({
      id: `quiz-${flashcard.id || flashcard.source_quiz_question_id || index}`,
      flashcardId: flashcard.id,
      topic: flashcard.category || "Quiz",
      question: flashcard.front,
      answer: stripQuizMistakeAnswerPrefix(flashcard.back),
      tone: "danger",
      sourceQuestionId: flashcard.source_quiz_question_id ?? undefined,
      category: flashcard.category ?? undefined,
      difficulty: flashcard.difficulty ?? undefined,
      review: flashcard.review,
    }));
}

function getGeneratedFlashcards(flashcards: ApiStudyProject["flashcards"]) {
  return flashcards.filter((flashcard) => flashcard.source_type === "generated");
}

function mapManualFlashcards(
  projectId: string,
  flashcards: ApiStudyProject["flashcards"],
): StudyFlashcardCard[] {
  return flashcards
    .filter((flashcard) => flashcard.source_type === "manually")
    .map((flashcard, index) => ({
      id: `manual-${flashcard.id || index}`,
      flashcardId: flashcard.id,
      topic: flashcard.category || "Creat de tine",
      question: flashcard.front,
      answer: flashcard.back,
      tone: "info",
      category: flashcard.category ?? undefined,
      difficulty: flashcard.difficulty ?? undefined,
      questionImage: flashcard.front_image
        ? `/api/projects/${projectId}/flashcards/${flashcard.id}/front-image`
        : undefined,
      review: flashcard.review,
    }));
}

function mapSummaryHighlights(
  highlights: ApiStudyProject["summary_highlights"],
): UserSummaryHighlight[] {
  return highlights.map((highlight) => ({
    id: highlight.id,
    text: highlight.text,
    paragraphIndex: highlight.paragraph_index,
    color: highlight.color,
    startOffset: highlight.start_offset ?? null,
    endOffset: highlight.end_offset ?? null,
  }));
}

function mapSummaryNotes(
  notes: ApiStudyProject["summary_notes"],
): UserSummaryNote[] {
  return notes.map((note) => ({
    id: note.id,
    text: note.text,
    paragraphIndex: note.paragraph_index,
    note: note.note,
  }));
}

function computeProjectQuizProgress(project: ApiStudyProject): number {
  const totalQuizzes = project.quizzes.length;
  if (!totalQuizzes) {
    return 0;
  }

  const completedQuizzes = project.quizzes.filter(
    (quiz) => quiz.completed_at,
  ).length;
  return Math.round((completedQuizzes / totalQuizzes) * 100);
}

/** Active projects first, newest first within each group. */
function sortProjectsByActivation(projects: StudyProject[]) {
  return [...projects].sort((first, second) => {
    if (first.isDeactivated !== second.isDeactivated) {
      return first.isDeactivated ? 1 : -1;
    }
    return (
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
    );
  });
}

function mapApiProject(project: ApiStudyProject): StudyProject {
  const generatedFlashcardCount = getGeneratedFlashcards(
    project.flashcards,
  ).length;
  const metaParts = [
    project.subject_name,
    `${project.file_count} materiale`,
    apiProjectStatusLabel(project.status),
  ].filter(Boolean);

  return {
    id: project.id,
    name: project.name,
    subjectName: project.subject_name,
    institutionName: project.institution_name,
    status: project.status,
    errorMessage: toFriendlyGenerationError(project.error_message),
    isArchived: project.is_archived,
    archivedAt: project.archived_at,
    isDeactivated: project.is_deactivated,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    meta: metaParts.join(" · "),
    flashcardsDue: generatedFlashcardCount,
    flashcardsTotal: generatedFlashcardCount,
    progress: computeProjectQuizProgress(project),
    summary: project.summary,
    keywords: project.keywords,
    flashcards: project.flashcards,
    quizzes: project.quizzes,
    quizMistakeFlashcards: mapQuizMistakeFlashcards(project.flashcards),
    manualFlashcards: mapManualFlashcards(project.id, project.flashcards),
    summaryHighlights: mapSummaryHighlights(project.summary_highlights),
    summaryNotes: mapSummaryNotes(project.summary_notes),
    strategies: project.strategies.length
      ? project.strategies.map((strategy) => ({
          title: strategy.title,
          description: strategy.description,
        }))
      : [
          {
            title:
              project.status === "ready"
                ? "Continuă cu rezumatul generat"
                : "Așteaptă generarea pachetului",
            description:
              project.status === "ready"
                ? "Pachetul proiectului este generat și poate fi folosit pentru studiu."
                : "Reviss convertește materialele și salvează automat conținutul generat.",
          },
        ],
  };
}

function isChatBackTab(tab: TabId | undefined): tab is Exclude<TabId, "chat"> {
  return tab !== undefined && tab !== "chat";
}

function getTabHref(
  tabId: TabId,
  projectId: string,
  options: { from?: TabId } = {},
) {
  const params = new URLSearchParams({ project: projectId });

  if (tabId === "chat" && isChatBackTab(options.from)) {
    params.set("from", options.from);
  }

  return `${tabRoutes[tabId]}?${params.toString()}`;
}

type AccountDashboardProps = {
  initialProjectId?: string;
  initialTab?: TabId;
  initialChatBackTab?: TabId;
  initialFlashcardMode?: FlashcardPanelMode;
  initialView?: ViewId;
  useTabPages?: boolean;
};

export function AccountDashboard({
  initialProjectId,
  initialTab = "rezumat",
  initialChatBackTab,
  initialFlashcardMode = "packages",
  initialView = "home",
  useTabPages = false,
}: AccountDashboardProps = {}) {
  const router = useRouter();
  const [isTabRoutePending, startTabRouteTransition] = useTransition();
  const { user, isLoading, logout } = useAuth();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [projects, setProjects] = useState(initialProjects);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projectSlots, setProjectSlots] = useState<{
    slots: number;
    mustChoose: boolean;
  } | null>(null);

  const refreshProjectSlots = useCallback(async () => {
    try {
      const status = await getActiveProjectSlots();
      setProjectSlots({
        slots: status.slots,
        mustChoose: status.must_choose,
      });
    } catch {
      // The API enforces the cap regardless; a failed check just means no modal.
      setProjectSlots(null);
    }
  }, []);
  const [view, setView] = useState<ViewId>(initialView);
  const [activeProjectId, setActiveProjectId] = useState(
    initialProjectId ?? "",
  );
  const [openProjectId, setOpenProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [chatBackTab, setChatBackTab] = useState<TabId>(
    isChatBackTab(initialChatBackTab)
      ? initialChatBackTab
      : isChatBackTab(initialTab)
        ? initialTab
        : "rezumat",
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMounted: isBackdropMounted, isVisible: isBackdropVisible } =
    useOpenCloseTransition(sidebarOpen, 300);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
  );
  const [openSidebarGroup, setOpenSidebarGroup] =
    useState<SidebarGroupId | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [hasMaterialRights, setHasMaterialRights] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [generationState, setGenerationState] =
    useState<GenerationState>("form");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [preparedProject, setPreparedProject] =
    useState<StudyProjectPrepareResponse | null>(null);
  const [isCancellingGeneration, setIsCancellingGeneration] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [quizPlanLimitSnapshot, setQuizPlanLimitSnapshot] =
    useState<QuizPlanLimitSnapshot | null>(null);
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const generationPrepareRequestIdRef = useRef<string | null>(null);
  const generationProjectIdRef = useRef<string | null>(null);
  const generationCancelRequestedRef = useRef(false);
  const quizGenerationAbortControllerRef = useRef<AbortController | null>(null);
  const activeProject = useMemo(
    () => getProjectById(projects, activeProjectId),
    [activeProjectId, projects],
  );

  const displayName = user?.full_name.trim() || "student";
  const hasAiAccess = hasPlanAiAccess(user?.current_plan);
  const accountQuizPlanLimits = getQuizPlanLimits(user?.current_plan);
  const activeQuizPlanLimits =
    user?.id &&
    quizPlanLimitSnapshot &&
    quizPlanLimitSnapshot.userId === user.id
      ? quizPlanLimitSnapshot
      : accountQuizPlanLimits;
  // Upper bound for one generated quiz; the API enforces the same cap.
  const maxQuizQuestions = activeQuizPlanLimits.quizQuestionsPerQuiz;
  // How many quizzes one project may hold in total; the API enforces the same
  // ceiling when the generation is requested.
  const maxQuizzesPerProject = activeQuizPlanLimits.quizzesPerProject;
  const uploadPlanLimits = useMemo(
    () => getProjectUploadPlanLimits(user?.current_plan),
    [user?.current_plan],
  );
  const uploadedFilesTotalSize = uploadedFiles.reduce(
    (total, file) => total + file.size,
    0,
  );
  const uploadedFilesAreWithinPlan =
    uploadedFiles.length <= uploadPlanLimits.filesPerProject &&
    uploadedFilesTotalSize <= mbToBytes(uploadPlanLimits.projectSizeMb) &&
    uploadedFiles.every(
      (file) => file.size <= mbToBytes(uploadPlanLimits.fileSizeMb),
    );
  const monthlyUploadQuotaNotice = useMemo(() => {
    if (!usage) return null;

    if (quotaReached(usage.projects_used, usage.projects_limit)) {
      return `Ai atins limita planului ${uploadPlanLimits.planName}: ${formatCountLabel(
        usage.projects_limit,
        "proiect",
        "proiecte",
      )} pe lună.`;
    }

    if (
      quotaExceededBy(
        usage.materials_used,
        uploadedFiles.length,
        usage.materials_limit,
      )
    ) {
      if (usage.materials_limit <= 0) {
        return `Planul ${uploadPlanLimits.planName} nu include încărcări de materiale.`;
      }

      return `Selecția depășește cota lunară de materiale. Mai ai ${formatCountLabel(
        Math.max(0, usage.materials_limit - usage.materials_used),
        "material",
        "materiale",
      )} disponibile.`;
    }

    if (
      uploadedFiles.length > 0 &&
      quotaReached(usage.pages_processed, usage.pages_limit)
    ) {
      if (usage.pages_limit <= 0) {
        return `Planul ${uploadPlanLimits.planName} nu include pagini procesate.`;
      }

      return `Ai atins limita lunară de pagini procesate: ${usage.pages_processed}/${usage.pages_limit}.`;
    }

    return null;
  }, [usage, uploadPlanLimits.planName, uploadedFiles.length]);
  const canGenerate =
    projectName.trim().length >= PROJECT_DETAIL_MIN_LENGTH &&
    subjectName.trim().length >= PROJECT_DETAIL_MIN_LENGTH &&
    institutionName.trim().length >= PROJECT_DETAIL_MIN_LENGTH &&
    uploadedFiles.length > 0 &&
    hasMaterialRights &&
    uploadedFilesAreWithinPlan &&
    !monthlyUploadQuotaNotice;
  const generationProgress = Math.round(
    (completedSteps.length / generationSteps.length) * 100,
  );

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (isLoading || !user?.id) return;
    let isMounted = true;
    let didLoadInitialProject = false;

    const loadingFrame = window.requestAnimationFrame(() => {
      if (isMounted) setIsProjectsLoading(true);
    });

    if (initialProjectId) {
      getStudyProject(initialProjectId)
        .then((apiProject) => {
          if (!isMounted || !isVisibleStudyProjectStatus(apiProject.status)) {
            return;
          }

          didLoadInitialProject = true;
          const mappedProject = mapApiProject(apiProject);
          setProjects((currentProjects) => [
            mappedProject,
            ...currentProjects.filter(
              (project) => project.id !== mappedProject.id,
            ),
          ]);
          setActiveProjectId(mappedProject.id);
          setOpenProjectId(mappedProject.id);
          setActiveTab(initialTab);
          setView("project");
          setIsProjectsLoading(false);
        })
        .catch(() => {
          // The full list request below still decides the final state.
        });
    }

    // Checked alongside the project list: if the plan shrank below the number
    // of active projects, the selection modal has to open before anything else.
    // Written as a promise chain so state is only set in the callback.
    getActiveProjectSlots()
      .then((status) => {
        if (!isMounted) return;
        setProjectSlots({
          slots: status.slots,
          mustChoose: status.must_choose,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        // The API enforces the cap regardless; a failed check means no modal.
        setProjectSlots(null);
      });

    listStudyProjects()
      .then((apiProjects) => {
        if (!isMounted) return;

        const mappedProjects = apiProjects
          .filter((project) => isVisibleStudyProjectStatus(project.status))
          .map(mapApiProject);
        setProjects(mappedProjects);

        if (mappedProjects.length === 0) {
          setActiveProjectId("");
          setOpenProjectId(null);
          setView("home");
          setIsProjectsLoading(false);
          return;
        }

        const initialProjectExists = Boolean(
          initialProjectId &&
            mappedProjects.some((project) => project.id === initialProjectId),
        );
        const fallbackProjectId = initialProjectExists
          ? initialProjectId ?? mappedProjects[0].id
          : mappedProjects[0].id;

        setActiveProjectId((currentProjectId) =>
          !initialProjectId &&
          mappedProjects.some((project) => project.id === currentProjectId)
            ? currentProjectId
            : fallbackProjectId,
        );

        if (initialProjectId) {
          setOpenProjectId(fallbackProjectId);
          setActiveTab(initialTab);
          setView("project");
        }
        setIsProjectsLoading(false);
      })
      .catch(() => {
        if (!didLoadInitialProject) {
          setProjects([]);
        }
        setIsProjectsLoading(false);
      });

    return () => {
      isMounted = false;
      window.cancelAnimationFrame(loadingFrame);
    };
  }, [initialProjectId, initialTab, isLoading, user]);

  useEffect(() => {
    if (!useTabPages) return;

    const frame = window.requestAnimationFrame(() => {
      if (!initialProjectId) {
        setView(initialView);
        setActiveTab(initialTab);
        return;
      }

      setActiveProjectId(initialProjectId);
      setOpenProjectId(initialProjectId);
      setActiveTab(initialTab);
      setView("project");

      if (isChatBackTab(initialChatBackTab)) {
        setChatBackTab(initialChatBackTab);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialChatBackTab, initialProjectId, initialTab, initialView, useTabPages]);

  useEffect(() => {
    if (!useTabPages || !activeProjectId) return;

    for (const tab of tabs) {
      if (tab.id === "chat" && !hasAiAccess) continue;

      router.prefetch(
        getTabHref(tab.id, activeProjectId, {
          from: tab.id === "chat" ? chatBackTab : undefined,
        }),
      );
    }
  }, [activeProjectId, chatBackTab, hasAiAccess, router, useTabPages]);

  useEffect(() => {
    if (isLoading || !user?.id) return;
    let isMounted = true;

    getUsage()
      .then((result) => {
        if (isMounted) setUsage(result);
      })
      .catch(() => {
        // Keep usage null - the section simply doesn't render.
      });

    return () => {
      isMounted = false;
    };
  }, [isLoading, user?.id]);

  const refreshUsageSnapshot = useCallback(async () => {
    try {
      const result = await getUsage();
      setUsage(result);
    } catch {
      // Usage is informational; blocking the study flow would be worse.
    }
  }, []);

  const refreshQuizPlanLimitSnapshot = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      const nextLimits = getQuizPlanLimits(currentUser.current_plan);
      setQuizPlanLimitSnapshot((currentLimits) => {
        if (
          currentLimits?.quizQuestionsPerQuiz ===
            nextLimits.quizQuestionsPerQuiz &&
          currentLimits.quizzesPerProject === nextLimits.quizzesPerProject
        ) {
          return currentLimits;
        }

        const matchesAccountSnapshot =
          currentUser.id === user?.id &&
          accountQuizPlanLimits.quizQuestionsPerQuiz ===
            nextLimits.quizQuestionsPerQuiz &&
          accountQuizPlanLimits.quizzesPerProject === nextLimits.quizzesPerProject;
        if (matchesAccountSnapshot) {
          return currentLimits === null ? currentLimits : null;
        }

        return { ...nextLimits, userId: currentUser.id };
      });
    } catch {
      // The existing auth guard handles expired sessions; quiz limits stay as-is.
    }
  }, [
    accountQuizPlanLimits.quizQuestionsPerQuiz,
    accountQuizPlanLimits.quizzesPerProject,
    user?.id,
  ]);

  useEffect(() => {
    if (isLoading || !user?.id || view !== "project" || activeTab !== "quiz") {
      return;
    }

    const refreshQuizLimits = () => {
      void refreshQuizPlanLimitSnapshot();
    };

    refreshQuizLimits();


    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshQuizLimits();
      }
    };

    window.addEventListener("focus", refreshQuizLimits);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshQuizLimits);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeTab,
    isLoading,
    refreshQuizPlanLimitSnapshot,
    user?.id,
    view,
  ]);

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(
        ACCOUNT_SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(next),
      );
      return next;
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  function showHome() {
    setView("home");
    setSidebarOpen(false);

    if (useTabPages) {
      router.push("/myaccount");
      return;
    }
  }

  function openProject(projectId: string, tab: TabId = "rezumat") {
    if (tab === "chat" && !hasAiAccess) {
      return;
    }

    const target = projects.find((project) => project.id === projectId);
    if (target?.isDeactivated) {
      return;
    }

    setActiveProjectId(projectId);
    setOpenProjectId(projectId);
    setActiveTab(tab);
    if (isChatBackTab(tab)) {
      setChatBackTab(tab);
    }
    setView("project");
    setSidebarOpen(false);

    if (useTabPages) {
      startTabRouteTransition(() => {
        router.push(getTabHref(tab, projectId));
      });
      return;
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function renameProject(projectId: string, name: string) {
    const apiProject = await renameStudyProject({ projectId, name });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function archiveProject(projectId: string) {
    await archiveStudyProject(projectId);
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );

    if (activeProjectId === projectId || openProjectId === projectId) {
      setActiveProjectId("");
      setOpenProjectId(null);
      setView("home");
      if (useTabPages) {
        router.push("/myaccount");
      }
    }
  }

  async function setProjectActivation(projectId: string, isActive: boolean) {
    const updated = isActive
      ? await activateStudyProject(projectId)
      : await deactivateStudyProject(projectId);

    setProjects((currentProjects) =>
      sortProjectsByActivation(
        currentProjects.map((project) =>
          project.id === projectId
            ? { ...project, isDeactivated: updated.is_deactivated }
            : project,
        ),
      ),
    );

    // A deactivated project cannot be studied, so leave it if it is open.
    if (!isActive && (activeProjectId === projectId || openProjectId === projectId)) {
      setActiveProjectId("");
      setOpenProjectId(null);
      setView("home");
      if (useTabPages) {
        router.push("/myaccount");
      }
    }
  }

  async function removeProject(projectId: string) {
    await deleteStudyProject(projectId);
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );

    if (activeProjectId === projectId || openProjectId === projectId) {
      setActiveProjectId("");
      setOpenProjectId(null);
      setView("home");
      if (useTabPages) {
        router.push("/myaccount");
      }
    }
  }

  function addQuizMistakeFlashcard(
    projectId: string,
    flashcard: StudyFlashcardCard,
  ) {
    setProjects((currentProjects) =>
      currentProjects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        const alreadySaved = project.quizMistakeFlashcards.some(
          (existingFlashcard) =>
            (flashcard.sourceQuestionId &&
              existingFlashcard.sourceQuestionId ===
                flashcard.sourceQuestionId) ||
            existingFlashcard.question === flashcard.question,
        );

        if (alreadySaved) {
          return project;
        }

        return {
          ...project,
          quizMistakeFlashcards: [
            flashcard,
            ...project.quizMistakeFlashcards,
          ],
        };
      }),
    );
  }

  async function addManualFlashcard(
    projectId: string,
    flashcard: ManualFlashcardPayload,
  ) {
    const apiProject = await createManualStudyProjectFlashcard({
      projectId,
      front: flashcard.question,
      back: flashcard.answer,
      category: flashcard.category,
      difficulty: flashcard.difficulty,
      frontImage: flashcard.questionImageFile,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function addSummaryHighlight(
    projectId: string,
    highlight: {
      paragraphIndex: number;
      text: string;
      color: ApiSummaryHighlightColor;
      startOffset?: number | null;
      endOffset?: number | null;
    },
  ) {
    const apiProject = await createSummaryHighlight({
      projectId,
      paragraphIndex: highlight.paragraphIndex,
      text: highlight.text,
      color: highlight.color,
      startOffset: highlight.startOffset,
      endOffset: highlight.endOffset,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function changeSummaryHighlightColor(
    projectId: string,
    highlightId: string,
    color: ApiSummaryHighlightColor,
  ) {
    const apiProject = await updateSummaryHighlightColor({
      projectId,
      highlightId,
      color,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function removeSummaryHighlight(projectId: string, highlightId: string) {
    const apiProject = await deleteSummaryHighlight({ projectId, highlightId });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function resetSummaryHighlights(projectId: string) {
    const apiProject = await deleteAllSummaryHighlights({ projectId });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function addSummaryNote(
    projectId: string,
    note: { paragraphIndex: number; text: string; note: string },
  ) {
    const apiProject = await createSummaryNote({
      projectId,
      paragraphIndex: note.paragraphIndex,
      text: note.text,
      note: note.note,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function changeSummaryNote(
    projectId: string,
    noteId: string,
    note: string,
  ) {
    const apiProject = await updateSummaryNote({ projectId, noteId, note });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function removeSummaryNote(projectId: string, noteId: string) {
    const apiProject = await deleteSummaryNote({ projectId, noteId });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function completeQuizAttempt(
    projectId: string,
    quizId: string,
    result: QuizCompletionResult,
  ) {
    const apiProject = await completeQuiz({
      projectId,
      quizId,
      ...result,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function generateProjectQuiz(
    projectId: string,
    config: QuizGenerationConfig,
  ) {
    const existingQuizCount =
      getProjectById(projects, projectId)?.quizzes.length ?? 0;
    const abortController = new AbortController();
    quizGenerationAbortControllerRef.current = abortController;

    try {
      const queuedProject = await generateStudyProjectQuiz(projectId, config, {
        signal: abortController.signal,
      });
      abortController.signal.throwIfAborted();
      storeApiProject(queuedProject);

      if (queuedProject.status === "failed") {
        throw new Error(
          toFriendlyGenerationError(queuedProject.error_message) ||
            "Quizul nu a putut fi generat.",
        );
      }

      if (
        queuedProject.status === "ready" &&
        queuedProject.quizzes.length <= existingQuizCount
      ) {
        throw new Error(
          toFriendlyGenerationError(queuedProject.error_message) ||
            "Quizul nu a putut fi generat. Încearcă din nou.",
        );
      }

      if (queuedProject.status !== "generating_quizzes") {
        void refreshUsageSnapshot();
        return mapApiProject(queuedProject);
      }

      for (
        let attempt = 0;
        attempt < QUIZ_GENERATION_POLL_ATTEMPTS;
        attempt += 1
      ) {
        await delay(GENERATION_POLL_INTERVAL_MS, abortController.signal);
        const apiProject = await getStudyProject(projectId, {
          signal: abortController.signal,
        });
        abortController.signal.throwIfAborted();
        const mappedProject = storeApiProject(apiProject);

        if (
          apiProject.status === "ready" &&
          apiProject.quizzes.length > existingQuizCount
        ) {
          void refreshUsageSnapshot();
          return mappedProject;
        }

        if (apiProject.status === "ready" && apiProject.error_message) {
          throw new Error(
            toFriendlyGenerationError(apiProject.error_message) ||
              "Quizul nu a putut fi generat.",
          );
        }

        if (apiProject.status === "ready") {
          throw new Error("Quizul nu a putut fi generat. Încearcă din nou.");
        }

        if (apiProject.status === "failed") {
          throw new Error(
            toFriendlyGenerationError(apiProject.error_message) ||
              "Quizul nu a putut fi generat.",
          );
        }
      }

      throw new Error("Generarea quizurilor durează prea mult. Reîncarcă pagina.");
    } catch (error) {
      if (isAbortError(error)) {
        throw new DOMException("Aborted", "AbortError");
      }
      throw error;
    } finally {
      if (quizGenerationAbortControllerRef.current === abortController) {
        quizGenerationAbortControllerRef.current = null;
      }
    }
  }

  async function cancelProjectQuizGeneration(projectId: string) {
    const abortController = quizGenerationAbortControllerRef.current;
    const apiProject = await cancelStudyProjectGeneration(projectId);
    // Keep polling when cancellation fails, and never abort a newer request.
    abortController?.abort();
    const mappedProject = storeApiProject(apiProject);
    void refreshUsageSnapshot();
    return mappedProject;
  }

  async function toggleFlashcardReview(
    projectId: string,
    flashcardId: string,
    review: boolean,
  ) {
    const apiProject = await setFlashcardReview({
      projectId,
      flashcardId,
      review,
    });
    const mappedProject = mapApiProject(apiProject);
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === mappedProject.id ? mappedProject : project,
      ),
    );
  }

  async function saveQuizMistakeFlashcard(
    projectId: string,
    questionId: string | null,
    fallbackFlashcard: StudyFlashcardCard,
  ) {
    addQuizMistakeFlashcard(projectId, fallbackFlashcard);

    if (!questionId) {
      return;
    }

    try {
      const apiProject = await createQuizMistakeFlashcard({
        projectId,
        questionId,
      });
      const mappedProject = mapApiProject(apiProject);
      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          if (project.id !== mappedProject.id) {
            return project;
          }

          return mappedProject;
        }),
      );
    } catch (error) {
      // The optimistic card stays in the local list so the tab is not empty,
      // but the caller has to know the save did not reach the server: this is
      // now an explicit request, not a silent side effect.
      throw error;
    }
  }

  function changeProjectTab(tab: TabId) {
    if (tab === "chat" && !hasAiAccess) {
      return;
    }

    const nextChatBackTab = isChatBackTab(tab)
      ? tab
      : isChatBackTab(activeTab)
        ? activeTab
        : chatBackTab;

    setChatBackTab(nextChatBackTab);
    setActiveTab(tab);

    if (useTabPages) {
      startTabRouteTransition(() => {
        router.push(
          getTabHref(tab, activeProjectId, {
            from: tab === "chat" ? nextChatBackTab : undefined,
          }),
        );
      });
      return;
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openNewProject() {
    resetNewProject();
    setView("new");
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function resetNewProject() {
    generationAbortControllerRef.current?.abort();
    generationAbortControllerRef.current = null;
    generationPrepareRequestIdRef.current = null;
    generationProjectIdRef.current = null;
    generationCancelRequestedRef.current = false;
    setProjectName("");
    setSubjectName("");
    setInstitutionName("");
    setUploadedFiles([]);
    setHasMaterialRights(false);
    setCompletedSteps([]);
    setGenerationState("form");
    setPreparedProject(null);
    setIsCancellingGeneration(false);
  }

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);

    setUploadedFiles((currentFiles) => {
      const remainingSlots = Math.max(
        0,
        uploadPlanLimits.filesPerProject - currentFiles.length,
      );
      const maxFileBytes = mbToBytes(uploadPlanLimits.fileSizeMb);
      const maxProjectBytes = mbToBytes(uploadPlanLimits.projectSizeMb);
      let nextTotalSize = currentFiles.reduce(
        (total, file) => total + file.size,
        0,
      );
      const acceptedFiles: UploadedFile[] = [];
      const rejectedReasons = new Set<string>();

      if (remainingSlots === 0) {
        rejectedReasons.add(
          `Planul ${uploadPlanLimits.planName} permite maximum ${uploadPlanLimits.filesPerProject} fișiere într-un proiect.`,
        );
      }

      for (const file of selectedFiles) {
        if (acceptedFiles.length >= remainingSlots) {
          rejectedReasons.add(
            `Au fost păstrate doar primele ${uploadPlanLimits.filesPerProject} fișiere permise de plan.`,
          );
          continue;
        }

        if (file.size > maxFileBytes) {
          rejectedReasons.add(
            `Un fișier poate avea cel mult ${uploadPlanLimits.fileSizeMb} MB pe planul ${uploadPlanLimits.planName}.`,
          );
          continue;
        }

        if (nextTotalSize + file.size > maxProjectBytes) {
          rejectedReasons.add(
            `Materialele proiectului pot avea cel mult ${uploadPlanLimits.projectSizeMb} MB în total.`,
          );
          continue;
        }

        acceptedFiles.push({
          name: file.name,
          size: file.size,
          file,
        });
        nextTotalSize += file.size;
      }

      if (rejectedReasons.size > 0) {
        toast.warning([...rejectedReasons].join(" "));
      }

      if (acceptedFiles.length === 0) {
        return currentFiles;
      }

      return [...currentFiles, ...acceptedFiles];
    });
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeUploadedFile(index: number) {
    setUploadedFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index),
    );
  }

  function storeApiProject(apiProject: ApiStudyProject) {
    const mappedProject = mapApiProject(apiProject);

    if (!isVisibleStudyProjectStatus(apiProject.status)) {
      setProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== mappedProject.id),
      );
      setActiveProjectId((currentProjectId) =>
        currentProjectId === mappedProject.id ? "" : currentProjectId,
      );
      setOpenProjectId((currentProjectId) =>
        currentProjectId === mappedProject.id ? null : currentProjectId,
      );
      return mappedProject;
    }

    setProjects((currentProjects) => [
      mappedProject,
      ...currentProjects.filter((project) => project.id !== mappedProject.id),
    ]);
    setActiveProjectId(mappedProject.id);
    setOpenProjectId(mappedProject.id);
    return mappedProject;
  }

  async function pollProjectUntilReady(projectId: string, signal?: AbortSignal) {
    for (let attempt = 0; attempt < GENERATION_POLL_ATTEMPTS; attempt += 1) {
      await delay(GENERATION_POLL_INTERVAL_MS, signal);
      const apiProject = await getStudyProject(projectId, { signal });
      const mappedProject = storeApiProject(apiProject);
      setPreparedProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              project: apiProject,
            }
          : currentProject,
      );

      if (apiProject.status === "ready") {
        setCompletedSteps(generationSteps);
        return mappedProject;
      }

      if (apiProject.status === "failed") {
        throw new ProjectGenerationFailedError(
          toFriendlyGenerationError(apiProject.error_message) ||
            "Generarea nu a putut fi finalizată.",
        );
      }

      if (apiProject.status === "generating_study_pack") {
        setCompletedSteps(generationSteps.slice(0, 3));
      } else if (apiProject.status === "processing") {
        setCompletedSteps(generationSteps.slice(0, 2));
      }
    }

    throw new Error("Generarea durează prea mult. Reîncarcă pagina în câteva minute.");
  }

  async function startGeneration() {
    if (!uploadedFilesAreWithinPlan) {
      toast.warning(
        `Selecția depășește limitele planului ${uploadPlanLimits.planName}.`,
      );
      return;
    }
    if (monthlyUploadQuotaNotice) {
      toast.warning(monthlyUploadQuotaNotice);
      return;
    }
    if (!canGenerate) return;

    let transientProjectId: string | null = null;
    const abortController = new AbortController();
    const prepareRequestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    generationAbortControllerRef.current = abortController;
    generationPrepareRequestIdRef.current = prepareRequestId;
    generationProjectIdRef.current = null;
    generationCancelRequestedRef.current = false;

    setGenerationState("generating");
    setCompletedSteps([]);
    setPreparedProject(null);
    setIsCancellingGeneration(false);

    try {
      setCompletedSteps(generationSteps.slice(0, 1));
      const response = await prepareStudyProject(
        {
          name: projectName,
          subjectName,
          institutionName,
          files: uploadedFiles.map((file) => file.file),
          materialRightsConfirmed: hasMaterialRights,
          generationLanguage: language,
          prepareRequestId,
        },
        { signal: abortController.signal },
      );
      transientProjectId = response.project.id;
      generationProjectIdRef.current = response.project.id;
      setPreparedProject(response);
      setCompletedSteps(generationSteps.slice(0, 3));
      await pollProjectUntilReady(response.project.id, abortController.signal);
      await refreshUsageSnapshot();
      setGenerationState("done");
    } catch (error) {
      if (isAbortError(error) || generationCancelRequestedRef.current) {
        setGenerationState("form");
        setCompletedSteps([]);
        setPreparedProject(null);
        return;
      }

      const friendlyError =
        (error instanceof Error
          ? toFriendlyGenerationError(error.message)
          : null) ?? "Proiectul nu a putut fi pregătit momentan.";
      if (transientProjectId && error instanceof ProjectGenerationFailedError) {
        try {
          await deleteStudyProject(transientProjectId);
        } catch {
          // The project is already hidden from the UI; cleanup can be retried later.
        }
      }
      setGenerationState("form");
      setCompletedSteps([]);
      setPreparedProject(null);
      toast.error(friendlyError, "Proiectul nu a fost salvat.");
    } finally {
      if (generationAbortControllerRef.current === abortController) {
        generationAbortControllerRef.current = null;
      }
      generationPrepareRequestIdRef.current = null;
      generationProjectIdRef.current = null;
      generationCancelRequestedRef.current = false;
      setIsCancellingGeneration(false);
    }
  }

  async function cancelActiveGeneration() {
    if (generationState !== "generating" || isCancellingGeneration) {
      return;
    }

    generationCancelRequestedRef.current = true;
    setIsCancellingGeneration(true);

    const prepareRequestId = generationPrepareRequestIdRef.current;
    const knownProjectId =
      generationProjectIdRef.current ?? preparedProject?.project.id ?? null;
    generationAbortControllerRef.current?.abort();

    let cancelledProjectId: string | null = null;
    if (prepareRequestId) {
      try {
        const response = await cancelStudyProjectPrepare(prepareRequestId);
        cancelledProjectId = response.project_id ?? null;
      } catch {
        // The local request is already aborted; project-id cleanup below still runs when possible.
      }
    }

    const projectId = knownProjectId ?? cancelledProjectId;
    if (projectId) {
      try {
        await cancelStudyProjectGeneration(projectId);
      } catch {
        // The project may already have been removed by the prepare cancel endpoint.
      }

      try {
        await deleteStudyProject(projectId);
      } catch {
        // If the backend already removed it, the UI can still return to the form.
      }

      setProjects((currentProjects) =>
        currentProjects.filter((project) => project.id !== projectId),
      );
      setActiveProjectId((currentProjectId) =>
        currentProjectId === projectId ? "" : currentProjectId,
      );
      setOpenProjectId((currentProjectId) =>
        currentProjectId === projectId ? null : currentProjectId,
      );
    }

    generationPrepareRequestIdRef.current = null;
    generationProjectIdRef.current = null;
    setGenerationState("form");
    setCompletedSteps([]);
    setPreparedProject(null);
    setIsCancellingGeneration(false);
  }
  function createGeneratedProject() {
    if (!preparedProject) return;

    const apiProject = storeApiProject(preparedProject.project);
    setActiveProjectId(apiProject.id);
    setOpenProjectId(apiProject.id);
    setActiveTab("rezumat");
    setView("project");
    resetNewProject();
  }

  if (isLoading || !user) {
    // The route already told us which tab is opening, so the placeholder can
    // be shaped like it while the session resolves.
    return <AccountSkeleton tab={activeTab} />;
  }

  return (
    <div className="min-h-svh bg-app text-content lg:flex">
      {projectSlots?.mustChoose &&
      !isProjectsLoading &&
      projects.some((project) => !project.isArchived) ? (
        <ProjectSlotsModal
          projects={projects.filter((project) => !project.isArchived)}
          slots={projectSlots.slots}
          planName={user.current_plan?.name ?? "actual"}
          onResolved={({ deactivated, activated }) => {
            setProjects((currentProjects) =>
              sortProjectsByActivation(
                currentProjects.map((project) =>
                  deactivated.includes(project.id)
                    ? { ...project, isDeactivated: true }
                    : activated.includes(project.id)
                      ? { ...project, isDeactivated: false }
                      : project,
                ),
              ),
            );
            setProjectSlots(null);
            void refreshProjectSlots();
          }}
        />
      ) : null}

      {isBackdropMounted ? (
        <button
          type="button"
          aria-label="Închide meniul"
          onClick={() => setSidebarOpen(false)}
          // Fades with the drawer instead of snapping in and out.
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden ${
            isBackdropVisible ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      <aside
        className={getAccountSidebarShellClass(sidebarOpen, isSidebarCollapsed)}
        aria-label="Meniu principal"
      >
        <div className={getAccountSidebarHeaderClass(isSidebarCollapsed)}>
          <Logo collapsed={isSidebarCollapsed} />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-content lg:hidden"
            aria-label="Închide meniul"
          >
            <Icon className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="hidden h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-action-soft hover:text-content lg:flex"
            aria-label={isSidebarCollapsed ? "Extinde meniul" : "Restrânge meniul"}
            title={isSidebarCollapsed ? "Extinde meniul" : "Restrânge meniul"}
          >
            <Icon className="h-4 w-4">
              {isSidebarCollapsed ? (
                <path d="M13 5l7 7-7 7M20 12H4" />
              ) : (
                <path d="M11 19l-7-7 7-7M4 12h16" />
              )}
            </Icon>
          </button>
        </div>

        <div className={getAccountSidebarScrollClass(isSidebarCollapsed)}>
          <button
            type="button"
            onClick={openNewProject}
            className={getAccountSidebarActionClass(isSidebarCollapsed)}
          >
            <Icon>
              <path d="M12 5v14M5 12h14" />
            </Icon>
            <span className={getAccountSidebarActionLabelClass(isSidebarCollapsed)}>
              Proiect nou
            </span>
            <AccountSidebarTooltip enabled={isSidebarCollapsed}>
              Proiect nou
            </AccountSidebarTooltip>
          </button>

          <nav className="space-y-1">
            <button
              type="button"
              onClick={showHome}
              className={getAccountSidebarItemClass(
                view === "home",
                isSidebarCollapsed,
              )}
            >
              <Icon className="h-[18px] w-[18px]">
                <path d="M3 11l9-8 9 8" />
                <path d="M5 10v10h14V10" />
              </Icon>
              <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                Acasă
              </span>
              <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                Acasă
              </AccountSidebarTooltip>
            </button>

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setOpenSidebarGroup((currentGroup) =>
                    currentGroup === "settings" ? null : "settings",
                  )
                }
                className={getAccountSidebarItemClass(false, isSidebarCollapsed)}
                aria-expanded={openSidebarGroup === "settings"}
              >
                <Icon className="h-[18px] w-[18px]">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6l-.08.08a2 2 0 1 1-2.83-2.83l.08-.08A1.7 1.7 0 0 0 10.6 15a1.7 1.7 0 0 0-1.88-.34l-.1.04a2 2 0 1 1-1.53-3.7l.1-.04A1.7 1.7 0 0 0 7.8 9a1.7 1.7 0 0 0-.6-1l-.08-.08a2 2 0 1 1 2.83-2.83l.08.08A1.7 1.7 0 0 0 12 4.6a1.7 1.7 0 0 0 1-.6l.08-.08a2 2 0 1 1 2.83 2.83l-.08.08A1.7 1.7 0 0 0 16.4 9a1.7 1.7 0 0 0 1.88.34l.1-.04a2 2 0 1 1 1.53 3.7l-.1.04A1.7 1.7 0 0 0 19.4 15z" />
                </Icon>
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  Setări
                </span>
                <Icon
                  className={getAccountSidebarChevronClass(
                    openSidebarGroup === "settings",
                    isSidebarCollapsed,
                  )}
                >
                  <path d="M9 18l6-6-6-6" />
                </Icon>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  Setări
                </AccountSidebarTooltip>
              </button>
              <div
                className={`ml-5 mr-1 overflow-hidden transition-[max-height,opacity] duration-300 ${
                  isSidebarCollapsed ? "lg:hidden" : ""
                } ${
                  openSidebarGroup === "settings"
                    ? "max-h-80 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-2 space-y-1">
                  {sidebarSettingsItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className="flex items-center rounded-md px-2.5 py-1.5 text-sm font-semibold text-muted transition hover:bg-action-soft hover:text-content"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {isAdminRole(user.role) ? (
              <Link
                href="/admin/settings"
                onClick={() => setSidebarOpen(false)}
                className={getAccountSidebarItemClass(false, isSidebarCollapsed)}
              >
                <Icon className="h-[18px] w-[18px]">
                  <path d="M12 3 20 6v6c0 5-3.4 8.5-8 9-4.6-.5-8-4-8-9V6l8-3z" />
                  <path d="M9 12l2 2 4-4" />
                </Icon>
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  Setări admin
                </span>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  Setări admin
                </AccountSidebarTooltip>
              </Link>
            ) : null}

            <div className="pt-1">
              <button
                type="button"
                onClick={() =>
                  setOpenSidebarGroup((currentGroup) =>
                    currentGroup === "billing" ? null : "billing",
                  )
                }
                className={getAccountSidebarItemClass(false, isSidebarCollapsed)}
                aria-expanded={openSidebarGroup === "billing"}
              >
                <Icon className="h-[18px] w-[18px]">
                  <path d="M12 3l3.2 6.5 7.1 1-5.1 5 1.2 7-6.4-3.4-6.4 3.4 1.2-7-5.1-5 7.1-1L12 3z" />
                </Icon>
                <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                  Abonament
                </span>
                <Icon
                  className={getAccountSidebarChevronClass(
                    openSidebarGroup === "billing",
                    isSidebarCollapsed,
                  )}
                >
                  <path d="M9 18l6-6-6-6" />
                </Icon>
                <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                  Abonament
                </AccountSidebarTooltip>
              </button>
              <div
                className={`ml-5 mr-1 overflow-hidden transition-[max-height,opacity] duration-300 ${
                  isSidebarCollapsed ? "lg:hidden" : ""
                } ${
                  openSidebarGroup === "billing"
                    ? "max-h-32 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mt-2 space-y-1">
                  {sidebarBillingItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className="flex items-center rounded-md px-2.5 py-1.5 text-sm font-semibold text-muted transition hover:bg-action-soft hover:text-content"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          <p
            className={`px-3 pt-5 text-[10px] font-black uppercase tracking-[0.18em] text-muted ${
              isSidebarCollapsed ? "lg:hidden" : ""
            }`}
          >
            Proiectele tale
          </p>

          <div className="mt-2 space-y-1">
            {projects.length ? (
              projects.map((project) => {
                const isOpen = openProjectId === project.id;
                const isActiveProject =
                  activeProjectId === project.id && view === "project";
                const projectInitial = project.name.trim().charAt(0).toUpperCase();

                return (
                  <div key={project.id} className="overflow-visible rounded-md">
                    <button
                      type="button"
                      disabled={project.isDeactivated}
                      title={
                        project.isDeactivated
                          ? "Proiect dezactivat pe planul curent"
                          : undefined
                      }
                      onClick={() => {
                        if (isSidebarCollapsed && isDesktopSidebarViewport()) {
                          openProject(
                            project.id,
                            isActiveProject ? activeTab : "rezumat",
                          );
                          return;
                        }

                        setOpenProjectId((currentId) =>
                          currentId === project.id ? null : project.id,
                        );
                      }}
                      className={`${getAccountSidebarProjectClass(
                        isActiveProject,
                        isSidebarCollapsed,
                      )} disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
                    >
                      <span
                        className={`flex h-2 w-2 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-content ${
                          project.isDeactivated ? "bg-muted" : "bg-success"
                        } ${
                          isSidebarCollapsed
                            ? "lg:h-6 lg:w-6 lg:rounded-md lg:bg-success/20 lg:text-success"
                            : ""
                        }`}
                      >
                        <span className={isSidebarCollapsed ? "hidden lg:inline" : "hidden"}>
                          {projectInitial || "P"}
                        </span>
                      </span>
                      <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
                        <span className="block truncate text-sm font-semibold text-content">
                          {project.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {project.isDeactivated
                            ? "Dezactivat"
                            : project.subjectName}
                        </span>
                      </span>
                      <Icon
                        className={getAccountSidebarChevronClass(
                          isOpen,
                          isSidebarCollapsed,
                        )}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </Icon>
                      <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                        {project.name}
                      </AccountSidebarTooltip>
                    </button>

                    <div
                      className={`overflow-hidden transition-[max-height,opacity] duration-300 ${
                        isSidebarCollapsed ? "lg:hidden" : ""
                      } ${isOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}
                    >
                      <div className="ml-5 mr-1 mt-2 space-y-1">
                        {tabs.map((tab) => {
                          const isAiTabLocked =
                            tab.id === "chat" && !hasAiAccess;
                          const isActiveTab =
                            activeProjectId === project.id &&
                            view === "project" &&
                            activeTab === tab.id;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => openProject(project.id, tab.id)}
                              disabled={isAiTabLocked}
                              title={
                                isAiTabLocked
                                  ? AI_ACCESS_UNAVAILABLE_MESSAGE
                                  : undefined
                              }
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                                isAiTabLocked
                                  ? "cursor-not-allowed text-muted opacity-45"
                                  : "cursor-pointer text-muted hover:bg-action-soft hover:text-content"
                              } ${
                                isActiveTab
                                  ? "bg-action-soft font-semibold text-content"
                                  : ""
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p
                className={`rounded-md border border-dashed border-subtle px-3 py-4 text-xs leading-5 text-muted ${
                  isSidebarCollapsed ? "lg:hidden" : ""
                }`}
              >
                Nu ai proiecte încă.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-subtle p-3">
          <div
            className={`flex items-center gap-3 rounded-md px-2 py-2 ${
              isSidebarCollapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-success-soft text-xs font-bold text-success ${
                isSidebarCollapsed ? "lg:hidden" : ""
              }`}
            >
              {initials(user.full_name)}
            </span>
            <span className={getAccountSidebarLabelClass(isSidebarCollapsed)}>
              <span className="block truncate text-sm font-semibold text-content">
                {user.full_name}
              </span>
              <span className="block truncate text-xs text-muted">
                {user.email}
              </span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={`group/sidebar-item relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-action-soft hover:text-content disabled:cursor-wait disabled:opacity-60 ${
                isSidebarCollapsed ? "lg:h-10 lg:w-10" : ""
              }`}
              aria-label="Ieși din cont"
            >
              <Icon>
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
                <path d="M21 19V5" />
              </Icon>
              <AccountSidebarTooltip enabled={isSidebarCollapsed}>
                Ieși din cont
              </AccountSidebarTooltip>
            </button>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <AccountMobileTopBar onOpenMenu={() => setSidebarOpen(true)} />

        <main className="w-full px-2 pb-5 pt-4 sm:px-4 md:px-5 lg:px-6 lg:py-8 xl:px-8">
          {view === "home" ? (
            <HomeView
              displayName={displayName}
              projects={projects}
              usage={usage}
              onOpenProject={openProject}
              onOpenNewProject={openNewProject}
              onRenameProject={renameProject}
              onArchiveProject={archiveProject}
              onSetProjectActivation={setProjectActivation}
              onDeleteProject={removeProject}
            />
          ) : null}

          {view === "project" && (isProjectsLoading || !activeProject) ? (
            <ProjectViewSkeleton tab={activeTab} />
          ) : null}

          {view === "project" && !isProjectsLoading && activeProject ? (
            <ProjectView
              project={activeProject}
              activeTab={activeTab}
              chatBackTab={chatBackTab}
              flashcardMode={initialFlashcardMode}
              hasAiAccess={hasAiAccess}
              maxQuizQuestions={maxQuizQuestions}
              maxQuizzesPerProject={maxQuizzesPerProject}
              isTabContentLoading={isTabRoutePending}
              onBack={showHome}
              onTabChange={changeProjectTab}
              onUsageRefresh={refreshUsageSnapshot}
              onQuizMistake={saveQuizMistakeFlashcard}
              onQuizComplete={completeQuizAttempt}
              onGenerateQuiz={generateProjectQuiz}
              onCancelQuizGeneration={cancelProjectQuizGeneration}
              onManualFlashcardCreate={addManualFlashcard}
              onToggleFlashcardReview={toggleFlashcardReview}
              onHighlightCreate={addSummaryHighlight}
              onHighlightColorChange={changeSummaryHighlightColor}
              onHighlightRemove={removeSummaryHighlight}
              onHighlightsReset={resetSummaryHighlights}
              onNoteCreate={addSummaryNote}
              onNoteUpdate={changeSummaryNote}
              onNoteRemove={removeSummaryNote}
            />
          ) : null}

          {view === "new" ? (
            <NewProjectView
              projectName={projectName}
              subjectName={subjectName}
              institutionName={institutionName}
              files={uploadedFiles}
              canGenerate={canGenerate}
              hasMaterialRights={hasMaterialRights}
              generationState={generationState}
              generationProgress={generationProgress}
              completedSteps={completedSteps}
              preparedProject={preparedProject}
              isCancellingGeneration={isCancellingGeneration}
              quotaNotice={monthlyUploadQuotaNotice}
              planLimits={uploadPlanLimits}
              isDragging={isDragging}
              fileInputRef={fileInputRef}
              onBack={showHome}
              onProjectNameChange={setProjectName}
              onSubjectNameChange={setSubjectName}
              onInstitutionNameChange={setInstitutionName}
              onMaterialRightsChange={setHasMaterialRights}
              onAddFiles={addFiles}
              onRemoveFile={removeUploadedFile}
              onDrop={handleDrop}
              onDragStateChange={setIsDragging}
              onStartGeneration={startGeneration}
              onCancelGeneration={cancelActiveGeneration}
              onOpenGeneratedProject={createGeneratedProject}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
      {children}
    </p>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-surface-hover ${className}`}
    />
  );
}

function ProjectTabContentSkeleton({ tab }: { tab: TabId }) {
  // One definition of what each tab's placeholder looks like, shared with the
  // route-level loading files.
  return <ProjectTabSkeleton tab={tab} />;
}

function ProjectViewSkeleton({ tab }: { tab: TabId }) {
  return (
    <section aria-busy="true" className="space-y-5">
      <div className="border-b border-subtle pb-5">
        <SkeletonBlock className="h-10 w-44" />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-12 w-72 max-w-[80vw]" />
        </div>
      </div>
      <div className="border-b border-subtle px-2">
        <div className="mx-auto flex min-w-max max-w-3xl items-center gap-6 overflow-hidden py-4">
          {tabs.map((tab, index) => (
            <SkeletonBlock
              key={tab.id}
              className={`h-5 ${index % 2 === 0 ? "w-20" : "w-28"}`}
            />
          ))}
        </div>
      </div>
      <ProjectTabContentSkeleton tab={tab} />
    </section>
  );
}

function AccountMetric({
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
      <p className="mt-4 font-serif text-4xl font-semibold leading-none text-content">
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{detail}</p>
    </article>
  );
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  if (limit <= 0) {
    return (
      <div className="py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-content">{label}</p>
          <span className="rounded-md bg-app px-2.5 py-1 text-[11px] font-bold text-muted">
            Indisponibil
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-app" />
      </div>
    );
  }

  const percent = Math.min(100, Math.round((used / limit) * 100));
  const barClass =
    percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-warning" : "bg-success";
  const badgeClass =
    percent >= 90
      ? "bg-danger-soft text-danger"
      : percent >= 70
        ? "bg-warning-soft text-warning"
        : "bg-success-soft text-success";

  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-content">{label}</p>
        <span
          className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}
        >
          {used} / {limit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function UsageSection({ usage }: { usage: Usage | null }) {
  if (!usage) return null;

  const meters = [
    {
      key: "projects",
      label: "Proiecte lunare",
      used: usage.projects_used,
      limit: usage.projects_limit,
    },
    {
      key: "materials",
      label: "Materiale",
      used: usage.materials_used,
      limit: usage.materials_limit,
    },
    {
      key: "pages",
      label: "Pagini procesate",
      used: usage.pages_processed,
      limit: usage.pages_limit,
    },
    {
      key: "credits",
      label: "AI Credits",
      used: usage.ai_credits_used,
      limit: usage.ai_credits_limit,
    },
    {
      key: "ocr",
      label: "Pagini OCR",
      used: usage.ocr_pages_used,
      limit: usage.ocr_pages_limit,
    },
  ];

  const withPercent = meters
    .filter((meter) => meter.limit > 0)
    .map((meter) => ({
      ...meter,
      percent: Math.min(100, Math.round((meter.used / meter.limit) * 100)),
    }));
  const mostUsed = withPercent.reduce(
    (highest, meter) =>
      !highest || meter.percent > highest.percent ? meter : highest,
    null as (typeof withPercent)[number] | null,
  );

  const resetDateLabel = new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "long",
  }).format(new Date(usage.reset_date));

  return (
    <>
      {mostUsed && mostUsed.percent >= 70 ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            mostUsed.percent >= 100
              ? "border-danger-border bg-danger-soft text-danger"
              : "border-warning-border bg-warning-soft text-warning"
          }`}
        >
          {mostUsed.percent >= 100
            ? `Ai atins limita planului curent pentru „${mostUsed.label}". Poti face upgrade la un plan superior.`
            : mostUsed.percent >= 90
              ? `Te apropii de limita lunară pentru „${mostUsed.label}". Mai ai ${mostUsed.limit - mostUsed.used} disponibile.`
              : `Ai utilizat ${mostUsed.percent}% din resursele incluse luna aceasta pentru „${mostUsed.label}".`}
        </div>
      ) : null}

      <div className="rounded-xl border border-subtle bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Utilizare luna aceasta</SectionLabel>
          <p className="text-xs font-semibold text-muted">
            Resetare pe: {resetDateLabel}
          </p>
        </div>
        <div className="mt-2 divide-y divide-subtle">
          {meters.map((meter) => (
            <UsageMeter
              key={meter.key}
              label={meter.label}
              used={meter.used}
              limit={meter.limit}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function HomeView({
  displayName,
  projects,
  usage,
  onOpenProject,
  onOpenNewProject,
  onRenameProject,
  onArchiveProject,
  onSetProjectActivation,
  onDeleteProject,
}: {
  displayName: string;
  projects: StudyProject[];
  usage: Usage | null;
  onOpenProject: (projectId: string, tab?: TabId) => void;
  onOpenNewProject: () => void;
  onRenameProject: (projectId: string, name: string) => Promise<void> | void;
  onArchiveProject: (projectId: string) => Promise<void> | void;
  onSetProjectActivation: (
    projectId: string,
    isActive: boolean,
  ) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
}) {
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(
    null,
  );
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [deleteCandidateProject, setDeleteCandidateProject] =
    useState<StudyProject | null>(null);
  const deletingProjectIdsRef = useRef(new Set<string>());
  const readyProjects = projects.filter((project) => project.status === "ready").length;
  const deactivatedProjectCount = projects.filter(
    (project) => project.isDeactivated,
  ).length;
  const activeProjectCount = projects.length - deactivatedProjectCount;
  const activeFlashcards = projects.reduce(
    (total, project) => total + project.flashcardsTotal,
    0,
  );
  const projectCountLabel =
    projects.length === 0
      ? "Nu ai încă proiecte. Încarcă primul curs și începem."
      : projects.length === 1
        ? "Ai 1 proiect pregătit pentru studiu."
        : `Ai ${projects.length} proiecte pregătite pentru studiu.`;

  function startRename(project: StudyProject) {
    setOpenMenuProjectId(null);
    setRenamingProjectId(project.id);
    setRenameDraft(project.name);
  }

  async function submitRename(projectId: string) {
    const nextName = renameDraft.trim();
    if (nextName.length < 2) {
      toast.error("Numele proiectului trebuie să aibă cel puțin 2 caractere.");
      return;
    }

    setBusyProjectId(projectId);
    try {
      await onRenameProject(projectId, nextName);
      setRenamingProjectId(null);
      setRenameDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Proiectul nu a putut fi redenumit.",
      );
    } finally {
      setBusyProjectId(null);
    }
  }

  async function archiveProject(projectId: string) {
    setBusyProjectId(projectId);
    setOpenMenuProjectId(null);
    try {
      await onArchiveProject(projectId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Proiectul nu a putut fi arhivat.",
      );
    } finally {
      setBusyProjectId(null);
    }
  }

  async function toggleProjectActivation(projectId: string, isActive: boolean) {
    setBusyProjectId(projectId);
    setOpenMenuProjectId(null);
    try {
      await onSetProjectActivation(projectId, isActive);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Starea proiectului nu a putut fi schimbată.",
      );
    } finally {
      setBusyProjectId(null);
    }
  }

  async function confirmDeleteProject(projectId: string) {
    if (deletingProjectIdsRef.current.has(projectId)) return;

    deletingProjectIdsRef.current.add(projectId);
    setBusyProjectId(projectId);
    try {
      await onDeleteProject(projectId);
      setDeleteCandidateProject(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Proiectul nu a putut fi șters.",
      );
    } finally {
      deletingProjectIdsRef.current.delete(projectId);
      setBusyProjectId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-6 border-b border-subtle pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            Acasă
          </span>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
            Bună, <em className="text-success">{displayName}</em>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            {projectCountLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNewProject}
          className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action shadow-sm transition hover:-translate-y-0.5 hover:bg-action-hover"
        >
          <Icon>
            <path d="M12 5v14M5 12h14" />
          </Icon>
          Proiect nou
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <AccountMetric
          label="Proiecte active"
          value={activeProjectCount.toString()}
          detail={
            deactivatedProjectCount === 0
              ? "în spațiul tău de studiu"
              : deactivatedProjectCount === 1
                ? "1 dezactivat pe planul curent"
                : `${deactivatedProjectCount} dezactivate pe planul curent`
          }
        />
        <AccountMetric
          label="Pachete de studiu"
          value={readyProjects.toString()}
          detail="cu pachet generat"
        />
        <AccountMetric
          label="Flashcard-uri"
          value={activeFlashcards.toString()}
          detail="în pachetele generate"
        />
      </div>

      <UsageSection usage={usage} />

      <SectionLabel>Proiectele tale</SectionLabel>
      <div>
        {projects.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className={`theme-shadow-card group relative flex min-h-[230px] flex-col rounded-xl border p-6 transition ${
                  project.isDeactivated
                    ? "border-warning-border bg-surface-hover"
                    : "border-subtle bg-surface hover:-translate-y-0.5 hover:border-content/25"
                }`}
              >
                {project.isDeactivated ? (
                  <p className="mb-3 inline-flex w-fit items-center gap-2 rounded-md border border-warning-border bg-warning-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-warning">
                    Dezactivat
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenuProjectId((currentProjectId) =>
                      currentProjectId === project.id ? null : project.id,
                    )
                  }
                  className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-md border border-subtle bg-surface text-content transition hover:bg-surface-hover"
                  aria-label={`Deschide meniul pentru ${project.name}`}
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="5" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="19" r="1.8" />
                  </svg>
                </button>

                {openMenuProjectId === project.id ? (
                  <div className="absolute right-4 top-14 z-30 w-52 rounded-xl border border-subtle bg-surface p-1.5 shadow-xl shadow-black/10">
                    <button
                      type="button"
                      onClick={() => startRename(project)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition hover:bg-surface-hover"
                    >
                      <Icon>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </Icon>
                      Redenumire
                    </button>
                    <button
                      type="button"
                      disabled={busyProjectId === project.id}
                      onClick={() =>
                        void toggleProjectActivation(
                          project.id,
                          project.isDeactivated,
                        )
                      }
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
                    >
                      <Icon>
                        {project.isDeactivated ? (
                          <>
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="9" />
                          </>
                        ) : (
                          <>
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V8a4 4 0 0 1 8 0" />
                          </>
                        )}
                      </Icon>
                      {project.isDeactivated ? "Activare" : "Dezactivare"}
                    </button>
                    <button
                      type="button"
                      disabled={busyProjectId === project.id}
                      onClick={() => void archiveProject(project.id)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
                    >
                      <Icon>
                        <path d="M21 8v13H3V8" />
                        <path d="M1 3h22v5H1z" />
                        <path d="M10 12h4" />
                      </Icon>
                      Arhivare
                    </button>
                    <button
                      type="button"
                      disabled={busyProjectId === project.id}
                      onClick={() => {
                        setOpenMenuProjectId(null);
                        setDeleteCandidateProject(project);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
                    >
                      <Icon>
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </Icon>
                      Ștergere
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={project.isDeactivated}
                  onClick={() => onOpenProject(project.id)}
                  className="flex w-full flex-1 flex-col items-start text-left disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-success"
                    style={{
                      background: `conic-gradient(var(--theme-success-text) ${project.progress}%, var(--theme-border) 0)`,
                    }}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
                      {project.progress}%
                    </span>
                  </span>

                  <span className="mt-7 block pr-10 font-serif text-2xl font-semibold leading-tight text-content">
                    {project.name}
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-muted">
                    {project.meta}
                  </span>
                  <span
                    className={`mt-auto inline-flex items-center gap-2 border-t border-subtle pt-5 text-xs font-black uppercase tracking-[0.12em] text-muted transition ${
                      project.isDeactivated ? "" : "group-hover:text-content"
                    }`}
                  >
                    {project.isDeactivated ? (
                      "Indisponibil pe planul curent"
                    ) : (
                      <>
                        Deschide proiectul
                        <Icon className="h-3.5 w-3.5">
                          <path d="M5 12h14M13 5l7 7-7 7" />
                        </Icon>
                      </>
                    )}
                  </span>
                </button>

                {renamingProjectId === project.id ? (
                  <div className="absolute inset-x-6 bottom-6 z-20 border-t border-subtle bg-surface pt-4">
                    <label className="block text-[11px] font-black uppercase tracking-[0.12em] text-muted">
                      Nume proiect
                      <input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void submitRename(project.id);
                          }
                          if (event.key === "Escape") {
                            setRenamingProjectId(null);
                          }
                        }}
                        className="mt-2 h-11 w-full rounded-lg border border-subtle bg-app px-3 text-sm font-semibold text-content outline-none transition focus:border-action"
                        autoFocus
                      />
                    </label>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRenamingProjectId(null)}
                        className="rounded-md border border-subtle px-3 py-2 text-xs font-bold transition hover:bg-surface-hover"
                      >
                        Renunță
                      </button>
                      <button
                        type="button"
                        disabled={busyProjectId === project.id}
                        onClick={() => void submitRename(project.id)}
                        className="rounded-md bg-action px-3 py-2 text-xs font-bold text-on-action disabled:cursor-wait disabled:opacity-60"
                      >
                        Salvează
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-subtle bg-surface p-8 text-center">
            <p className="font-serif text-xl font-semibold">
              Niciun proiect încă.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Creează primul proiect, încarcă materialele și Reviss îți
              pregătește rezumatul, flashcardurile și quizurile.
            </p>
          </div>
        )}
      </div>

      {deleteCandidateProject ? (
        <ProjectDeleteModal
          project={deleteCandidateProject}
          isDeleting={busyProjectId === deleteCandidateProject.id}
          onCancel={() => setDeleteCandidateProject(null)}
          onConfirm={() => void confirmDeleteProject(deleteCandidateProject.id)}
        />
      ) : null}
    </section>
  );
}

function ProjectDeleteModal({
  project,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  project: StudyProject;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-subtle bg-surface shadow-2xl shadow-black/20">
        <div className="border-b border-subtle px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-soft text-danger">
              <Icon className="h-5 w-5">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
              </Icon>
            </span>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-danger">
              Ștergere definitivă
            </p>
          </div>

          <h2
            id="delete-project-title"
            className="mt-4 font-serif text-3xl font-semibold leading-tight text-content sm:text-4xl"
          >
            Confirmă ștergerea proiectului.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted">
            Această acțiune elimină proiectul, materialele convertite și
            conținutul generat. Pentru păstrare fără afișare, folosește
            arhivarea.
          </p>
        </div>

        <div className="divide-y divide-subtle">
          <div className="grid gap-1 px-6 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted">
              Proiect
            </span>
            <strong className="min-w-0 font-serif text-2xl font-semibold leading-tight text-content">
              {project.name}
            </strong>
          </div>
          <div className="grid gap-1 px-6 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted">
              Conținut
            </span>
            <span className="text-sm font-semibold text-content">
              Materiale, rezumat, flashcard-uri, quiz-uri și progres.
            </span>
          </div>
          <div className="grid gap-1 px-6 py-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-muted">
              Alternativă
            </span>
            <span className="text-sm text-muted">
              Arhivează proiectul dacă vrei doar să îl ascunzi temporar.
            </span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle bg-app/50 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-md border border-subtle bg-surface px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-app transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? "Se șterge..." : "Șterge definitiv"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectView({
  project,
  activeTab,
  chatBackTab,
  flashcardMode,
  hasAiAccess,
  maxQuizQuestions,
  maxQuizzesPerProject,
  isTabContentLoading,
  onBack,
  onTabChange,
  onUsageRefresh,
  onQuizMistake,
  onQuizComplete,
  onGenerateQuiz,
  onCancelQuizGeneration,
  onManualFlashcardCreate,
  onToggleFlashcardReview,
  onHighlightCreate,
  onHighlightColorChange,
  onHighlightRemove,
  onHighlightsReset,
  onNoteCreate,
  onNoteUpdate,
  onNoteRemove,
}: {
  project: StudyProject;
  activeTab: TabId;
  chatBackTab: TabId;
  flashcardMode: FlashcardPanelMode;
  hasAiAccess: boolean;
  isTabContentLoading: boolean;
  onBack: () => void;
  onTabChange: (tab: TabId) => void;
  onUsageRefresh: () => Promise<void>;
  onQuizMistake: (
    projectId: string,
    questionId: string | null,
    fallbackFlashcard: StudyFlashcardCard,
  ) => void;
  onQuizComplete: (
    projectId: string,
    quizId: string,
    result: QuizCompletionResult,
  ) => Promise<void>;
  onGenerateQuiz: (
    projectId: string,
    config: QuizGenerationConfig,
  ) => Promise<StudyProject>;
  onCancelQuizGeneration: (projectId: string) => Promise<StudyProject>;
  /** Upper bound for one quiz, from the account's plan. */
  maxQuizQuestions: number;
  /** How many quizzes this project may hold, from the account's plan. */
  maxQuizzesPerProject: number;
  onManualFlashcardCreate: (
    projectId: string,
    flashcard: ManualFlashcardPayload,
  ) => Promise<void>;
  onToggleFlashcardReview: (
    projectId: string,
    flashcardId: string,
    review: boolean,
  ) => Promise<void>;
  onHighlightCreate: (
    projectId: string,
    highlight: {
      paragraphIndex: number;
      startOffset?: number | null;
      endOffset?: number | null;
      text: string;
      color: ApiSummaryHighlightColor;
    },
  ) => Promise<void>;
  onHighlightColorChange: (
    projectId: string,
    highlightId: string,
    color: ApiSummaryHighlightColor,
  ) => Promise<void>;
  onHighlightRemove: (projectId: string, highlightId: string) => Promise<void>;
  onHighlightsReset: (projectId: string) => Promise<void>;
  onNoteCreate: (
    projectId: string,
    note: { paragraphIndex: number; text: string; note: string },
  ) => Promise<void>;
  onNoteUpdate: (
    projectId: string,
    noteId: string,
    note: string,
  ) => Promise<void>;
  onNoteRemove: (projectId: string, noteId: string) => Promise<void>;
}) {
  const [areProjectTabsVisible, setAreProjectTabsVisible] = useState(true);
  const lastProjectScrollYRef = useRef(0);
  const chatBackLabel =
    tabs.find((tab) => tab.id === chatBackTab)?.label ?? "Rezumat";

  useEffect(() => {
    if (activeTab === "chat") {
      return;
    }

    lastProjectScrollYRef.current = window.scrollY;

    const handleProjectTabsScroll = () => {
      const currentScrollY = window.scrollY;
      const distance = currentScrollY - lastProjectScrollYRef.current;

      if (Math.abs(distance) < 8) {
        return;
      }

      setAreProjectTabsVisible(distance < 0 || currentScrollY < 80);
      lastProjectScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", handleProjectTabsScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleProjectTabsScroll);
    };
  }, [activeTab, project.id]);

  if (activeTab === "chat") {
    return (
      <section className="space-y-4">
        <button
          type="button"
          onClick={() => onTabChange(isChatBackTab(chatBackTab) ? chatBackTab : "rezumat")}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-3 text-xs font-bold text-muted transition hover:bg-surface-hover hover:text-content"
        >
          <Icon>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </Icon>
          Înapoi la {chatBackLabel}
        </button>

        {isTabContentLoading ? (
          <ProjectTabContentSkeleton tab="chat" />
        ) : hasAiAccess ? (
          <ProjectChatPanel
            key={project.id}
            project={project}
            onUsageRefresh={onUsageRefresh}
          />
        ) : (
          <ProjectAiLockedPanel />
        )}
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="border-b border-subtle pb-5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
          >
            <Icon>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </Icon>
            Proiectele tale
          </button>

          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Proiect activ
            </span>
            <h1 className="min-w-0 font-serif text-3xl font-semibold leading-none text-content sm:text-4xl">
              {project.name}
            </h1>
          </div>
        </div>
      </div>

      <div
        className={`sticky top-14 z-20 -mx-2 border-b border-subtle bg-app/95 px-2 backdrop-blur-xl transition-[translate,opacity] duration-300 lg:top-3 ${
          areProjectTabsVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-4 opacity-0"
        }`}
      >
        <div className="overflow-x-auto [scrollbar-width:none] md:flex md:justify-center [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-6">
          {tabs.map((tab) => {
            const isAiTabLocked = tab.id === "chat" && !hasAiAccess;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                disabled={isAiTabLocked}
                title={isAiTabLocked ? AI_ACCESS_UNAVAILABLE_MESSAGE : undefined}
                className={`relative py-4 text-sm font-black transition after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-md after:transition ${
                  isAiTabLocked
                    ? "cursor-not-allowed text-muted/45 after:bg-transparent"
                    : activeTab === tab.id
                      ? "cursor-pointer text-content after:bg-action"
                      : "cursor-pointer text-muted after:bg-transparent hover:text-content"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div aria-busy={isTabContentLoading}>
        {isTabContentLoading ? (
          <ProjectTabContentSkeleton tab={activeTab} />
        ) : (
          <>
            {activeTab === "rezumat" ? (
              <SummaryPanel
                project={project}
                hasAiAccess={hasAiAccess}
                onUsageRefresh={onUsageRefresh}
                onHighlightCreate={onHighlightCreate}
                onHighlightColorChange={onHighlightColorChange}
                onHighlightRemove={onHighlightRemove}
                onHighlightsReset={onHighlightsReset}
                onNoteCreate={onNoteCreate}
                onNoteUpdate={onNoteUpdate}
                onNoteRemove={onNoteRemove}
              />
            ) : null}
            {activeTab === "flashcards" ? (
              <FlashcardsPanel
                project={project}
                mode={flashcardMode}
                hasAiAccess={hasAiAccess}
                onUsageRefresh={onUsageRefresh}
                onManualFlashcardCreate={onManualFlashcardCreate}
                onToggleFlashcardReview={onToggleFlashcardReview}
              />
            ) : null}
            {activeTab === "quiz" ? (
              <QuizPanel
                project={project}
                onQuizMistake={onQuizMistake}
                onQuizComplete={onQuizComplete}
                onGenerateQuiz={onGenerateQuiz}
                onCancelQuizGeneration={onCancelQuizGeneration}
                maxQuizQuestions={maxQuizQuestions}
                maxQuizzesPerProject={maxQuizzesPerProject}
              />
            ) : null}
            {activeTab === "strategii" ? (
              <StrategiesPanel project={project} />
            ) : null}
            {activeTab === "progres" ? <ProgressPanel project={project} /> : null}
          </>
        )}
      </div>
    </section>
  );
}

type ProjectChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type ProjectChatTextBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] };

const PROJECT_CHAT_STORAGE_PREFIX = "reviss-project-chat";
const PROJECT_CHAT_MAX_STORED_MESSAGES = 40;
const PROJECT_CHAT_HISTORY_MESSAGES = 18;
const PROJECT_CHAT_SUMMARY_MESSAGES = 30;

function ProjectAiLockedPanel() {
  return (
    <section className="rounded-xl border border-subtle bg-surface p-6 sm:p-8">
      <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
        AI
      </span>
      <h2 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight text-content sm:text-4xl">
        Chat AI nu este disponibil pe planul curent.
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        {AI_ACCESS_UPGRADE_MESSAGE}
      </p>
      <Link
        href="/upgrade"
        className="mt-6 inline-flex h-11 cursor-pointer items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:bg-action-hover"
      >
        Vezi planurile
      </Link>
    </section>
  );
}

function createProjectChatIntro(project: StudyProject): ProjectChatMessage {
  return {
    id: `assistant-intro-${project.id}`,
    role: "assistant",
    text: `Salut! Sunt AI-ul pentru proiectul „${project.name}”. Întreabă-mă orice despre materialul acesta.`,
  };
}

function projectChatStorageKey(projectId: string) {
  return `${PROJECT_CHAT_STORAGE_PREFIX}:${projectId}`;
}

function truncateProjectChatText(value: string, maxLength: number) {
  const cleanValue = value.replace(/\s+/g, " ").trim();

  if (cleanValue.length <= maxLength) {
    return cleanValue;
  }

  return `${cleanValue.slice(0, maxLength).trim()}...`;
}

function isProjectChatIntro(message: ProjectChatMessage) {
  return message.id.startsWith("assistant-intro-");
}

function isProjectChatRole(value: unknown): value is ProjectChatMessage["role"] {
  return value === "assistant" || value === "user";
}

function createProjectChatMessageId(
  role: ProjectChatMessage["role"],
  projectId: string,
) {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${role}-${projectId}-${randomPart}`;
}

function loadProjectChatMessages(project: StudyProject): ProjectChatMessage[] {
  const introMessage = createProjectChatIntro(project);

  if (typeof window === "undefined") {
    return [introMessage];
  }

  try {
    const rawMessages = window.localStorage.getItem(
      projectChatStorageKey(project.id),
    );

    if (!rawMessages) {
      return [introMessage];
    }

    const parsedMessages: unknown = JSON.parse(rawMessages);

    if (!Array.isArray(parsedMessages)) {
      return [introMessage];
    }

    const validMessages = parsedMessages
      .map((item): ProjectChatMessage | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        const role = record.role;
        const text = record.text;
        const id = record.id;

        if (
          !isProjectChatRole(role) ||
          typeof text !== "string" ||
          !text.trim()
        ) {
          return null;
        }

        return {
          id:
            typeof id === "string" && id.trim()
              ? id
              : createProjectChatMessageId(role, project.id),
          role,
          text: text.trim(),
        };
      })
      .filter((item): item is ProjectChatMessage => item !== null)
      .filter((item) => !isProjectChatIntro(item))
      .slice(-(PROJECT_CHAT_MAX_STORED_MESSAGES - 1));

    return [introMessage, ...validMessages];
  } catch {
    return [introMessage];
  }
}

function saveProjectChatMessages(
  projectId: string,
  messages: ProjectChatMessage[],
) {
  if (typeof window === "undefined") {
    return;
  }

  const [introMessage] = messages;
  const storedMessages = [
    ...(introMessage ? [introMessage] : []),
    ...messages
      .filter((message) => !isProjectChatIntro(message))
      .filter((message) => message.text.trim())
      .slice(-(PROJECT_CHAT_MAX_STORED_MESSAGES - 1)),
  ];

  try {
    window.localStorage.setItem(
      projectChatStorageKey(projectId),
      JSON.stringify(storedMessages),
    );
  } catch {
    // Storage may be unavailable in private browsing; chat still works in memory.
  }
}

function removeStoredProjectChatMessages(projectId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(projectChatStorageKey(projectId));
  } catch {
    // Ignore storage errors; the visible chat state is reset separately.
  }
}

function toProjectChatHistory(messages: ProjectChatMessage[]) {
  return messages
    .filter((message) => !isProjectChatIntro(message))
    .filter((message) => message.text.trim())
    .slice(-PROJECT_CHAT_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      text: truncateProjectChatText(message.text, 1200),
    }));
}

function buildProjectChatConversationSummary(
  project: StudyProject,
  messages: ProjectChatMessage[],
) {
  const recentMessages = messages
    .filter((message) => !isProjectChatIntro(message))
    .filter((message) => message.text.trim())
    .slice(-PROJECT_CHAT_SUMMARY_MESSAGES);

  const conversationLines = recentMessages.map((message) => {
    const speaker = message.role === "user" ? "Student" : "Reviss";

    return `${speaker}: ${truncateProjectChatText(message.text, 700)}`;
  });

  return [
    `Proiect: ${project.name}`,
    `Materie: ${project.subjectName}`,
    `Institutie/nivel: ${project.institutionName}`,
    `Status proiect: ${project.status}`,
    conversationLines.length > 0
      ? "Fir conversational recent:"
      : "Nu exista mesaje anterioare in aceasta conversatie.",
    ...conversationLines,
  ].join("\n");
}

function parseProjectChatText(text: string): ProjectChatTextBlock[] {
  const blocks: ProjectChatTextBlock[] = [];
  const paragraphLines: string[] = [];
  let activeList:
    | { kind: "unordered-list"; items: string[] }
    | { kind: "ordered-list"; items: string[] }
    | null = null;

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      kind: "paragraph",
      text: paragraphLines.join(" ").trim(),
    });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!activeList || activeList.items.length === 0) {
      activeList = null;
      return;
    }

    blocks.push(activeList);
    activeList = null;
  }

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);

    if (unorderedMatch) {
      flushParagraph();
      if (activeList?.kind !== "unordered-list") {
        flushList();
        activeList = { kind: "unordered-list", items: [] };
      }
      activeList.items.push(unorderedMatch[1].trim());
      continue;
    }

    if (orderedMatch) {
      flushParagraph();
      if (activeList?.kind !== "ordered-list") {
        flushList();
        activeList = { kind: "ordered-list", items: [] };
      }
      activeList.items.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text }];
}

function renderProjectChatInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`${segment}-${index}`} className="font-extrabold">
          {segment.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${segment}-${index}`}>{segment}</span>;
  });
}

function ProjectChatMessageText({ text }: { text: string }) {
  const blocks = parseProjectChatText(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.kind === "unordered-list") {
          return (
            <ul
              key={`${block.kind}-${index}`}
              className="ml-4 list-disc space-y-1 marker:text-current"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {renderProjectChatInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === "ordered-list") {
          return (
            <ol
              key={`${block.kind}-${index}`}
              className="ml-4 list-decimal space-y-1 marker:text-current"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {renderProjectChatInline(item)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`${block.kind}-${index}`}>
            {renderProjectChatInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function ProjectChatPanel({
  project,
  onUsageRefresh,
}: {
  project: StudyProject;
  onUsageRefresh: () => Promise<void>;
}) {
  const streamTimerRef = useRef<number | null>(null);
  const chatRequestIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<ProjectChatMessage[]>(() =>
    loadProjectChatMessages(project),
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isGenerating]);

  useEffect(() => {
    const input = messageInputRef.current;

    if (!input) {
      return;
    }

    input.style.height = "0px";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }, [draftMessage]);

  useEffect(() => {
    if (streamingMessageId) {
      return;
    }

    saveProjectChatMessages(project.id, messages);
  }, [messages, project.id, streamingMessageId]);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        window.clearInterval(streamTimerRef.current);
      }
      chatRequestIdRef.current += 1;
    };
  }, []);

  function startNewChat() {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    chatRequestIdRef.current += 1;
    removeStoredProjectChatMessages(project.id);
    setMessages([createProjectChatIntro(project)]);
    setDraftMessage("");
    setIsGenerating(false);
    setStreamingMessageId(null);

    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }

  function streamAssistantAnswer(assistantMessageId: string, answer: string) {
    const cleanAnswer =
      answer.trim() ||
      "Nu am putut genera un răspuns util momentan. Încearcă din nou peste câteva momente.";
    const answerChunks = cleanAnswer.match(/\S+\s*/g) ?? [cleanAnswer];
    let chunkIndex = 0;
    let streamedAnswer = "";

    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    streamTimerRef.current = window.setInterval(() => {
      const nextChunk = answerChunks[chunkIndex];

      if (nextChunk === undefined) {
        if (streamTimerRef.current) {
          window.clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
        }
        setIsGenerating(false);
        setStreamingMessageId(null);
        return;
      }

      streamedAnswer += nextChunk;
      chunkIndex += 1;

      setMessages((currentMessages) =>
        currentMessages.map((currentMessage) =>
          currentMessage.id === assistantMessageId
            ? { ...currentMessage, text: streamedAnswer }
            : currentMessage,
        ),
      );
    }, 34);
  }

  async function sendChatMessage(message?: string) {
    const text = (message ?? draftMessage).trim();

    if (!text || isGenerating) {
      return;
    }

    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    chatRequestIdRef.current += 1;
    const requestId = chatRequestIdRef.current;
    const history = toProjectChatHistory(messages);
    const conversationSummary = buildProjectChatConversationSummary(
      project,
      messages,
    );

    const userMessage: ProjectChatMessage = {
      id: createProjectChatMessageId("user", project.id),
      role: "user",
      text,
    };

    const assistantMessageId = createProjectChatMessageId(
      "assistant",
      project.id,
    );

    setStreamingMessageId(assistantMessageId);
    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        text: "",
      },
    ]);
    setDraftMessage("");
    if (messageInputRef.current) {
      messageInputRef.current.style.height = "0px";
    }
    setIsGenerating(true);

    try {
      const response = await chatWithStudyProjectAi({
        projectId: project.id,
        message: text,
        history,
        conversationSummary,
      });

      if (requestId !== chatRequestIdRef.current) {
        return;
      }

      void onUsageRefresh();
      streamAssistantAnswer(assistantMessageId, response.answer);
    } catch (error) {
      if (requestId !== chatRequestIdRef.current) {
        return;
      }

      const fallbackAnswer =
        error instanceof Error
          ? error.message
          : "Răspunsul nu a putut fi generat momentan. Încearcă din nou.";
      streamAssistantAnswer(assistantMessageId, fallbackAnswer);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-subtle bg-surface">
      <div className="flex h-[calc(100svh-7.75rem)] min-h-[34rem] max-h-[58rem] flex-col">
        <div className="flex shrink-0 justify-end border-b border-subtle bg-surface px-4 py-2 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={startNewChat}
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-subtle bg-app px-3 text-xs font-bold text-content transition hover:bg-surface-hover"
          >
            Chat nou
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const isStreaming = message.id === streamingMessageId;
              const isWaiting = isStreaming && !message.text;

              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${
                    isAssistant ? "justify-start" : "justify-end"
                  }`}
                >
                  {isAssistant ? <ProjectChatAssistantAvatar /> : null}
                  <article
                    className={`max-w-[min(42rem,90%)] border px-3 py-2 text-sm leading-6 ${
                      isAssistant
                        ? "rounded-r-xl rounded-bl-sm rounded-tl-xl border-subtle bg-app text-content"
                        : "rounded-l-xl rounded-br-sm rounded-tr-xl border-action bg-action text-on-action"
                    }`}
                  >
                    {isWaiting ? (
                      <div className="flex items-center gap-2 text-muted">
                        <span className="text-xs font-bold text-content">
                          Reviss pregătește răspunsul
                        </span>
                        <span
                          aria-hidden="true"
                          className="inline-flex items-center gap-1"
                        >
                          <span className="h-1 w-1 animate-pulse rounded-full bg-info" />
                          <span className="h-1 w-1 animate-pulse rounded-full bg-info [animation-delay:120ms]" />
                          <span className="h-1 w-1 animate-pulse rounded-full bg-info [animation-delay:240ms]" />
                        </span>
                      </div>
                    ) : (
                      <div>
                        <ProjectChatMessageText text={message.text} />
                        {isStreaming ? (
                          <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-info align-baseline" />
                        ) : null}
                      </div>
                    )}
                  </article>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-subtle bg-surface p-2 sm:p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendChatMessage();
            }}
            className="mx-auto flex max-w-5xl items-end gap-2 rounded-xl border border-subtle bg-app p-1.5"
          >
            <label className="sr-only" htmlFor="project-chat-message">
              Mesaj pentru Chat AI
            </label>
            <textarea
              id="project-chat-message"
              ref={messageInputRef}
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendChatMessage();
                }
              }}
              placeholder="Scrie un mesaj..."
              rows={1}
              className="max-h-28 min-h-9 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm leading-5 text-content outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!draftMessage.trim() || isGenerating}
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Trimite
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function ProjectChatAssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="brand-logo-mask brand-logo-mask-mark mt-1 h-3.5 w-3.5 shrink-0 text-content"
    />
  );
}

type SummaryDisplayBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list-item"; text: string };

type SummaryRenderGroup =
  | { kind: "heading"; paragraphIndex: number; level: number; text: string }
  | { kind: "paragraph"; paragraphIndex: number; text: string }
  | { kind: "list"; items: { paragraphIndex: number; text: string }[] };

type SummaryKeyword = {
  id: string;
  label: string;
  text: string;
  paragraphIndex: number;
};

type UserSummaryHighlight = {
  id: string;
  text: string;
  paragraphIndex: number;
  color: SummaryHighlightColorId;
  startOffset: number | null;
  endOffset: number | null;
};

type UserSummaryNote = {
  id: string;
  text: string;
  paragraphIndex: number;
  note: string;
};

type PendingSummarySelection = {
  text: string;
  paragraphIndex: number;
  startOffset: number | null;
  endOffset: number | null;
};

type SummaryToolMode = "highlight" | "erase" | "ai" | "note";

type SummaryNotePanelState =
  | { mode: "create"; selection: PendingSummarySelection; draft: string }
  | { mode: "view"; note: UserSummaryNote; draft: string };

type LearningAiResponse = {
  title: string;
  answer: string;
  bullets: string[];
};

type SummaryAiDialog = {
  text: string;
  paragraphIndex: number;
  question: string | null;
  status: "loading" | "done";
  response?: LearningAiResponse;
};

type SummaryRange = {
  start: number;
  end: number;
  kind: "keyword" | "user" | "note";
  keyword?: SummaryKeyword;
  highlight?: UserSummaryHighlight;
  note?: UserSummaryNote;
};

type SummaryInlineSegment = {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
};
type SummaryHighlightColorId =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange";

const defaultSummaryHighlightColor: SummaryHighlightColorId = "yellow";

const summaryHighlightColors: Array<{
  id: SummaryHighlightColorId;
  label: string;
  bg: string;
  text: string;
  border: string;
}> = [
  {
    id: "yellow",
    label: "Galben",
    bg: "#fff3bf",
    text: "#5f3e00",
    border: "#f3d36b",
  },
  {
    id: "green",
    label: "Verde",
    bg: "#dcfce7",
    text: "#166534",
    border: "#86efac",
  },
  {
    id: "blue",
    label: "Albastru",
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#93c5fd",
  },
  {
    id: "pink",
    label: "Roz",
    bg: "#fce7f3",
    text: "#9d174d",
    border: "#f9a8d4",
  },
  {
    id: "purple",
    label: "Mov",
    bg: "#ede9fe",
    text: "#6d28d9",
    border: "#c4b5fd",
  },
  {
    id: "orange",
    label: "Portocaliu",
    bg: "#ffedd5",
    text: "#9a3412",
    border: "#fdba74",
  },
];

function splitParagraphEnumeration(text: string): SummaryDisplayBlock[] {
  const colonIndex = text.indexOf(":");
  if (colonIndex === -1) {
    return [{ kind: "paragraph", text }];
  }

  const intro = text.slice(0, colonIndex + 1).trim();
  const rest = text.slice(colonIndex + 1).trim();
  const rawItems = rest
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  if (rawItems.length < 2) {
    return [{ kind: "paragraph", text }];
  }

  const items = rawItems.map((item, index) =>
    index === rawItems.length - 1 ? item.replace(/\.\s*$/, "") : item,
  );

  const blocks: SummaryDisplayBlock[] = [{ kind: "paragraph", text: intro }];
  items.forEach((item) => {
    if (item) {
      blocks.push({ kind: "list-item", text: item });
    }
  });

  return blocks;
}

function splitSummaryParagraphs(content: string): SummaryDisplayBlock[] {
  const blocks: SummaryDisplayBlock[] = [];
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (!paragraphLines.length) {
      return;
    }

    const text = normalizeSummarySelection(paragraphLines.join(" "));
    if (text) {
      blocks.push(...splitParagraphEnumeration(text));
    }
    paragraphLines = [];
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const text = normalizeSummarySelection(headingMatch[2]);
      if (text) {
        blocks.push({ kind: "heading", level: headingMatch[1].length, text });
      }
      continue;
    }

    const listMatch = line.match(/^[-*•]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      const text = normalizeSummarySelection(listMatch[1]);
      if (text) {
        blocks.push({ kind: "list-item", text });
      }
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

function findParagraphIndexForKeyword(
  paragraphs: SummaryDisplayBlock[],
  anchorText: string,
) {
  const anchor = normalizeSummarySelection(stripSummaryInlineMarkdown(anchorText)).toLowerCase();
  if (!anchor) return -1;
  const matches = paragraphs.flatMap((paragraph, index) =>
    paragraph.kind !== "heading" &&
    normalizeSummarySelection(stripSummaryInlineMarkdown(paragraph.text)).toLowerCase().includes(anchor)
      ? [index]
      : [],
  );
  return matches.length === 1 ? matches[0] : -1;
}

function buildProjectSummaryKeywords(
  keywords: StudyProject["keywords"],
  paragraphs: SummaryDisplayBlock[],
): SummaryKeyword[] {
  return keywords.flatMap((keyword) => {
    const anchorText = keyword.anchor_text || keyword.term;
    const savedIndex = keyword.paragraph_index;
    const savedBlock = savedIndex == null ? undefined : paragraphs[savedIndex];
    const anchor = normalizeSummarySelection(stripSummaryInlineMarkdown(anchorText)).toLowerCase();
    const paragraphIndex =
      anchor && savedBlock && savedBlock.kind !== "heading" &&
      normalizeSummarySelection(stripSummaryInlineMarkdown(savedBlock.text)).toLowerCase().includes(anchor)
        ? savedIndex!
        : findParagraphIndexForKeyword(paragraphs, anchorText);
    if (paragraphIndex < 0) return [];
    return [{
      id: `rezumat-${keyword.id}`,
      label: keyword.term,
      text: normalizeSummarySelection(stripSummaryInlineMarkdown(anchorText)),
      paragraphIndex,
    }];
  });
}

type QuizReviewLocation = {
  section: string;
  paragraphIndex: number;
  paragraphNumber: number;
  anchorText: string;
};

function getQuizReviewLocation(
  question: ApiStudyProject["quizzes"][number]["questions"][number],
  paragraphs: SummaryDisplayBlock[],
): QuizReviewLocation | null {
  const anchor = normalizeSummarySelection(question.review_anchor_text ?? "");
  const savedIndex = question.review_paragraph_index;
  if (!anchor || savedIndex == null || !Number.isInteger(savedIndex) || savedIndex < 0) {
    return null;
  }
  function matches(index: number) {
    const block = paragraphs[index];
    return block && block.kind !== "heading" &&
      normalizeSummarySelection(stripSummaryInlineMarkdown(block.text)).includes(anchor);
  }
  // Relocate a moved paragraph only by an unambiguous exact quote.
  const candidates = paragraphs.flatMap((_, index) => matches(index) ? [index] : []);
  const index = matches(savedIndex) ? savedIndex : candidates.length === 1 ? candidates[0] : -1;
  if (index < 0) return null;
  const headings: Array<{ level: number; text: string }> = [];
  let paragraphNumber = 0;
  for (const block of paragraphs.slice(0, index + 1)) {
    if (block.kind === "heading") {
      while (headings.length && headings[headings.length - 1].level >= block.level) {
        headings.pop();
      }
      headings.push({ level: block.level, text: stripSummaryInlineMarkdown(block.text) });
    } else {
      paragraphNumber += 1;
    }
  }
  return {
    section: headings.map((heading) => heading.text).join(" / ") || "Rezumat",
    paragraphIndex: index,
    paragraphNumber,
    anchorText: anchor,
  };
}

function QuizReviewReference({
  projectId,
  review,
}: {
  projectId: string;
  review: QuizReviewLocation;
}) {
  return (
    <div className="mt-3 rounded-md border border-subtle bg-app p-3 text-sm">
      <p className="font-semibold text-content">
        {review.section} → paragraful {review.paragraphNumber}
      </p>
      <p className="mt-1 leading-6 text-muted">„{review.anchorText}”</p>
      <Link
        href={`/myaccount/rezumat?project=${encodeURIComponent(projectId)}#summary-paragraph-${review.paragraphIndex}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex font-bold text-action underline underline-offset-4"
      >
        Deschide paragraful în rezumat ↗
      </Link>
    </div>
  );
}

function getQuizWeakConcepts(
  questions: AccountQuizQuestion[],
  submittedAnswers: Record<string, number[]>,
) {
  const concepts = new Map<string, string>();
  for (const question of questions) {
    const answer = submittedAnswers[question.id];
    if (answer === undefined || isQuizAnswerCorrect(question, answer)) continue;

    const concept = question.concept.trim();
    const key = concept.toLocaleLowerCase("ro-RO");
    if (concept && !concepts.has(key)) concepts.set(key, concept);
  }
  return [...concepts.values()];
}

function normalizeSummarySelection(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getSummaryHighlightColor(colorId: SummaryHighlightColorId) {
  return (
    summaryHighlightColors.find((color) => color.id === colorId) ??
    summaryHighlightColors[0]
  );
}

function getSummaryHighlightStyle(
  colorId: SummaryHighlightColorId,
): CSSProperties {
  const color = getSummaryHighlightColor(colorId);

  return {
    backgroundColor: color.bg,
    borderColor: color.border,
    color: color.text,
  };
}

function getSummaryParagraphIndex(node: Node | null) {
  const paragraph = getSummaryParagraphElement(node);
  const paragraphIndex = paragraph?.dataset.summaryParagraph;

  if (!paragraphIndex) {
    return null;
  }

  const parsedIndex = Number.parseInt(paragraphIndex, 10);
  return Number.isNaN(parsedIndex) ? null : parsedIndex;
}

function getSummaryParagraphElement(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-summary-paragraph]") ?? null;
}

function getSummarySelectionOffsets(range: Range, paragraph: HTMLElement) {
  if (
    !paragraph.contains(range.startContainer) ||
    !paragraph.contains(range.endContainer)
  ) {
    return null;
  }

  const prefixRange = range.cloneRange();
  prefixRange.selectNodeContents(paragraph);
  prefixRange.setEnd(range.startContainer, range.startOffset);

  const rawSelectedText = range.toString();
  const firstSelectedChar = rawSelectedText.search(/\S/);
  if (firstSelectedChar === -1) {
    return null;
  }

  const trailingWhitespaceLength =
    rawSelectedText.length - rawSelectedText.trimEnd().length;
  const prefixLength = prefixRange.toString().length;
  const startOffset = prefixLength + firstSelectedChar;
  const endOffset =
    prefixLength + rawSelectedText.length - trailingWhitespaceLength;

  return endOffset > startOffset ? { startOffset, endOffset } : null;
}

function findSummaryRanges(
  paragraph: string,
  searchText: string,
  range: Omit<SummaryRange, "start" | "end">,
) {
  const ranges: SummaryRange[] = [];
  const plainSearchText = stripSummaryInlineMarkdown(searchText);

  if (!plainSearchText) {
    return ranges;
  }

  const normalizedParagraph = paragraph.toLocaleLowerCase("ro-RO");
  const normalizedSearchText = plainSearchText.toLocaleLowerCase("ro-RO");
  let searchFrom = 0;

  while (searchFrom < paragraph.length) {
    const start = normalizedParagraph.indexOf(normalizedSearchText, searchFrom);

    if (start === -1) {
      break;
    }

    const end = start + plainSearchText.length;
    ranges.push({ ...range, start, end });
    searchFrom = end;
  }

  return ranges;
}

function findUserSummaryHighlightRanges(
  paragraph: string,
  highlight: UserSummaryHighlight,
) {
  const hasStoredOffsets =
    Number.isInteger(highlight.startOffset) &&
    Number.isInteger(highlight.endOffset);

  if (hasStoredOffsets) {
    const start = highlight.startOffset;
    const end = highlight.endOffset;

    if (
      start === null ||
      end === null ||
      start < 0 ||
      end <= start ||
      end > paragraph.length ||
      normalizeSummarySelection(paragraph.slice(start, end)) !== highlight.text
    ) {
      return [];
    }

    return [
      {
        start,
        end,
        kind: "user" as const,
        highlight,
      },
    ];
  }

  return findSummaryRanges(paragraph, highlight.text, {
    kind: "user",
    highlight,
  });
}

function pushSummaryInlineSegment(
  segments: SummaryInlineSegment[],
  text: string,
  style: Omit<SummaryInlineSegment, "text"> = {},
) {
  if (!text) {
    return;
  }

  const lastSegment = segments.at(-1);
  const strong = Boolean(style.strong);
  const emphasis = Boolean(style.emphasis);
  const code = Boolean(style.code);

  if (
    lastSegment &&
    Boolean(lastSegment.strong) === strong &&
    Boolean(lastSegment.emphasis) === emphasis &&
    Boolean(lastSegment.code) === code
  ) {
    lastSegment.text += text;
    return;
  }

  segments.push({
    text,
    ...(strong ? { strong } : {}),
    ...(emphasis ? { emphasis } : {}),
    ...(code ? { code } : {}),
  });
}

function appendParsedSummaryInlineSegments(
  segments: SummaryInlineSegment[],
  text: string,
  style: Omit<SummaryInlineSegment, "text">,
) {
  parseSummaryInlineMarkdown(text).forEach((segment) => {
    pushSummaryInlineSegment(segments, segment.text, {
      strong: Boolean(segment.strong) || Boolean(style.strong),
      emphasis: Boolean(segment.emphasis) || Boolean(style.emphasis),
      code: Boolean(segment.code) || Boolean(style.code),
    });
  });
}

function appendDelimitedSummaryInlineSegment(
  segments: SummaryInlineSegment[],
  text: string,
  index: number,
  delimiter: string,
  style: Omit<SummaryInlineSegment, "text">,
  allowOuterWhitespace = true,
) {
  const contentStart = index + delimiter.length;
  const closingIndex = text.indexOf(delimiter, contentStart);

  if (closingIndex === -1) {
    return null;
  }

  const content = text.slice(contentStart, closingIndex);

  if (
    !content.trim() ||
    (!allowOuterWhitespace && (content.startsWith(" ") || content.endsWith(" ")))
  ) {
    return null;
  }

  if (style.code) {
    pushSummaryInlineSegment(segments, content, style);
  } else {
    appendParsedSummaryInlineSegments(segments, content, style);
  }

  return closingIndex + delimiter.length;
}

function findNextSummaryInlineMarker(text: string, fromIndex: number) {
  const markers = ["`", "***", "___", "**", "__", "*"];
  let nextMarkerIndex = text.length;

  markers.forEach((marker) => {
    const markerIndex = text.indexOf(marker, fromIndex);
    if (markerIndex !== -1 && markerIndex < nextMarkerIndex) {
      nextMarkerIndex = markerIndex;
    }
  });

  return nextMarkerIndex;
}

function parseSummaryInlineMarkdown(text: string): SummaryInlineSegment[] {
  const segments: SummaryInlineSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const nextMarkerIndex = findNextSummaryInlineMarker(text, index);

    if (nextMarkerIndex > index) {
      pushSummaryInlineSegment(segments, text.slice(index, nextMarkerIndex));
      index = nextMarkerIndex;
      continue;
    }

    const parsedEnd =
      (text.startsWith("`", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "`",
            { code: true },
          )
        : null) ??
      (text.startsWith("***", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "***",
            { strong: true, emphasis: true },
          )
        : null) ??
      (text.startsWith("___", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "___",
            { strong: true, emphasis: true },
          )
        : null) ??
      (text.startsWith("**", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "**",
            { strong: true },
          )
        : null) ??
      (text.startsWith("__", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "__",
            { strong: true },
          )
        : null) ??
      (text.startsWith("*", index)
        ? appendDelimitedSummaryInlineSegment(
            segments,
            text,
            index,
            "*",
            { emphasis: true },
            false,
          )
        : null);

    if (parsedEnd) {
      index = parsedEnd;
      continue;
    }

    pushSummaryInlineSegment(segments, text[index]);
    index += 1;
  }

  return segments;
}

function stripSummaryInlineMarkdown(text: string) {
  return parseSummaryInlineMarkdown(text)
    .map((segment) => segment.text)
    .join("");
}

function renderSummaryInlineRange(
  segments: SummaryInlineSegment[],
  start: number,
  end: number,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let position = 0;

  segments.forEach((segment, segmentIndex) => {
    const segmentStart = position;
    const segmentEnd = segmentStart + segment.text.length;
    position = segmentEnd;

    if (end <= segmentStart || start >= segmentEnd) {
      return;
    }

    const sliceStart = Math.max(start, segmentStart) - segmentStart;
    const sliceEnd = Math.min(end, segmentEnd) - segmentStart;
    const text = segment.text.slice(sliceStart, sliceEnd);

    if (!text) {
      return;
    }

    const key = `${keyPrefix}-${segmentIndex}-${nodes.length}`;

    if (segment.code) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-app px-1 py-0.5 font-mono text-[0.9em] text-content"
        >
          {text}
        </code>,
      );
      return;
    }

    if (segment.strong && segment.emphasis) {
      nodes.push(
        <strong key={key} className="font-black text-content">
          <em className="italic">{text}</em>
        </strong>,
      );
      return;
    }

    if (segment.strong) {
      nodes.push(
        <strong key={key} className="font-black text-content">
          {text}
        </strong>,
      );
      return;
    }

    if (segment.emphasis) {
      nodes.push(
        <em key={key} className="italic text-content">
          {text}
        </em>,
      );
      return;
    }

    nodes.push(text);
  });

  return nodes;
}

function renderSummaryText(
  paragraph: string,
  paragraphIndex: number,
  keywords: SummaryKeyword[],
  userHighlights: UserSummaryHighlight[],
  userNotes: UserSummaryNote[],
  keywordClass: string,
  userHighlightClass: string,
  activeKeywordId: string | null,
  isEraseModeActive: boolean,
  areKeywordHighlightsMuted: boolean,
  onUserHighlightClick: (highlight: UserSummaryHighlight) => void,
  onNoteBadgeClick: (note: UserSummaryNote) => void,
): ReactNode[] {
  const inlineSegments = parseSummaryInlineMarkdown(paragraph);
  const plainParagraph = inlineSegments.map((segment) => segment.text).join("");
  const keywordRanges = areKeywordHighlightsMuted
    ? []
    : keywords
        .filter((keyword) => keyword.paragraphIndex === paragraphIndex)
        .flatMap((keyword) =>
          findSummaryRanges(plainParagraph, keyword.text, {
            kind: "keyword",
            keyword,
          }),
        );

  const userRanges = userHighlights
    .filter((highlight) => highlight.paragraphIndex === paragraphIndex)
    .flatMap((highlight) =>
      findUserSummaryHighlightRanges(plainParagraph, highlight),
    );

  const noteRanges = userNotes
    .filter((note) => note.paragraphIndex === paragraphIndex)
    .flatMap((note) =>
      findSummaryRanges(plainParagraph, note.text, {
        kind: "note",
        note,
      }),
    );

  const ranges = [...keywordRanges, ...userRanges, ...noteRanges];
  const breakpoints = new Set([0, plainParagraph.length]);

  ranges.forEach((range) => {
    breakpoints.add(range.start);
    breakpoints.add(range.end);
  });

  const renderedSegments: ReactNode[] = [];
  const points = [...breakpoints].sort((a, b) => a - b);

  points.forEach((start, index) => {
    const end = points[index + 1];

    if (end === undefined || start === end) {
      return;
    }

    const renderedText = renderSummaryInlineRange(
      inlineSegments,
      start,
      end,
      `${paragraphIndex}-${start}-${end}`,
    );
    const keywordRange = keywordRanges.find(
      (range) => start >= range.start && end <= range.end,
    );
    const userRange = userRanges.find(
      (range) => start >= range.start && end <= range.end,
    );
    const noteRange = noteRanges.find(
      (range) => start >= range.start && end <= range.end,
    );
    const userHighlight = userRange?.highlight;
    const note = noteRange?.note;
    const isHighlightClickable = Boolean(userHighlight) && isEraseModeActive;
    const isActiveKeyword =
      !userRange &&
      keywordRange?.keyword?.id !== undefined &&
      keywordRange.keyword.id === activeKeywordId;

    if (!keywordRange && !userRange && !note) {
      renderedSegments.push(...renderedText);
      return;
    }

    const segment = (
      <mark
        key={`${paragraphIndex}-${start}-${end}`}
        id={
          keywordRange?.keyword && !userRange && start === keywordRange.start
            ? keywordRange.keyword.id
            : undefined
        }
        role={isHighlightClickable ? "button" : undefined}
        tabIndex={isHighlightClickable ? 0 : undefined}
        title={isHighlightClickable ? "Apasă pentru a șterge highlight-ul" : undefined}
        onClick={
          isHighlightClickable && userHighlight
            ? (event) => {
                event.stopPropagation();
                onUserHighlightClick(userHighlight);
              }
            : undefined
        }
        onKeyDown={
          isHighlightClickable && userHighlight
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onUserHighlightClick(userHighlight);
                }
              }
            : undefined
        }
        className={[
          !userRange && keywordRange ? keywordClass : "",
          userRange ? userHighlightClass : "",
          isHighlightClickable ? "cursor-pointer" : "",
          note ? "underline decoration-dotted decoration-2 underline-offset-4" : "",
          isActiveKeyword
            ? "animate-pulse ring-2 ring-warning ring-offset-2 ring-offset-surface"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          userHighlight ? getSummaryHighlightStyle(userHighlight.color) : undefined
        }
      >
        {renderedText}
      </mark>
    );

    if (note && start === noteRange?.start) {
      renderedSegments.push(
        <button
          key={`${paragraphIndex}-${start}-note-badge`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNoteBadgeClick(note);
          }}
          title="Vezi notița"
          className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-info-border bg-info-soft align-middle text-info transition hover:-translate-y-0.5"
        >
          <Icon className="h-3 w-3">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </Icon>
        </button>,
        segment,
      );
      return;
    }

    renderedSegments.push(segment);
  });

  return renderedSegments;
}

function SummaryHighlightColorPicker({
  value,
  onChange,
  onResetHighlights,
  canResetHighlights,
}: {
  value: SummaryHighlightColorId;
  onChange: (color: SummaryHighlightColorId) => void;
  onResetHighlights: () => void;
  canResetHighlights: boolean;
}) {
  return (
    <div className="mt-3 rounded-xl border border-subtle bg-app p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
        Culoare highlight
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {summaryHighlightColors.map((color) => {
          const isSelected = color.id === value;

          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onChange(color.id)}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold transition hover:-translate-y-0.5 ${
                isSelected ? "ring-2 ring-info/45" : ""
              }`}
              style={{
                backgroundColor: color.bg,
                borderColor: color.border,
                color: color.text,
              }}
              aria-pressed={isSelected}
            >
              <span
                className="h-3 w-3 rounded-full border"
                style={{
                  backgroundColor: color.bg,
                  borderColor: color.text,
                }}
              />
              {color.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onResetHighlights}
        disabled={!canResetHighlights}
        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-soft px-3 text-xs font-bold text-danger transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
      >
        <Icon className="h-3.5 w-3.5">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
        </Icon>
        Resetează highlight
      </button>
    </div>
  );
}

function SummaryToolButton({
  label,
  active,
  disabled = false,
  tooltip,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const isActive = active && !disabled;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isActive}
        title={tooltip}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold transition ${
          disabled
            ? "cursor-not-allowed text-muted/45"
            : isActive
              ? "cursor-pointer bg-action text-on-action"
              : "cursor-pointer text-content hover:bg-surface-hover"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0">{children}</Icon>
        {label}
      </button>
      {tooltip ? (
        <span className="pointer-events-none absolute left-3 top-full z-30 mt-2 w-64 rounded-lg border border-subtle bg-surface px-3 py-2 text-xs font-semibold leading-5 text-content opacity-0 shadow-lg shadow-black/10 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {tooltip}
        </span>
      ) : null}
    </div>
  );
}

function SummaryToolsPanel({
  activeTool,
  pendingHighlightColor,
  hasAiAccess,
  toolHintText,
  canResetHighlights,
  onToggleTool,
  onResetTool,
  onApplyCurrentHighlight,
  onHighlightColorChange,
  onResetHighlights,
}: {
  activeTool: SummaryToolMode | null;
  pendingHighlightColor: SummaryHighlightColorId;
  hasAiAccess: boolean;
  toolHintText: string | null;
  canResetHighlights: boolean;
  onToggleTool: (tool: SummaryToolMode) => void;
  onResetTool: () => void;
  onApplyCurrentHighlight: () => void;
  onHighlightColorChange: (color: SummaryHighlightColorId) => void;
  onResetHighlights: () => void;
}) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        Instrumente
      </p>

      <div className="mt-3 divide-y divide-subtle border-y border-subtle py-1">
        <SummaryToolButton
          label="Evidențiază"
          active={activeTool === "highlight"}
          onClick={() => onToggleTool("highlight")}
        >
          <path d="m9 11-6 6v3h9l3-3" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z" />
        </SummaryToolButton>
        {activeTool === "highlight" ? (
          <div className="py-3">
            <SummaryHighlightColorPicker
              value={pendingHighlightColor}
              onChange={onHighlightColorChange}
              onResetHighlights={onResetHighlights}
              canResetHighlights={canResetHighlights}
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onApplyCurrentHighlight}
              className="mt-3 flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-hover"
            >
              Aplică
            </button>
          </div>
        ) : null}

        <SummaryToolButton
          label="Șterge"
          active={activeTool === "erase"}
          onClick={() => onToggleTool("erase")}
        >
          <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
          <path d="M22 21H7" />
          <path d="m5 11 9 9" />
        </SummaryToolButton>

        <SummaryToolButton
          label="AI"
          active={activeTool === "ai"}
          disabled={!hasAiAccess}
          tooltip={!hasAiAccess ? AI_ACCESS_UNAVAILABLE_MESSAGE : undefined}
          onClick={() => onToggleTool("ai")}
        >
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </SummaryToolButton>

        <SummaryToolButton
          label="Notiță"
          active={activeTool === "note"}
          onClick={() => onToggleTool("note")}
        >
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </SummaryToolButton>

        <button
          type="button"
          onClick={onResetTool}
          disabled={!activeTool}
          className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold transition ${
            activeTool
              ? "cursor-pointer text-danger hover:bg-danger-soft"
              : "cursor-not-allowed text-muted/45"
          }`}
        >
          <Icon className="h-4 w-4 shrink-0">
            <path d="M18 6 6 18M6 6l12 12" />
          </Icon>
          Șterge instrument
        </button>
      </div>

      {toolHintText ? (
        <p className="mt-4 border-t border-subtle pt-3 text-xs leading-5 text-muted">
          {toolHintText}
        </p>
      ) : null}
    </>
  );
}

function SummaryPanel({
  project,
  hasAiAccess,
  onUsageRefresh,
  onHighlightCreate,
  onHighlightColorChange,
  onHighlightRemove,
  onHighlightsReset,
  onNoteCreate,
  onNoteUpdate,
  onNoteRemove,
}: {
  project: StudyProject;
  hasAiAccess: boolean;
  onUsageRefresh: () => Promise<void>;
  onHighlightCreate: (
    projectId: string,
    highlight: {
      paragraphIndex: number;
      text: string;
      color: ApiSummaryHighlightColor;
      startOffset?: number | null;
      endOffset?: number | null;
    },
  ) => Promise<void>;
  onHighlightColorChange: (
    projectId: string,
    highlightId: string,
    color: ApiSummaryHighlightColor,
  ) => Promise<void>;
  onHighlightRemove: (projectId: string, highlightId: string) => Promise<void>;
  onHighlightsReset: (projectId: string) => Promise<void>;
  onNoteCreate: (
    projectId: string,
    note: { paragraphIndex: number; text: string; note: string },
  ) => Promise<void>;
  onNoteUpdate: (
    projectId: string,
    noteId: string,
    note: string,
  ) => Promise<void>;
  onNoteRemove: (projectId: string, noteId: string) => Promise<void>;
}) {
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const keywordFocusTimer = useRef<number | null>(null);
  const aiRequestIdRef = useRef(0);
  const selectionChangeTimer = useRef<number | null>(null);
  const selectionReadFrame = useRef<number | null>(null);
  const readCurrentSelectionRef = useRef<() => void>(() => {});
  const [activeTool, setActiveTool] = useState<SummaryToolMode | null>(null);
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false);
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null);
  const [aiDialog, setAiDialog] = useState<SummaryAiDialog | null>(null);
  const [pendingAiSelection, setPendingAiSelection] =
    useState<PendingSummarySelection | null>(null);
  const [pendingAiQuestion, setPendingAiQuestion] = useState("");
  const [pendingHighlightSelection, setPendingHighlightSelection] =
    useState<PendingSummarySelection | null>(null);
  const [pendingHighlightColor, setPendingHighlightColor] =
    useState<SummaryHighlightColorId>(defaultSummaryHighlightColor);
  const [notePanel, setNotePanel] = useState<SummaryNotePanelState | null>(
    null,
  );
  const [isResetHighlightsDialogOpen, setIsResetHighlightsDialogOpen] =
    useState(false);
  const [isResettingHighlights, setIsResettingHighlights] = useState(false);
  const userHighlights = project.summaryHighlights;
  const userNotes = project.summaryNotes;
  const summaryContent = project.summary?.content ?? "";
  const displayParagraphs = useMemo<SummaryDisplayBlock[]>(() => {
    if (!summaryContent) {
      return [];
    }

    const paragraphs = splitSummaryParagraphs(summaryContent);
    return paragraphs.length
      ? paragraphs
      : [{ kind: "paragraph", text: normalizeSummarySelection(summaryContent) }];
  }, [summaryContent]);
  const displayKeywords = useMemo(() => {
    if (!project.keywords.length) {
      return [];
    }

    return buildProjectSummaryKeywords(project.keywords, displayParagraphs);
  }, [displayParagraphs, project.keywords]);
  const summaryRenderGroups = useMemo<SummaryRenderGroup[]>(() => {
    const groups: SummaryRenderGroup[] = [];

    displayParagraphs.forEach((block, paragraphIndex) => {
      if (block.kind === "list-item") {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup?.kind === "list") {
          lastGroup.items.push({ paragraphIndex, text: block.text });
          return;
        }
        groups.push({
          kind: "list",
          items: [{ paragraphIndex, text: block.text }],
        });
        return;
      }

      if (block.kind === "heading") {
        groups.push({
          kind: "heading",
          paragraphIndex,
          level: block.level,
          text: block.text,
        });
        return;
      }

      groups.push({ kind: "paragraph", paragraphIndex, text: block.text });
    });

    return groups;
  }, [displayParagraphs]);
  useEffect(() => {
    function focusReviewParagraph() {
      const match = window.location.hash.match(/^#summary-paragraph-(\d+)$/);
      if (!match) return;
      const paragraph = summaryRef.current?.querySelector<HTMLElement>(
        `[data-summary-paragraph="${Number(match[1])}"]`,
      );
      paragraph?.scrollIntoView({ block: "center", behavior: "instant" });
      paragraph?.focus({ preventScroll: true });
    }
    const frame = window.requestAnimationFrame(focusReviewParagraph);
    window.addEventListener("hashchange", focusReviewParagraph);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", focusReviewParagraph);
    };
  }, [displayParagraphs]);

  const keywordHighlightClass =
    "scroll-mt-28 rounded-md border border-warning-border bg-warning-soft px-1.5 py-0.5 font-semibold text-warning";
  const userHighlightClass =
    "box-decoration-clone rounded-md border px-1.5 py-0.5 font-semibold [&_code]:bg-current/10 [&_code]:text-inherit [&_em]:text-inherit [&_strong]:text-inherit";

  async function handleApplyHighlight(selection: PendingSummarySelection) {
    const existingHighlight = userHighlights.find((highlight) => {
      if (highlight.paragraphIndex !== selection.paragraphIndex) {
        return false;
      }

      if (selection.startOffset !== null && selection.endOffset !== null) {
        return (
          highlight.startOffset === selection.startOffset &&
          highlight.endOffset === selection.endOffset
        );
      }

      return highlight.startOffset === null && highlight.text === selection.text;
    });

    try {
      if (existingHighlight) {
        await onHighlightColorChange(
          project.id,
          existingHighlight.id,
          pendingHighlightColor,
        );
      } else {
        await onHighlightCreate(project.id, {
          paragraphIndex: selection.paragraphIndex,
          text: selection.text,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          color: pendingHighlightColor,
        });
      }
      setPendingHighlightSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch {
      // Selection stays available so the user can try highlighting again.
    }
  }

  async function handleAskAi(
    selection: PendingSummarySelection,
    studentQuestion: string,
  ) {
    if (!hasAiAccess) {
      return;
    }

    const cleanQuestion = studentQuestion.trim();
    setPendingAiSelection(null);
    setPendingAiQuestion("");
    aiRequestIdRef.current += 1;
    const requestId = aiRequestIdRef.current;

    setAiDialog({
      ...selection,
      question: cleanQuestion || null,
      status: "loading",
    });
    window.getSelection()?.removeAllRanges();

    try {
      const response = await explainStudyProjectSummarySelection({
        projectId: project.id,
        paragraphIndex: selection.paragraphIndex,
        selectedText: selection.text,
        studentQuestion: cleanQuestion || null,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
      });

      if (requestId !== aiRequestIdRef.current) {
        return;
      }

      void onUsageRefresh();
      setAiDialog({
        ...selection,
        question: cleanQuestion || null,
        status: "done",
        response,
      });
    } catch (error) {
      if (requestId !== aiRequestIdRef.current) {
        return;
      }
      setAiDialog({
        ...selection,
        question: cleanQuestion || null,
        status: "done",
        response: {
          title: "Explicația nu este disponibilă momentan",
          answer:
            error instanceof Error
              ? error.message
              : "Nu am putut genera explicația. Încearcă din nou peste câteva momente.",
          bullets: [
            "Verifică dacă ai selectat un fragment clar din rezumat.",
            "Poți continua studiul și poți reveni la explicație mai târziu.",
          ],
        },
      });
    }
  }

  function getCurrentSummarySelectionPayload() {
    const root = summaryRef.current;
    const selection = window.getSelection();

    if (!root || !selection || selection.isCollapsed || !selection.rangeCount) {
      return null;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    if (
      !anchorNode ||
      !focusNode ||
      !root.contains(anchorNode) ||
      !root.contains(focusNode)
    ) {
      return null;
    }

    const anchorParagraphIndex = getSummaryParagraphIndex(anchorNode);
    const focusParagraphIndex = getSummaryParagraphIndex(focusNode);
    const anchorParagraph = getSummaryParagraphElement(anchorNode);
    const focusParagraph = getSummaryParagraphElement(focusNode);

    if (
      anchorParagraphIndex === null ||
      focusParagraphIndex === null ||
      anchorParagraphIndex !== focusParagraphIndex ||
      !anchorParagraph ||
      anchorParagraph !== focusParagraph
    ) {
      return null;
    }

    const selectedRange = selection.getRangeAt(0);
    const selectedText = normalizeSummarySelection(selectedRange.toString());

    if (selectedText.length < 3) {
      return null;
    }
    const offsets = getSummarySelectionOffsets(selectedRange, anchorParagraph);
    const paragraphText = anchorParagraph.textContent ?? "";
    const hasMatchingOffsets = offsets
      ? normalizeSummarySelection(
          paragraphText.slice(offsets.startOffset, offsets.endOffset),
        ) === selectedText
      : false;
    return {
      text: selectedText,
      paragraphIndex: anchorParagraphIndex,
      startOffset: offsets && hasMatchingOffsets ? offsets.startOffset : null,
      endOffset: offsets && hasMatchingOffsets ? offsets.endOffset : null,
    };
  }

  function readCurrentSelection() {
    if (!activeTool || activeTool === "erase") {
      return;
    }

    const selectionPayload = getCurrentSummarySelectionPayload();

    if (!selectionPayload) {
      setPendingHighlightSelection(null);
      return;
    }

    if (activeTool === "highlight") {
      setPendingAiSelection(null);
      setNotePanel(null);
      setPendingHighlightSelection(selectionPayload);
      return;
    }

    if (activeTool === "note") {
      setPendingAiSelection(null);
      setPendingHighlightSelection(null);
      setNotePanel({ mode: "create", selection: selectionPayload, draft: "" });
      return;
    }

    if (activeTool === "ai") {
      if (!hasAiAccess) {
        return;
      }

      const isSameAiSelection =
        pendingAiSelection?.paragraphIndex === selectionPayload.paragraphIndex &&
        pendingAiSelection.text === selectionPayload.text &&
        pendingAiSelection.startOffset === selectionPayload.startOffset &&
        pendingAiSelection.endOffset === selectionPayload.endOffset;
      if (!isSameAiSelection) {
        setPendingAiQuestion("");
      }
      setNotePanel(null);
      setPendingHighlightSelection(null);
      setPendingAiSelection(selectionPayload);
      return;
    }
  }

  function scheduleCurrentSelectionRead() {
    if (selectionReadFrame.current !== null) {
      window.cancelAnimationFrame(selectionReadFrame.current);
    }

    selectionReadFrame.current = window.requestAnimationFrame(() => {
      readCurrentSelectionRef.current();
      selectionReadFrame.current = null;
    });
  }

  function handleApplyCurrentHighlight() {
    const selectionPayload =
      pendingHighlightSelection ?? getCurrentSummarySelectionPayload();

    if (!selectionPayload) {
      return;
    }

    void handleApplyHighlight(selectionPayload);
  }

  useEffect(() => {
    return () => {
      if (keywordFocusTimer.current) {
        window.clearTimeout(keywordFocusTimer.current);
      }
      if (selectionChangeTimer.current) {
        window.clearTimeout(selectionChangeTimer.current);
      }
      if (selectionReadFrame.current !== null) {
        window.cancelAnimationFrame(selectionReadFrame.current);
      }
    };
  }, []);

  useEffect(() => {
    function scheduleSelectionCheck() {
      if (selectionChangeTimer.current) {
        window.clearTimeout(selectionChangeTimer.current);
      }
      selectionChangeTimer.current = window.setTimeout(() => {
        if (selectionReadFrame.current !== null) {
          window.cancelAnimationFrame(selectionReadFrame.current);
        }
        selectionReadFrame.current = window.requestAnimationFrame(() => {
          readCurrentSelectionRef.current();
          selectionReadFrame.current = null;
        });
        selectionChangeTimer.current = null;
      }, 220);
    }

    function handleTouchStart() {
      // The user is actively touching (initial press or handle-drag
      // adjustment) — cancel any pending check so nothing fires mid-gesture.
      if (selectionChangeTimer.current) {
        window.clearTimeout(selectionChangeTimer.current);
        selectionChangeTimer.current = null;
      }
    }

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchend", scheduleSelectionCheck, {
      passive: true,
    });
    document.addEventListener("touchcancel", scheduleSelectionCheck, {
      passive: true,
    });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", scheduleSelectionCheck);
      document.removeEventListener("touchcancel", scheduleSelectionCheck);
    };
  }, []);

  useEffect(() => {
    readCurrentSelectionRef.current = readCurrentSelection;
  });

  if (!project.summary?.content) {
    return (
      <article className="rounded-xl border border-subtle bg-surface p-6 text-center sm:p-8">
        <p className="mx-auto inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
          Rezumat
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl font-serif text-3xl font-semibold leading-tight">
          Rezumatul nu este generat încă.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted">
          Reviss generează automat rezumatul după încărcarea materialelor.
          Dacă generarea a eșuat, reîncearcă din pagina proiectului.
        </p>
      </article>
    );
  }

  async function handleRemoveHighlight(highlightId: string) {
    try {
      await onHighlightRemove(project.id, highlightId);
    } catch {
      // If deletion failed, the highlight remains in project.summaryHighlights.
    }
  }

  function handleRequestResetHighlights() {
    if (!userHighlights.length) {
      return;
    }
    setIsResetHighlightsDialogOpen(true);
  }

  function handleCancelResetHighlights() {
    setIsResetHighlightsDialogOpen(false);
  }

  async function handleConfirmResetHighlights() {
    setIsResettingHighlights(true);
    try {
      await onHighlightsReset(project.id);
      setIsResetHighlightsDialogOpen(false);
    } catch {
      // Keep the dialog open so the user can retry the reset.
    } finally {
      setIsResettingHighlights(false);
    }
  }

  function handleCloseAiDialog() {
    aiRequestIdRef.current += 1;
    setAiDialog(null);
  }

  function handleConfirmAiSelection() {
    if (!pendingAiSelection) {
      return;
    }

    void handleAskAi(pendingAiSelection, pendingAiQuestion);
  }

  function handleCancelAiSelection() {
    setPendingAiSelection(null);
    setPendingAiQuestion("");
    window.getSelection()?.removeAllRanges();
  }

  function handleKeywordClick(keywordId: string) {
    if (keywordFocusTimer.current) {
      window.clearTimeout(keywordFocusTimer.current);
    }

    setActiveKeywordId(keywordId);
    const keyword = displayKeywords.find((item) => item.id === keywordId);
    if (keyword) {
      summaryRef.current?.querySelector<HTMLElement>(
        `[data-summary-paragraph="${keyword.paragraphIndex}"]`,
      )?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    keywordFocusTimer.current = window.setTimeout(() => {
      setActiveKeywordId((currentKeywordId) =>
        currentKeywordId === keywordId ? null : currentKeywordId,
      );
      keywordFocusTimer.current = null;
    }, 1800);
  }

  function handleHighlightSpanClick(highlight: UserSummaryHighlight) {
    if (activeTool !== "erase") {
      return;
    }
    handleRemoveHighlight(highlight.id);
  }

  function handleToggleTool(tool: SummaryToolMode) {
    if (tool === "ai" && !hasAiAccess) {
      return;
    }

    setActiveTool((current) => (current === tool ? null : tool));
    setNotePanel(null);
    setPendingAiSelection(null);
    setPendingAiQuestion("");
    setPendingHighlightSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleResetTool() {
    setActiveTool(null);
    setNotePanel(null);
    setPendingAiSelection(null);
    setPendingAiQuestion("");
    setPendingHighlightSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function handleOpenNoteViewer(note: UserSummaryNote) {
    setNotePanel({ mode: "view", note, draft: note.note });
  }

  async function handleSaveNote() {
    if (!notePanel || !notePanel.draft.trim()) {
      return;
    }

    try {
      if (notePanel.mode === "create") {
        await onNoteCreate(project.id, {
          paragraphIndex: notePanel.selection.paragraphIndex,
          text: notePanel.selection.text,
          note: notePanel.draft.trim(),
        });
      } else {
        await onNoteUpdate(
          project.id,
          notePanel.note.id,
          notePanel.draft.trim(),
        );
      }
    } catch {
      return;
    }

    setNotePanel(null);
    window.getSelection()?.removeAllRanges();
  }

  async function handleDeleteNote() {
    if (!notePanel || notePanel.mode !== "view") {
      return;
    }

    try {
      await onNoteRemove(project.id, notePanel.note.id);
    } catch {
      return;
    }

    setNotePanel(null);
  }

  function handleCloseNotePanel() {
    setNotePanel(null);
    window.getSelection()?.removeAllRanges();
  }

  const toolCursorClass =
    activeTool === "highlight"
      ? "cursor-crosshair"
      : activeTool === "erase"
        ? "cursor-pointer"
        : activeTool === "ai"
          ? "cursor-help"
          : activeTool === "note"
            ? "cursor-text"
            : "";

  const toolHintText =
    activeTool === "highlight"
      ? "Selectează un fragment, apoi apasă Aplică pe selecție."
      : activeTool === "erase"
        ? "Apasă pe un text evidențiat ca să-l ștergi."
        : activeTool === "ai"
          ? "Selectează un fragment, apoi confirmă cu Întreabă."
      : activeTool === "note"
        ? "Selectează un fragment ca să adaugi o notiță."
        : null;
  const activeToolLabel =
    activeTool === "highlight"
      ? "Evidențiere"
      : activeTool === "erase"
        ? "Ștergere"
        : activeTool === "ai"
          ? "AI"
          : activeTool === "note"
            ? "Notiță"
            : null;

  return (
    <article className="rounded-xl border border-subtle bg-surface p-5 sm:p-7 lg:p-8">
      <button
        type="button"
        onClick={() => setIsToolsDialogOpen((current) => !current)}
        onMouseDown={(event) => event.preventDefault()}
        className="fixed bottom-5 right-5 z-40 inline-flex cursor-pointer items-center gap-2 rounded-md border border-subtle bg-action px-4 py-3 text-sm font-bold text-on-action shadow-xl shadow-black/15 transition hover:bg-action-hover xl:hidden"
        aria-expanded={isToolsDialogOpen}
      >
        <Icon className="h-4 w-4">
          <path d="M12 3v18M3 12h18" />
          <path d="M18 6 6 18" />
        </Icon>
        Instrumente
        {activeToolLabel ? (
          <span className="rounded-md bg-on-action/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
            {activeToolLabel}
          </span>
        ) : null}
      </button>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="max-w-none">
          {pendingAiSelection ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleConfirmAiSelection();
              }}
              className="sticky top-16 z-20 mt-4 w-full max-w-md rounded-xl border border-info-border bg-info-soft p-4 text-info theme-shadow-card"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.16em]">
                Text selectat pentru AI
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6">
                “{pendingAiSelection.text}”
              </p>
              <label
                htmlFor="summary-ai-question"
                className="mt-4 block text-[11px] font-black uppercase tracking-[0.16em]"
              >
                Întrebarea ta
              </label>
              <textarea
                id="summary-ai-question"
                value={pendingAiQuestion}
                onChange={(event) => setPendingAiQuestion(event.target.value)}
                placeholder="Ex: explică pe scurt pentru examen sau compară cu teoria lui Kant."
                rows={3}
                maxLength={1000}
                className="mt-2 w-full resize-none rounded-md border border-info-border bg-surface px-3 py-2 text-sm leading-6 text-content outline-none transition placeholder:text-muted focus:border-info focus:ring-2 focus:ring-info/15"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-info/70">
                <span>Opțional</span>
                <span>{pendingAiQuestion.length}/1000</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:bg-action-hover"
                >
                  Întreabă
                </button>
                <button
                  type="button"
                  onClick={handleCancelAiSelection}
                  className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-info-border bg-surface px-5 text-sm font-bold text-content transition hover:bg-surface-hover"
                >
                  Anulează
                </button>
              </div>
            </form>
          ) : null}

          {notePanel ? (
            <div className="sticky top-16 z-20 mt-4 w-full max-w-sm rounded-xl border border-warning-border bg-warning-soft p-3 text-warning theme-shadow-card">
              <div className="flex items-center justify-end gap-0.5">
                {notePanel.mode === "view" ? (
                  <button
                    type="button"
                    onClick={handleDeleteNote}
                    aria-label="Șterge notița"
                    title="Șterge notița"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-warning transition hover:bg-warning-border/25 hover:text-content"
                  >
                    <Icon className="h-4 w-4">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </Icon>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleCloseNotePanel}
                  aria-label="Închide"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-warning transition hover:bg-warning-border/25 hover:text-content"
                >
                  <Icon className="h-4 w-4">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </Icon>
                </button>
              </div>

              <textarea
                value={notePanel.draft}
                onChange={(event) =>
                  setNotePanel((current) =>
                    current
                      ? { ...current, draft: event.target.value }
                      : current,
                  )
                }
                placeholder="Scrie o notiță aici..."
                rows={5}
                autoFocus
                className="w-full resize-none bg-transparent p-1 text-sm leading-6 text-content outline-none placeholder:text-muted"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!notePanel.draft.trim()}
                  aria-label="Salvează"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-warning transition hover:bg-warning-border/25 hover:text-content disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Icon className="h-4 w-4">
                    <path d="M20 6 9 17l-5-5" />
                  </Icon>
                </button>
              </div>
            </div>
          ) : null}

          <div
            ref={summaryRef}
            onKeyUp={scheduleCurrentSelectionRead}
            onMouseUp={scheduleCurrentSelectionRead}
            className={`mt-6 space-y-5 border-b border-subtle pb-7 text-sm leading-7 text-content/85 sm:text-base sm:leading-8 ${toolCursorClass}`}
          >
            {summaryRenderGroups.map((group) => {
              if (group.kind === "heading") {
                const HeadingTag: "h3" | "h4" = group.level <= 3 ? "h3" : "h4";
                return (
                  <HeadingTag
                    key={`heading-${group.paragraphIndex}`}
                    id={`summary-paragraph-${group.paragraphIndex}`}
                    tabIndex={-1}
                    data-summary-paragraph={group.paragraphIndex}
                    className="select-text font-serif text-xl font-semibold leading-snug text-content sm:text-2xl"
                  >
                    {renderSummaryText(
                      group.text,
                      group.paragraphIndex,
                      displayKeywords,
                      userHighlights,
                      userNotes,
                      keywordHighlightClass,
                      userHighlightClass,
                      activeKeywordId,
                      activeTool === "erase",
                      activeTool === "highlight",
                      handleHighlightSpanClick,
                      handleOpenNoteViewer,
                    )}
                  </HeadingTag>
                );
              }

              if (group.kind === "list") {
                return (
                  <ul
                    key={`list-${group.items[0].paragraphIndex}`}
                    className="list-disc space-y-2 pl-5 marker:text-muted"
                  >
                    {group.items.map((item) => (
                      <li
                        key={item.paragraphIndex}
                        id={`summary-paragraph-${item.paragraphIndex}`}
                        tabIndex={-1}
                        data-summary-paragraph={item.paragraphIndex}
                        className="scroll-mt-28 rounded-md select-text pl-1 target:bg-warning-soft target:ring-2 target:ring-warning-border"
                      >
                        {renderSummaryText(
                          item.text,
                          item.paragraphIndex,
                          displayKeywords,
                          userHighlights,
                          userNotes,
                          keywordHighlightClass,
                          userHighlightClass,
                          activeKeywordId,
                          activeTool === "erase",
                          activeTool === "highlight",
                          handleHighlightSpanClick,
                          handleOpenNoteViewer,
                        )}
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p
                  key={`paragraph-${group.paragraphIndex}`}
                  id={`summary-paragraph-${group.paragraphIndex}`}
                  tabIndex={-1}
                  data-summary-paragraph={group.paragraphIndex}
                  className="scroll-mt-28 rounded-md select-text target:bg-warning-soft target:ring-2 target:ring-warning-border"
                >
                  {renderSummaryText(
                    group.text,
                    group.paragraphIndex,
                    displayKeywords,
                    userHighlights,
                    userNotes,
                    keywordHighlightClass,
                    userHighlightClass,
                    activeKeywordId,
                    activeTool === "erase",
                    activeTool === "highlight",
                    handleHighlightSpanClick,
                    handleOpenNoteViewer,
                  )}
                </p>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
              Cuvinte cheie din rezumat
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {displayKeywords.map((keyword) => (
                <a
                  key={keyword.id}
                  href={`#${keyword.id}`}
                  onClick={() => handleKeywordClick(keyword.id)}
                  className="rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-content transition hover:-translate-y-0.5 hover:bg-surface-hover"
                >
                  {keyword.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <aside className="hidden h-fit border-l border-subtle pl-6 xl:sticky xl:top-20 xl:block">
          <SummaryToolsPanel
            activeTool={activeTool}
            pendingHighlightColor={pendingHighlightColor}
            hasAiAccess={hasAiAccess}
            toolHintText={toolHintText}
            canResetHighlights={userHighlights.length > 0}
            onToggleTool={handleToggleTool}
            onResetTool={handleResetTool}
            onApplyCurrentHighlight={handleApplyCurrentHighlight}
            onHighlightColorChange={setPendingHighlightColor}
            onResetHighlights={handleRequestResetHighlights}
          />
        </aside>
      </div>

      {isToolsDialogOpen ? (
        <div
          className="fixed bottom-[5.75rem] right-5 z-[70] w-[calc(100vw-2.5rem)] max-w-md xl:hidden"
          role="dialog"
          aria-labelledby="summary-tools-title"
        >
          <div className="relative rounded-xl border border-subtle bg-surface shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between gap-4 border-b border-subtle px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">
                  Instrumente
                </p>
                <h3
                  id="summary-tools-title"
                  className="mt-1 font-serif text-2xl font-semibold leading-tight text-content"
                >
                  Alege modul de lucru.
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsToolsDialogOpen(false)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-subtle text-content transition hover:bg-surface-hover"
                aria-label="Închide instrumentele"
              >
                <Icon className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </Icon>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <SummaryToolsPanel
                activeTool={activeTool}
                pendingHighlightColor={pendingHighlightColor}
                hasAiAccess={hasAiAccess}
                toolHintText={toolHintText}
                canResetHighlights={userHighlights.length > 0}
                onToggleTool={handleToggleTool}
                onResetTool={handleResetTool}
                onApplyCurrentHighlight={handleApplyCurrentHighlight}
                onHighlightColorChange={setPendingHighlightColor}
                onResetHighlights={handleRequestResetHighlights}
              />
            </div>

            <div className="border-t border-subtle bg-app/60 px-5 py-4">
              <button
                type="button"
                onClick={() => setIsToolsDialogOpen(false)}
                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:bg-action-hover"
              >
                Închide
              </button>
            </div>

            <span
              aria-hidden="true"
              className="absolute -bottom-2 right-10 h-4 w-4 rotate-45 border-b border-r border-subtle bg-app/60"
            />
          </div>
        </div>
      ) : null}

      {aiDialog ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-ai-title"
        >
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-subtle bg-surface theme-shadow-card">
            <div className="shrink-0 flex items-start justify-between gap-4 border-b border-subtle bg-surface p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">
                  Reviss AI
                </p>
                <h3
                  id="summary-ai-title"
                  className="mt-2 font-serif text-2xl font-semibold leading-tight text-content"
                >
                  {aiDialog.status === "loading"
                    ? "Generez explicația"
                    : aiDialog.response?.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAiDialog}
                className="rounded-md border border-subtle px-4 py-2 text-xs font-bold text-content transition hover:bg-surface-hover"
              >
                Închide
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <div className="space-y-5">
              <div className="rounded-xl border border-info-border bg-info-soft p-4 text-info">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                  Ai întrebat despre
                </p>
                <p className="mt-2 text-sm leading-6">“{aiDialog.text}”</p>
                {aiDialog.question ? (
                  <div className="mt-3 border-t border-info-border/60 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
                      Întrebarea ta
                    </p>
                    <p className="mt-1 text-sm leading-6">{aiDialog.question}</p>
                  </div>
                ) : null}
              </div>

              {aiDialog.status === "loading" ? (
                <div className="grid min-h-64 place-items-center rounded-xl border border-subtle bg-app p-6 text-center">
                  <div>
                    <div className="mx-auto h-14 w-14 animate-spin rounded-full border-2 border-info-border border-t-info" />
                    <p className="mt-5 font-serif text-2xl font-semibold text-content">
                      Analizez fragmentul...
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                      Caut legătura cu rezumatul, extrag ideea utilă pentru examen
                      și o formulez pe scurt.
                    </p>
                    <div className="mx-auto mt-6 max-w-sm space-y-2">
                      <div className="h-3 animate-pulse rounded-full bg-info-soft" />
                      <div className="h-3 w-4/5 animate-pulse rounded-full bg-info-soft" />
                      <div className="h-3 w-2/3 animate-pulse rounded-full bg-info-soft" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="text-base leading-8 text-content/85">
                    {aiDialog.response?.answer}
                  </p>
                  <div className="border-t border-subtle pt-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                      Cum să reții
                    </p>
                    <div className="mt-2 divide-y divide-subtle">
                      {aiDialog.response?.bullets.map((bullet) => (
                        <div
                          key={bullet}
                          className="flex gap-3 py-3 text-sm leading-6 text-content/80"
                        >
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-info" />
                          <p>{bullet}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isResetHighlightsDialogOpen ? (
        <SummaryResetHighlightsModal
          isResetting={isResettingHighlights}
          onCancel={handleCancelResetHighlights}
          onConfirm={() => void handleConfirmResetHighlights()}
        />
      ) : null}
    </article>
  );
}

function SummaryResetHighlightsModal({
  isResetting,
  onCancel,
  onConfirm,
}: {
  isResetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-content/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-highlights-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-subtle bg-surface shadow-2xl shadow-black/20">
        <div className="border-b border-subtle px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-danger-border bg-danger-soft text-danger">
              <Icon className="h-5 w-5">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
              </Icon>
            </span>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-danger">
              Resetare highlight-uri
            </p>
          </div>

          <h2
            id="reset-highlights-title"
            className="mt-4 font-serif text-2xl font-semibold leading-tight text-content"
          >
            Sigur vrei să resetezi toate evidențierile din rezumat?
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Toate highlight-urile aplicate în acest rezumat vor fi șterse
            definitiv. Notițele nu sunt afectate.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-subtle bg-app/50 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isResetting}
            className="rounded-md border border-subtle bg-surface px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
          >
            Renunță
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isResetting}
            className="rounded-md bg-danger px-5 py-3 text-sm font-bold text-app transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {isResetting ? "Se resetează..." : "Resetează highlight-urile"}
          </button>
        </div>
      </div>
    </div>
  );
}

type FlashcardStudyCard = {
  id: FlashcardDeckId;
  badge: string;
  title: string;
  description: string;
  duration: string;
  metric: string;
};

type FlashcardDeckId = "initial" | "quiz" | "manual";

type AccountFlashcard = StudyFlashcardCard;

type AccountFlashcardDeck = {
  eyebrow: string;
  title: string;
  description: string;
  cards: AccountFlashcard[];
};

type FlashcardShuffleMixGhost = {
  card: AccountFlashcard;
  startDistance: number;
  endDistance: number;
  variant: number;
};

type FlashcardShuffleState =
  | {
      id: number;
      mode: "move";
      card: AccountFlashcard;
      direction: 1 | -1;
      durationMs: number;
    }
  | {
      id: number;
      mode: "mix";
      ghosts: FlashcardShuffleMixGhost[];
      durationMs: number;
    };

type FlashcardTextSide = "question" | "answer";

type PendingFlashcardSelection = {
  flashcardId: string;
  text: string;
  side: FlashcardTextSide;
  topic: string;
};

type FlashcardAiDialog = {
  text: string;
  side: FlashcardTextSide;
  topic: string;
  question: string | null;
  status: "loading" | "done";
  response?: LearningAiResponse;
};

const accountFlashcardLayouts = [
  {
    x: "var(--flashcard-x-0, 0px)",
    y: "var(--flashcard-y-0, 8px)",
    rotate: -1.5,
  },
  {
    x: "var(--flashcard-x-1, 48px)",
    y: "var(--flashcard-y-1, 36px)",
    rotate: 5.5,
  },
  {
    x: "var(--flashcard-x-2, -38px)",
    y: "var(--flashcard-y-2, 58px)",
    rotate: -6.5,
  },
  {
    x: "var(--flashcard-x-3, 30px)",
    y: "var(--flashcard-y-3, 84px)",
    rotate: 3.5,
  },
];

function buildProjectFlashcardDecks(
  project: StudyProject,
): Record<FlashcardDeckId, AccountFlashcardDeck> {
  const generatedFlashcards = getGeneratedFlashcards(project.flashcards);

  const tones: AccountFlashcard["tone"][] = [
    "success",
    "warning",
    "info",
    "danger",
  ];
  const cards = generatedFlashcards.map((card, index) => ({
    id: `initial-${card.id || index}-${index}`,
    flashcardId: card.id,
    topic: card.category || project.subjectName,
    question: card.front,
    answer: card.back,
    tone: tones[index % tones.length],
    review: card.review,
  }));
  const quizMistakeCards = project.quizMistakeFlashcards;
  const manualCards = project.manualFlashcards;

  return {
    initial: {
      eyebrow: "Generate initial",
      title: generatedFlashcards.length
        ? `Flashcard-uri pentru ${project.name}`
        : "Flashcardurile nu sunt generate încă",
      description:
        generatedFlashcards.length
          ? "Pachetul generat automat din materialele încărcate, pregătit pentru recapitulare activă."
          : "Flashcardurile apar aici după ce Reviss termină generarea pachetului de studiu.",
      cards,
    },
    quiz: {
      eyebrow: "Din quiz-urile tale",
      title: quizMistakeCards.length
        ? "Întrebările greșite transformate în flashcarduri"
        : "Aici apar întrebările greșite salvate",
      description:
        quizMistakeCards.length
          ? "Greșelile pe care le-ai salvat din quizuri, cu răspunsul corect."
          : "Fă un quiz. Când greșești, apasă „Salvează ca flashcard\u201d și întrebarea ajunge aici.",
      cards: quizMistakeCards,
    },
    manual: {
      eyebrow: "Create de tine",
      title: manualCards.length
        ? "Flashcardurile tale"
        : "Creează primul flashcard",
      description:
        "Flashcardurile create manual rămân separate de cele generate automat.",
      cards: manualCards,
    },
  };
}

function toAccountFlashcardTransform(
  layout: (typeof accountFlashcardLayouts)[number],
) {
  return `translate3d(${layout.x}, ${layout.y}, 0) rotate(${layout.rotate}deg)`;
}

function getAccountFlashcardLayout(distance: number) {
  return accountFlashcardLayouts[
    Math.min(distance, accountFlashcardLayouts.length - 1)
  ];
}

function shuffleAccountFlashcards(
  cards: AccountFlashcard[],
  activeIndex: number,
) {
  const shuffledCards = [...cards];

  for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledCards[index], shuffledCards[randomIndex]] = [
      shuffledCards[randomIndex],
      shuffledCards[index],
    ];
  }

  if (
    shuffledCards.length > 1 &&
    shuffledCards[0]?.id === cards[activeIndex]?.id
  ) {
    const nextDifferentCardIndex = shuffledCards.findIndex(
      (card) => card.id !== cards[activeIndex]?.id,
    );

    if (nextDifferentCardIndex > 0) {
      [shuffledCards[0], shuffledCards[nextDifferentCardIndex]] = [
        shuffledCards[nextDifferentCardIndex],
        shuffledCards[0],
      ];
    }
  }

  return shuffledCards;
}

function getFlashcardShuffleMixGhosts(
  cards: AccountFlashcard[],
  activeIndex: number,
): FlashcardShuffleMixGhost[] {
  const visibleCount = Math.min(cards.length, accountFlashcardLayouts.length);

  return Array.from({ length: visibleCount }, (_, distance) => ({
    card: cards[(activeIndex + distance) % cards.length],
    startDistance: distance,
    endDistance: (distance * 2 + 1) % visibleCount,
    variant: distance % accountFlashcardLayouts.length,
  }));
}

function getFlashcardTextSide(node: Node | null): FlashcardTextSide | null {
  const element = node instanceof Element ? node : node?.parentElement;
  const textElement = element?.closest<HTMLElement>("[data-flashcard-text]");
  const side = textElement?.dataset.flashcardText;

  if (side === "question" || side === "answer") {
    return side;
  }

  return null;
}

function getFlashcardTextDensity(text: string) {
  const normalizedLength = text.trim().replace(/\s+/g, " ").length;

  if (normalizedLength > 480) return "xxs";
  if (normalizedLength > 320) return "xs";
  if (normalizedLength > 200) return "sm";
  if (normalizedLength > 110) return "md";
  return "lg";
}

function FlashcardTicket({
  card,
  onOpenDeck,
}: {
  card: FlashcardStudyCard;
  onOpenDeck: (deckId: FlashcardDeckId) => void;
}) {
  return (
    <article className="theme-shadow-card flex min-h-[15rem] flex-col rounded-xl border border-subtle bg-surface p-6 transition hover:-translate-y-0.5 hover:border-content/25">
      <div>
        <span className="inline-flex rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-success">
          {card.badge}
        </span>
        <h2 className="mt-4 font-serif text-2xl font-semibold leading-tight text-content">
          {card.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {card.description}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-4 border-t border-subtle pt-5">
        <span className="text-xs text-muted">
          durată est.
          <b className="block font-serif text-2xl font-semibold leading-none text-content">
            {card.duration}
          </b>
          <span className="mt-1 block">{card.metric}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenDeck(card.id)}
          className="inline-flex shrink-0 items-center gap-2 rounded-md bg-action px-4 py-2.5 text-sm font-bold text-on-action transition hover:bg-action-hover"
        >
          Continuă
          <Icon>
            <path d="M5 12h14M13 5l7 7-7 7" />
          </Icon>
        </button>
      </div>
    </article>
  );
}

function AccountFlashcardFaceContent({
  card,
  side,
  onFlip,
  onToggleReview,
}: {
  card: AccountFlashcard;
  side: "question" | "answer";
  onFlip?: () => void;
  onToggleReview?: () => void;
}) {
  const textAreaRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLHeadingElement | null>(null);
  const [fitFontSize, setFitFontSize] = useState<number | null>(null);
  const isAnswer = side === "answer";
  const text = isAnswer ? card.answer : card.question;
  const image = isAnswer ? undefined : card.questionImage;
  const textDensity = getFlashcardTextDensity(text);
  const flipLabel = isAnswer ? "Vezi întrebarea" : "Vezi răspunsul";
  const hasReviewToggle = Boolean(onToggleReview);

  useLayoutEffect(() => {
    const textArea = textAreaRef.current;
    const textElement = textRef.current;
    if (!text || !textArea || !textElement) {
      setFitFontSize(null);
      return;
    }

    let animationFrame = 0;

    function fitTextToCard() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const currentArea = textAreaRef.current;
        const currentText = textRef.current;
        if (!currentArea || !currentText) return;

        currentText.style.fontSize = "";
        const computedStyle = window.getComputedStyle(currentText);
        const maxFontSize = Number.parseFloat(computedStyle.fontSize) || 24;
        const minFontSize = Math.max(10, Math.min(14, maxFontSize * 0.46));
        const availableHeight = currentArea.clientHeight;
        const availableWidth = currentArea.clientWidth;

        if (!availableHeight || !availableWidth) return;

        let low = minFontSize;
        let high = maxFontSize;

        for (let step = 0; step < 8; step += 1) {
          const candidate = (low + high) / 2;
          currentText.style.fontSize = `${candidate}px`;

          const fits =
            currentText.scrollHeight <= availableHeight + 1 &&
            currentText.scrollWidth <= availableWidth + 1;

          if (fits) {
            low = candidate;
          } else {
            high = candidate;
          }
        }

        currentText.style.fontSize = `${low}px`;
        const roundedSize = Math.max(minFontSize, low);
        setFitFontSize((currentSize) =>
          currentSize === null || Math.abs(currentSize - roundedSize) > 0.25
            ? roundedSize
            : currentSize,
        );
      });
    }

    fitTextToCard();

    const resizeObserver = new ResizeObserver(fitTextToCard);
    resizeObserver.observe(textArea);
    void document.fonts?.ready.then(fitTextToCard);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [text, textDensity, hasReviewToggle]);

  return (
    <div className="flashcard-card-content h-full">
      {onToggleReview ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleReview();
          }}
          className={`absolute right-6 top-6 z-10 flex h-9 w-9 items-center justify-center rounded-md border transition sm:right-8 sm:top-8 ${
            card.review
              ? "border-action bg-action text-on-action"
              : "border-subtle bg-app text-muted hover:bg-surface-hover hover:text-content"
          }`}
          aria-pressed={card.review}
          aria-label={
            card.review
              ? "Scoate flashcardul din recapitulare"
              : "Marchează flashcardul pentru recapitulare"
          }
        >
          <Icon className="h-4 w-4">
            <path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v.5a3 3 0 0 0-2 2.83V8a3 3 0 0 0-1 5.83V15a3 3 0 0 0 3 3 2.5 2.5 0 0 0 2.5 2.5h.5a2.5 2.5 0 0 0 2.5-2.5V4.5A2.5 2.5 0 0 0 9.5 2Z" />
            <path d="M14.5 2a2.5 2.5 0 0 1 2.5 2.5v.5a3 3 0 0 1 2 2.83V8a3 3 0 0 1 1 5.83V15a3 3 0 0 1-3 3 2.5 2.5 0 0 1-2.5 2.5h-.5a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 14.5 2Z" />
          </Icon>
        </button>
      ) : null}
      <div
        ref={textAreaRef}
        className="flashcard-card-main flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-hidden"
      >
        {image ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-app/60 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="h-full max-h-full w-full max-w-full object-contain"
            />
          </div>
        ) : null}
        {text ? (
          <h3
            ref={textRef}
            data-flashcard-text={side}
            data-density={textDensity}
            className={`flashcard-card-question select-text font-serif font-semibold ${
              hasReviewToggle ? "pr-14 sm:pr-16" : ""
            }`}
            style={
              fitFontSize
                ? ({ fontSize: `${fitFontSize}px` } as CSSProperties)
                : undefined
            }
          >
            {text}
          </h3>
        ) : null}
      </div>

      <div className="flashcard-card-footer absolute inset-x-6 bottom-6 flex items-center border-t border-subtle pt-4 text-xs font-bold text-muted sm:inset-x-8">
        {onFlip ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFlip();
            }}
            className="flashcard-card-action rounded-md border border-subtle bg-app px-3 py-1.5 text-content transition hover:-translate-y-0.5 hover:bg-surface-hover"
          >
            {flipLabel}
          </button>
        ) : (
          <span className="flashcard-card-action">{flipLabel}</span>
        )}
      </div>
    </div>
  );
}

function AccountFlashcardContent({
  card,
  flipped = false,
  onFlip,
  onToggleReview,
}: {
  card: AccountFlashcard;
  flipped?: boolean;
  onFlip?: () => void;
  onToggleReview?: () => void;
}) {
  return (
    <div
      className="flashcard-flip h-full"
      data-flipped={flipped ? "true" : "false"}
    >
      <div className="flashcard-flip-inner">
        <div className="flashcard-face-side theme-shadow-card rounded-xl border border-subtle bg-surface p-6 text-content sm:p-8">
          <AccountFlashcardFaceContent
            card={card}
            side="question"
            onFlip={onFlip}
            onToggleReview={onToggleReview}
          />
        </div>
        <div className="flashcard-face-side flashcard-face-side-back theme-shadow-card rounded-xl border border-subtle bg-surface p-6 text-content sm:p-8">
          <AccountFlashcardFaceContent
            card={card}
            side="answer"
            onFlip={onFlip}
            onToggleReview={onToggleReview}
          />
        </div>
      </div>
    </div>
  );
}

function FlashcardDeckPage({
  projectId,
  deck,
  onBack,
  onToggleReview,
  hasAiAccess,
  onUsageRefresh,
}: {
  projectId: string;
  deck: AccountFlashcardDeck;
  onBack: () => void;
  onToggleReview: (flashcardId: string, review: boolean) => Promise<void>;
  hasAiAccess: boolean;
  onUsageRefresh: () => Promise<void>;
}) {
  const flashcardTextRef = useRef<HTMLDivElement | null>(null);
  const shuffleIdRef = useRef(0);
  const shuffleTimerRef = useRef<number | null>(null);
  const flashcardAiRequestIdRef = useRef(0);
  const fullCardsRef = useRef<AccountFlashcard[]>(deck.cards);
  const [cards, setCards] = useState<AccountFlashcard[]>(deck.cards);
  const [showReviewOnly, setShowReviewOnly] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shuffle, setShuffle] = useState<FlashcardShuffleState | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [pendingFlashcardSelection, setPendingFlashcardSelection] =
    useState<PendingFlashcardSelection | null>(null);
  const [pendingFlashcardQuestion, setPendingFlashcardQuestion] =
    useState("");
  const [flashcardAiDialog, setFlashcardAiDialog] =
    useState<FlashcardAiDialog | null>(null);
  const hasCards = cards.length > 0;
  const isAnimating = Boolean(shuffle);
  const reviewCardsCount = deck.cards.filter((card) => card.review).length;

  useEffect(() => {
    return () => {
      if (shuffleTimerRef.current) {
        window.clearTimeout(shuffleTimerRef.current);
      }
      flashcardAiRequestIdRef.current += 1;
    };
  }, []);

  function moveCard(direction: 1 | -1) {
    if (!hasCards || isAnimating || cards.length <= 1) {
      return;
    }

    const previousIndex = activeIndex;
    const nextIndex =
      (activeIndex + direction + cards.length) % cards.length;
    const animatedCard = cards[direction === 1 ? previousIndex : nextIndex];

    shuffleIdRef.current += 1;
    setShowAnswer(false);
    setPendingFlashcardSelection(null);
    setPendingFlashcardQuestion("");
    window.getSelection()?.removeAllRanges();
    setShuffle({
      id: shuffleIdRef.current,
      mode: "move",
      card: animatedCard,
      direction,
      durationMs: 1150,
    });
    setActiveIndex(nextIndex);

    shuffleTimerRef.current = window.setTimeout(() => {
      setShuffle(null);
      shuffleTimerRef.current = null;
    }, 1150);
  }

  function shuffleDeck() {
    if (!hasCards || isAnimating || cards.length <= 1) {
      return;
    }

    const shuffledCards = shuffleAccountFlashcards(cards, activeIndex);
    const ghosts = getFlashcardShuffleMixGhosts(cards, activeIndex);

    shuffleIdRef.current += 1;
    setShowAnswer(false);
    setPendingFlashcardSelection(null);
    setPendingFlashcardQuestion("");
    window.getSelection()?.removeAllRanges();
    setShuffle({
      id: shuffleIdRef.current,
      mode: "mix",
      ghosts,
      durationMs: 920,
    });

    shuffleTimerRef.current = window.setTimeout(() => {
      setCards(shuffledCards);
      if (!showReviewOnly) {
        fullCardsRef.current = shuffledCards;
      }
      setActiveIndex(0);
      setShuffle(null);
      shuffleTimerRef.current = null;
    }, 920);
  }

  function toggleReviewOnlyFilter() {
    setPendingFlashcardSelection(null);
    setPendingFlashcardQuestion("");
    window.getSelection()?.removeAllRanges();
    setShowReviewOnly((current) => {
      const next = !current;
      setCards(
        next
          ? fullCardsRef.current.filter((card) => card.review)
          : fullCardsRef.current,
      );
      setActiveIndex(0);
      return next;
    });
  }

  function handleToggleReview(card: AccountFlashcard) {
    const nextReview = !card.review;
    const applyReview = (list: AccountFlashcard[]) =>
      list.map((item) =>
        item.id === card.id ? { ...item, review: nextReview } : item,
      );

    fullCardsRef.current = applyReview(fullCardsRef.current);
    setCards((currentCards) => {
      const updated = applyReview(currentCards);
      return showReviewOnly ? updated.filter((item) => item.review) : updated;
    });

    onToggleReview(card.flashcardId, nextReview).catch(() => {
      const revertReview = (list: AccountFlashcard[]) =>
        list.map((item) =>
          item.id === card.id ? { ...item, review: card.review } : item,
        );
      fullCardsRef.current = revertReview(fullCardsRef.current);
      setCards((currentCards) => {
        const reverted = revertReview(currentCards);
        return showReviewOnly
          ? reverted.filter((item) => item.review)
          : reverted;
      });
    });
  }

  function toggleFlashcardSide() {
    setShowAnswer((visible) => !visible);
    setPendingFlashcardSelection(null);
    setPendingFlashcardQuestion("");
    window.getSelection()?.removeAllRanges();
  }

  function readFlashcardSelection() {
    if (!hasCards) {
      return;
    }

    const root = flashcardTextRef.current;
    const selection = window.getSelection();

    if (!root || !selection || selection.isCollapsed) {
      return;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    if (
      !anchorNode ||
      !focusNode ||
      !root.contains(anchorNode) ||
      !root.contains(focusNode)
    ) {
      return;
    }

    const anchorSide = getFlashcardTextSide(anchorNode);
    const focusSide = getFlashcardTextSide(focusNode);
    const selectedText = normalizeSummarySelection(selection.toString());

    if (!anchorSide || anchorSide !== focusSide || selectedText.length < 3) {
      return;
    }

    const activeCard = cards[activeIndex];
    if (!activeCard) {
      return;
    }

    setPendingFlashcardQuestion("");
    setPendingFlashcardSelection({
      flashcardId: activeCard.flashcardId,
      text: selectedText,
      side: anchorSide,
      topic: activeCard.topic,
    });
  }

  async function handleAskFlashcardAi() {
    if (!pendingFlashcardSelection || !hasAiAccess) {
      return;
    }

    flashcardAiRequestIdRef.current += 1;
    const requestId = flashcardAiRequestIdRef.current;
    const selection = pendingFlashcardSelection;
    const cleanQuestion = pendingFlashcardQuestion.trim();

    setFlashcardAiDialog({
      ...selection,
      question: cleanQuestion || null,
      status: "loading",
    });
    setPendingFlashcardSelection(null);
    setPendingFlashcardQuestion("");
    window.getSelection()?.removeAllRanges();

    try {
      const response = await explainStudyProjectFlashcardSelection({
        projectId,
        flashcardId: selection.flashcardId,
        side: selection.side,
        selectedText: selection.text,
        studentQuestion: cleanQuestion || null,
      });

      if (requestId !== flashcardAiRequestIdRef.current) {
        return;
      }

      void onUsageRefresh();
      setFlashcardAiDialog({
        ...selection,
        question: cleanQuestion || null,
        status: "done",
        response,
      });
    } catch (error) {
      if (requestId !== flashcardAiRequestIdRef.current) {
        return;
      }
      setFlashcardAiDialog({
        ...selection,
        question: cleanQuestion || null,
        status: "done",
        response: {
          title: "Explicația nu este disponibilă momentan",
          answer:
            error instanceof Error
              ? error.message
              : "Nu am putut genera explicația. Încearcă din nou peste câteva momente.",
          bullets: [
            "Verifică dacă ai selectat un fragment clar din flashcard.",
            "Poți continua recapitularea și poți reveni la explicație mai târziu.",
          ],
        },
      });
    }
  }
  function handleCloseFlashcardAiDialog() {
    flashcardAiRequestIdRef.current += 1;
    setFlashcardAiDialog(null);
  }

  const shufflingCardIds =
    shuffle?.mode === "move"
      ? [shuffle.card.id]
      : shuffle?.mode === "mix"
        ? shuffle.ghosts.map((ghost) => ghost.card.id)
        : [];

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
      >
        <Icon>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </Icon>
        Înapoi la pachete
      </button>

      <div className="grid gap-8 border-t border-subtle pt-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
        <div>
          <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            {deck.eyebrow}
          </p>
          <h2 className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-none text-content sm:text-5xl">
            {deck.title}
          </h2>
          <div className="mt-5 divide-y divide-subtle border-y border-subtle text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-muted">Flashcard-uri</span>
              <b className="text-content">{deck.cards.length}</b>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-muted">Marcate</span>
              <b className="text-content">{reviewCardsCount}</b>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-muted">Interacțiune</span>
              <b className="text-right text-content">
                {hasAiAccess ? "Selectează text pentru AI" : "AI indisponibil"}
              </b>
            </div>
          </div>
          {pendingFlashcardSelection ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleAskFlashcardAi();
              }}
              className="sticky top-16 z-20 mt-4 rounded-xl border border-info-border bg-info-soft p-4 text-info theme-shadow-card"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                Text selectat din{" "}
                {pendingFlashcardSelection.side === "question"
                  ? "întrebare"
                  : "răspuns"}
              </p>
              <p className="mt-2 text-sm leading-6">
                “{pendingFlashcardSelection.text}”
              </p>
              <label
                htmlFor="flashcard-ai-question"
                className="mt-4 block text-[11px] font-black uppercase tracking-[0.16em]"
              >
                Întrebarea ta
              </label>
              <textarea
                id="flashcard-ai-question"
                value={pendingFlashcardQuestion}
                onChange={(event) => setPendingFlashcardQuestion(event.target.value)}
                placeholder="Ex: explică de ce răspunsul e corect sau dă-mi un exemplu simplu."
                rows={3}
                maxLength={1000}
                className="mt-2 w-full resize-none rounded-md border border-info-border bg-surface px-3 py-2 text-sm leading-6 text-content outline-none transition placeholder:text-muted focus:border-info focus:ring-2 focus:ring-info/15"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-info/70">
                <span>Opțional</span>
                <span>{pendingFlashcardQuestion.length}/1000</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="group relative inline-flex">
                  <button
                    type="submit"
                    disabled={!hasAiAccess}
                    title={!hasAiAccess ? AI_ACCESS_UNAVAILABLE_MESSAGE : undefined}
                    className={`rounded-md px-4 py-2 text-xs font-bold transition ${
                      hasAiAccess
                        ? "cursor-pointer bg-action text-on-action hover:bg-action-hover"
                        : "cursor-not-allowed border border-info-border bg-surface text-muted opacity-65"
                    }`}
                  >
                    {hasAiAccess ? "Întreabă" : "AI indisponibil"}
                  </button>
                  {!hasAiAccess ? (
                    <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-subtle bg-surface px-3 py-2 text-xs font-semibold leading-5 text-content opacity-0 shadow-lg shadow-black/10 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      {AI_ACCESS_UNAVAILABLE_MESSAGE}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingFlashcardSelection(null);
                    setPendingFlashcardQuestion("");
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="rounded-md border border-info-border px-4 py-2 text-xs font-bold transition hover:bg-info-soft/70"
                >
                  Anulează
                </button>
              </div>
            </form>
          ) : null}
        </div>
        <div className="lg:-mt-2">
          {hasCards ? (
            <div
              ref={flashcardTextRef}
              onKeyUp={readFlashcardSelection}
              onMouseUp={readFlashcardSelection}
              className="flashcard-story-deck account-flashcard-deck relative mx-auto w-full max-w-lg"
            >
              {cards.map((card, index) => {
                const distance =
                  (index - activeIndex + cards.length) % cards.length;
                const isActive = distance === 0;
                const isShuffling = shufflingCardIds.includes(card.id);
                const visibleLayer = Math.max(
                  0,
                  accountFlashcardLayouts.length - distance,
                );

                if (
                  distance >= accountFlashcardLayouts.length &&
                  !isShuffling
                ) {
                  return null;
                }

                return (
                  <div
                    key={card.id}
                    aria-hidden={!isActive}
                    className="flashcard-desk-card flashcard-face absolute inset-x-3 top-0 rounded-xl text-left outline-none transition sm:inset-x-0"
                    style={{
                      zIndex: isShuffling ? 0 : visibleLayer,
                      transform: toAccountFlashcardTransform(
                        getAccountFlashcardLayout(distance),
                      ),
                      visibility: isShuffling ? "hidden" : "visible",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    <AccountFlashcardContent
                      card={card}
                      flipped={showAnswer && isActive}
                      onFlip={isActive ? toggleFlashcardSide : undefined}
                      onToggleReview={
                        isActive ? () => handleToggleReview(card) : undefined
                      }
                    />
                  </div>
                );
              })}

              {shuffle?.mode === "move" ? (
                <div
                  key={shuffle.id}
                  aria-hidden="true"
                  className={`flashcard-shuffle-ghost flashcard-face pointer-events-none absolute inset-x-3 top-0 text-left sm:inset-x-0 ${
                    shuffle.direction === 1
                      ? "flashcard-shuffle-forward"
                      : "flashcard-shuffle-reverse"
                  }`}
                  style={
                    {
                      "--shuffle-start": toAccountFlashcardTransform(
                        shuffle.direction === 1
                          ? getAccountFlashcardLayout(0)
                          : getAccountFlashcardLayout(cards.length - 1),
                      ),
                      "--shuffle-end": toAccountFlashcardTransform(
                        shuffle.direction === 1
                          ? getAccountFlashcardLayout(cards.length - 1)
                          : getAccountFlashcardLayout(0),
                      ),
                      "--shuffle-duration": `${shuffle.durationMs}ms`,
                    } as CSSProperties
                  }
                >
                  <AccountFlashcardContent card={shuffle.card} />
                </div>
              ) : null}

              {shuffle?.mode === "mix"
                ? shuffle.ghosts.map((ghost, index) => (
                    <div
                      key={`${shuffle.id}-${ghost.card.id}`}
                      aria-hidden="true"
                      className={`flashcard-shuffle-ghost flashcard-shuffle-mix flashcard-shuffle-mix-${ghost.variant} flashcard-face pointer-events-none absolute inset-x-3 top-0 text-left sm:inset-x-0`}
                      style={
                        {
                          "--shuffle-start": toAccountFlashcardTransform(
                            getAccountFlashcardLayout(ghost.startDistance),
                          ),
                          "--shuffle-end": toAccountFlashcardTransform(
                            getAccountFlashcardLayout(ghost.endDistance),
                          ),
                          "--shuffle-duration": `${shuffle.durationMs}ms`,
                          "--shuffle-delay": `${index * 35}ms`,
                          "--mix-layer": index,
                        } as CSSProperties
                      }
                    >
                      <AccountFlashcardContent card={ghost.card} />
                    </div>
                  ))
                : null}
            </div>
          ) : (
            <div className="grid min-h-[22rem] place-items-center rounded-xl border border-subtle bg-surface p-6 text-center">
              <div>
                {showReviewOnly ? (
                  <>
                    <p className="font-serif text-3xl font-semibold">
                      Nu ai flashcarduri marcate pentru recapitulare.
                    </p>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">
                      Apasă pe iconița cu creierul de pe un flashcard ca să-l
                      adaugi aici.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-3xl font-semibold">
                      Încă nu ai flashcarduri din quizuri.
                    </p>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">
                      Intră într-un quiz și răspunde. Când greșești, apasă
                      „Salvează ca flashcard” și întrebarea ajunge aici.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {hasCards ? (
            <div className="mt-8 flex w-full flex-col items-center gap-2 sm:mt-5 sm:gap-3">
              <div className="flex w-full max-w-[18rem] items-center justify-center gap-2 sm:max-w-none sm:gap-3">
                <button
                  type="button"
                  onClick={() => moveCard(-1)}
                  disabled={isAnimating || cards.length <= 1}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-subtle bg-app text-content transition hover:-translate-y-0.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:w-12"
                  aria-label="Flashcard anterior"
                >
                  <Icon>
                    <path d="M19 12H5M11 5l-7 7 7 7" />
                  </Icon>
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(1)}
                  disabled={isAnimating || cards.length <= 1}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-action text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:w-12"
                  aria-label="Flashcard următor"
                >
                  <Icon>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </Icon>
                </button>
                <span className="min-w-14 rounded-md border border-subtle bg-app px-3 py-2 text-center text-xs font-bold text-muted sm:border-0 sm:bg-transparent sm:px-0">
                  {activeIndex + 1}/{cards.length}
                </span>
              </div>

              <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
                <button
                  type="button"
                  onClick={shuffleDeck}
                  disabled={isAnimating || cards.length <= 1}
                  className="inline-flex h-10 w-full max-w-[13.5rem] items-center justify-center gap-2 rounded-md border border-subtle bg-app px-4 text-xs font-bold text-content transition hover:-translate-y-0.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-55 sm:h-12 sm:w-[13.5rem] sm:max-w-none sm:px-5 sm:text-sm"
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5">
                    <path d="M16 3h5v5M4 20l17-17M21 16v5h-5M15 15l6 6M4 4l5 5" />
                  </Icon>
                  Amestecă
                </button>
                {deck.cards.length > 0 ? (
                  <button
                    type="button"
                    onClick={toggleReviewOnlyFilter}
                    className={`inline-flex h-10 w-full max-w-[13.5rem] items-center justify-center gap-2 rounded-md border px-4 text-xs font-bold transition sm:h-12 sm:w-[13.5rem] sm:max-w-none sm:text-sm ${
                      showReviewOnly
                        ? "border-action bg-action text-on-action"
                        : "border-subtle bg-app text-content hover:bg-surface-hover"
                    }`}
                    aria-pressed={showReviewOnly}
                  >
                    <Icon className="h-4 w-4">
                      <path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v.5a3 3 0 0 0-2 2.83V8a3 3 0 0 0-1 5.83V15a3 3 0 0 0 3 3 2.5 2.5 0 0 0 2.5 2.5h.5a2.5 2.5 0 0 0 2.5-2.5V4.5A2.5 2.5 0 0 0 9.5 2Z" />
                      <path d="M14.5 2a2.5 2.5 0 0 1 2.5 2.5v.5a3 3 0 0 1 2 2.83V8a3 3 0 0 1 1 5.83V15a3 3 0 0 1-3 3 2.5 2.5 0 0 1-2.5 2.5h-.5a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 14.5 2Z" />
                    </Icon>
                    Marcate
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!hasCards && deck.cards.length > 0 ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={toggleReviewOnlyFilter}
                className={`inline-flex h-10 w-full max-w-[13.5rem] items-center justify-center gap-2 rounded-md border px-4 text-xs font-bold transition sm:h-12 sm:w-[13.5rem] sm:max-w-none sm:text-sm ${
                  showReviewOnly
                    ? "border-action bg-action text-on-action"
                    : "border-subtle bg-app text-content hover:bg-surface-hover"
                }`}
                aria-pressed={showReviewOnly}
              >
                <Icon className="h-4 w-4">
                  <path d="M9.5 2a2.5 2.5 0 0 0-2.5 2.5v.5a3 3 0 0 0-2 2.83V8a3 3 0 0 0-1 5.83V15a3 3 0 0 0 3 3 2.5 2.5 0 0 0 2.5 2.5h.5a2.5 2.5 0 0 0 2.5-2.5V4.5A2.5 2.5 0 0 0 9.5 2Z" />
                  <path d="M14.5 2a2.5 2.5 0 0 1 2.5 2.5v.5a3 3 0 0 1 2 2.83V8a3 3 0 0 1 1 5.83V15a3 3 0 0 1-3 3 2.5 2.5 0 0 1-2.5 2.5h-.5a2.5 2.5 0 0 1-2.5-2.5V4.5A2.5 2.5 0 0 1 14.5 2Z" />
                </Icon>
                Marcate
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {flashcardAiDialog ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flashcard-ai-title"
        >
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-subtle bg-surface theme-shadow-card">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-subtle bg-surface p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">
                  Flashcard AI
                </p>
                <h3
                  id="flashcard-ai-title"
                  className="mt-2 font-serif text-2xl font-semibold leading-tight text-content"
                >
                  {flashcardAiDialog.status === "loading"
                    ? "Generez explicația"
                    : flashcardAiDialog.response?.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseFlashcardAiDialog}
                className="rounded-md border border-subtle px-4 py-2 text-xs font-bold text-content transition hover:bg-surface-hover"
              >
                Închide
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <div className="space-y-5">
                <div className="rounded-xl border border-info-border bg-info-soft p-4 text-info">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                    Ai întrebat despre{" "}
                    {flashcardAiDialog.side === "question"
                      ? "întrebare"
                      : "răspuns"}
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    “{flashcardAiDialog.text}”
                  </p>
                  {flashcardAiDialog.question ? (
                    <div className="mt-3 border-t border-info-border/60 pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em]">
                        Întrebarea ta
                      </p>
                      <p className="mt-1 text-sm leading-6">
                        {flashcardAiDialog.question}
                      </p>
                    </div>
                  ) : null}
                </div>

                {flashcardAiDialog.status === "loading" ? (
                  <div className="grid min-h-64 place-items-center rounded-xl border border-subtle bg-app p-6 text-center">
                    <div>
                      <div className="mx-auto h-14 w-14 animate-spin rounded-full border-2 border-info-border border-t-info" />
                      <p className="mt-5 font-serif text-2xl font-semibold text-content">
                        Analizez flashcardul...
                      </p>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                        Caut conceptul, legătura cu răspunsul și cea mai scurtă
                        explicație utilă pentru recapitulare.
                      </p>
                      <div className="mx-auto mt-6 max-w-sm space-y-2">
                        <div className="h-3 animate-pulse rounded-full bg-info-soft" />
                        <div className="h-3 w-4/5 animate-pulse rounded-full bg-info-soft" />
                        <div className="h-3 w-2/3 animate-pulse rounded-full bg-info-soft" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <p className="text-base leading-8 text-content/85">
                      {flashcardAiDialog.response?.answer}
                    </p>
                    <div className="border-t border-subtle pt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                        Cum să-l înveți
                      </p>
                      <div className="mt-2 divide-y divide-subtle">
                        {flashcardAiDialog.response?.bullets.map((bullet) => (
                          <div
                            key={bullet}
                            className="flex gap-3 py-3 text-sm leading-6 text-content/80"
                          >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-info" />
                            <p>{bullet}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type ManualFlashcardPayload = {
  question: string;
  answer: string;
  category: string;
  difficulty: string;
  questionImageFile?: File;
};

const manualFlashcardDifficulties = [
  { value: "low", label: "Ușor" },
  { value: "medium", label: "Mediu" },
  { value: "high", label: "Greu" },
];

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function ManualFlashcardBuilderPage({
  onBack,
  onCreate,
}: {
  onBack: () => void;
  onCreate: (flashcard: ManualFlashcardPayload) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [questionImage, setQuestionImage] = useState<string | undefined>();
  const [questionImageFile, setQuestionImageFile] = useState<File | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const canSave =
    category.trim().length > 0 &&
    (question.trim().length > 0 || Boolean(questionImage)) &&
    answer.trim().length > 0 &&
    !isSaving;

  function resetForm() {
    setQuestion("");
    setAnswer("");
    setCategory("");
    setDifficulty("medium");
    setQuestionImage(undefined);
    setQuestionImageFile(undefined);
  }

  async function handleImageChange(file: File | undefined) {
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    setQuestionImage(dataUrl);
    setQuestionImageFile(file);
  }

  function handleCancel() {
    resetForm();
    onBack();
  }

  async function handleSave() {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await onCreate({
        question: question.trim(),
        answer: answer.trim(),
        category: category.trim(),
        difficulty,
        questionImageFile,
      });
      resetForm();
    } catch {
      toast.error("Flashcardul nu a putut fi salvat momentan.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 border-b border-subtle pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.55fr)] xl:items-end">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <Icon>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </Icon>
            Înapoi la pachete
          </button>

          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Flashcard manual
            </span>
            <h2 className="min-w-0 font-serif text-3xl font-semibold leading-none text-content sm:text-4xl">
              Creează flashcard.
            </h2>
          </div>
        </div>

        <div className="divide-y divide-subtle border-y border-subtle">
            <label className="grid gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                Categorie
              </span>
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Ex: Farmacognozie"
                className="w-full bg-transparent text-sm font-bold text-content outline-none placeholder:text-muted/45"
              />
            </label>

            <div className="grid gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                Dificultate
              </span>
              <div className="flex flex-wrap gap-2">
                {manualFlashcardDifficulties.map((option) => {
                  const isActive = difficulty === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDifficulty(option.value)}
                      className={`h-9 cursor-pointer rounded-md border px-4 text-xs font-bold transition ${
                        isActive
                          ? "border-action bg-action text-on-action"
                          : "border-subtle text-muted hover:bg-surface-hover hover:text-content"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ManualFlashcardEditorCard
          label="Întrebare"
          eyebrow="Față"
          value={question}
          image={questionImage}
          placeholder="Scrie întrebarea aici..."
          onChange={setQuestion}
          onImageChange={handleImageChange}
          onImageRemove={() => {
            setQuestionImage(undefined);
            setQuestionImageFile(undefined);
          }}
        />
        <ManualFlashcardEditorCard
          label="Răspuns"
          eyebrow="Spate"
          value={answer}
          placeholder="Scrie răspunsul..."
          onChange={setAnswer}
          allowImage={false}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-subtle pt-5">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-12 cursor-pointer rounded-md border border-subtle px-5 text-sm font-bold text-content transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
        >
          Anulare
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="h-12 cursor-pointer rounded-md bg-action px-6 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
        >
          {isSaving ? "Se salvează..." : "Salvare"}
        </button>
      </div>
    </section>
  );
}

function ManualFlashcardEditorCard({
  label,
  eyebrow,
  value,
  image,
  placeholder,
  onChange,
  onImageChange,
  onImageRemove,
  allowImage = true,
}: {
  label: string;
  eyebrow: string;
  value: string;
  image?: string;
  placeholder: string;
  onChange: (value: string) => void;
  onImageChange?: (file: File | undefined) => void;
  onImageRemove?: () => void;
  allowImage?: boolean;
}) {
  return (
    <article className="rounded-xl border border-subtle bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            {eyebrow}
          </p>
          <h3 className="mt-1 font-serif text-2xl font-semibold leading-none text-content">
            {label}
          </h3>
        </div>
        {allowImage ? (
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-app px-4 text-xs font-bold text-content transition hover:bg-surface-hover">
            <Icon className="h-4 w-4">
              <path d="M12 5v14M5 12h14" />
            </Icon>
            Adaugă imagine
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                onImageChange?.(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
      </div>

      <div className="flex min-h-[18rem] flex-col sm:min-h-[20rem]">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-[11rem] flex-1 resize-none bg-transparent px-5 py-5 font-serif text-2xl font-semibold leading-tight text-content outline-none placeholder:text-muted/35 sm:text-3xl"
        />
        {allowImage && image ? (
          <div className="relative border-t border-subtle bg-app p-4">
            <div className="h-44 overflow-hidden rounded-lg border border-subtle bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="" className="h-full w-full object-contain" />
            </div>
            <button
              type="button"
              onClick={onImageRemove}
              className="absolute right-7 top-7 cursor-pointer rounded-md bg-action px-3 py-1.5 text-xs font-bold text-on-action transition hover:bg-action-hover"
            >
              Șterge
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function FlashcardsPanel({
  project,
  mode,
  hasAiAccess,
  onUsageRefresh,
  onManualFlashcardCreate,
  onToggleFlashcardReview,
}: {
  project: StudyProject;
  mode: FlashcardPanelMode;
  hasAiAccess: boolean;
  onUsageRefresh: () => Promise<void>;
  onManualFlashcardCreate: (
    projectId: string,
    flashcard: ManualFlashcardPayload,
  ) => Promise<void>;
  onToggleFlashcardReview: (
    projectId: string,
    flashcardId: string,
    review: boolean,
  ) => Promise<void>;
}) {
  const router = useRouter();
  const [activeDeckId, setActiveDeckId] = useState<FlashcardDeckId | null>(null);
  const decks = useMemo(() => buildProjectFlashcardDecks(project), [project]);
  const quizMistakeCount = project.quizMistakeFlashcards.length;
  const manualFlashcardCount = project.manualFlashcards.length;
  const flashcardCards: FlashcardStudyCard[] = [
    {
      id: "initial",
      badge: "Generate initial",
      title: `${project.flashcardsDue} din ${project.flashcardsTotal} flashcard-uri`,
      description:
        "Pachetul generat din materialele încărcate, bun pentru prima recapitulare structurată.",
      duration: "8 min",
      metric: "din rezumatul inițial",
    },
    {
      id: "quiz",
      badge: "Recapitulare adaptivă",
      title: quizMistakeCount
        ? quizMistakeCount === 1
          ? "1 flashcard din greșeli"
          : `${quizMistakeCount} flashcard-uri din greșeli`
        : "Din quiz-urile tale",
      description:
        quizMistakeCount
          ? "Întrebările pe care ai ales să le salvezi, cu răspunsul corect."
          : "Când greșești o întrebare de quiz, poți salva aici întrebarea și răspunsul corect.",
      duration: quizMistakeCount ? `${Math.max(3, quizMistakeCount * 2)} min` : "0 min",
      metric: "din greșeli reale",
    },
  ];

  if (manualFlashcardCount > 0) {
    flashcardCards.push({
      id: "manual",
      badge: "Create manual",
      title: `${manualFlashcardCount} flashcard-uri create de tine`,
      description:
        "Cardurile adăugate manual, separate de pachetele generate automat.",
      duration: `${Math.max(2, manualFlashcardCount * 2)} min`,
      metric: "create manual",
    });
  }

  if (mode === "create") {
    return (
      <ManualFlashcardBuilderPage
        onBack={() =>
          router.push(`/myaccount/flashcarduri?project=${project.id}`)
        }
        onCreate={(flashcard) =>
          onManualFlashcardCreate(project.id, flashcard)
        }
      />
    );
  }

  if (activeDeckId) {
    return (
      <FlashcardDeckPage
        projectId={project.id}
        deck={decks[activeDeckId]}
        onBack={() => setActiveDeckId(null)}
        hasAiAccess={hasAiAccess}
        onUsageRefresh={onUsageRefresh}
        onToggleReview={(flashcardId, review) =>
          onToggleFlashcardReview(project.id, flashcardId, review)
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() =>
            router.push(`/myaccount/flashcarduri/creeaza?project=${project.id}`)
          }
          className="inline-flex h-11 w-fit shrink-0 cursor-pointer items-center gap-2 rounded-md bg-action px-5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover sm:ml-auto"
        >
          <Icon>
            <path d="M12 5v14M5 12h14" />
          </Icon>
          Creează flashcard
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {flashcardCards.map((card) => (
          <FlashcardTicket
            key={card.title}
            card={card}
            onOpenDeck={setActiveDeckId}
          />
        ))}
      </div>
    </div>
  );
}

type QuizQuestionMode =
  | "single"
  | "multiple"
  | "matching"
  | "ordering"
  | "cloze";
type QuizComplexity = "Ușor" | "Mediu" | "Greu" | "Examen";

type AccountQuizQuestion = {
  id: string;
  sourceQuestionId: string;
  concept: string;
  /** Inherited from the quiz, so it uses the same four labels. */
  difficulty: QuizComplexity;
  mode: QuizQuestionMode;
  question: string;
  answers: string[];
  /** matching only: `pairs[i]` is the correct match for `answers[i]`. */
  pairs: string[];
  /** cloze only: the sentence around its gaps, `gaps + 1` pieces. */
  segments: string[];
  /** cloze only: how many gaps the sentence has. */
  gapCount: number;
  correctIndexes: number[];
  explanation: string;
  aiInsight: string;
  review: QuizReviewLocation | null;
  source: string;
};

type AccountQuizAttempt = {
  id: string;
  scorePercent: number;
  correctCount: number;
  answeredCount: number;
  completedAt: string;
};

type AccountQuiz = {
  id: string;
  title: string;
  description: string;
  complexity: QuizComplexity;
  duration: string;
  focus: string;
  recommended?: boolean;
  questionIds: string[];
  completedAt: string | null;
  scorePercent: number | null;
  correctCount: number | null;
  answeredCount: number | null;
  attempts: AccountQuizAttempt[];
};

function getQuizQuestions(
  quiz: AccountQuiz,
  questionBank: Record<string, AccountQuizQuestion>,
) {
  return quiz.questionIds
    .map((questionId) => questionBank[questionId])
    .filter(Boolean);
}

function normalizeGeneratedQuestionMode(
  value: string | null | undefined,
): QuizQuestionMode {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("matching")) return "matching";
  if (normalized.includes("ordering")) return "ordering";
  if (normalized.includes("cloze")) return "cloze";
  if (normalized.includes("multiple")) return "multiple";
  return "single";
}

function normalizeGeneratedQuizComplexity(
  value: string | null | undefined,
): QuizComplexity {
  const normalizedValue = value?.toLocaleLowerCase("ro-RO") ?? "";

  // Checked before "high": an exam quiz used to match nothing here and fall
  // through to the easiest label.
  if (
    normalizedValue.includes("exam") ||
    normalizedValue.includes("simulare")
  ) {
    return "Examen";
  }

  if (
    normalizedValue.includes("rid") ||
    normalizedValue.includes("high") ||
    normalizedValue.includes("greu")
  ) {
    return "Greu";
  }

  if (
    normalizedValue.includes("med") ||
    normalizedValue.includes("medium")
  ) {
    return "Mediu";
  }

  return "Ușor";
}

function buildProjectQuizData(project: StudyProject) {
  if (!project.quizzes.length) {
    return {
      catalog: [],
      questionBank: {},
    };
  }

  const questionBank: Record<string, AccountQuizQuestion> = {};
  const summaryParagraphs = splitSummaryParagraphs(project.summary?.content ?? "");
  const catalog: AccountQuiz[] = project.quizzes
    .map<AccountQuiz | null>((quiz, quizIndex) => {
      const complexity = normalizeGeneratedQuizComplexity(quiz.complexity);
      const questionIds: string[] = [];

      quiz.questions.forEach((question) => {
        const options = question.options.filter((option) => option.label.trim());

        if (options.length < 2) {
          return;
        }

        const id = `${quiz.id}-${question.id}`;
        const mode = normalizeGeneratedQuestionMode(question.question_type);

        // Cloze puts the gap words first, so gap i is answered by the word
        // at index i -- the same positional rule the other two follow.
        const clozeWords =
          mode === "cloze" ? buildClozeWordOrder(options) : null;
        const orderedOptions = clozeWords ? clozeWords.options : options;
        const segments =
          mode === "cloze" ? splitClozeSentence(question.prompt) : [];
        const gapCount = clozeWords ? clozeWords.gapCount : 0;

        const isPositional = mode === "matching" || mode === "ordering";
        const correctIndexes = isPositional
          ? orderedOptions.map((_, optionIndex) => optionIndex)
          : mode === "cloze"
            ? Array.from({ length: gapCount }, (_, gapIndex) => gapIndex)
            : orderedOptions
                .map((option, optionIndex) =>
                  option.is_correct ? optionIndex : -1,
                )
                .filter((optionIndex) => optionIndex >= 0);

        // A matching question is unanswerable without its pairs.
        if (mode === "matching" && options.some((option) => !option.match_label)) {
          return;
        }

        // A cloze needs one word per gap and at least one distractor, and the
        // sentence has to carry exactly as many gaps as there are words.
        if (
          mode === "cloze" &&
          (gapCount < 1 ||
            segments.length !== gapCount + 1 ||
            orderedOptions.length <= gapCount)
        ) {
          return;
        }

        questionIds.push(id);
        questionBank[id] = {
          id,
          sourceQuestionId: question.id,
          concept: question.concept || question.review_section || quiz.title,
          difficulty: complexity,
          mode,
          question: question.prompt,
          answers: orderedOptions.map((option) => option.label),
          pairs: orderedOptions.map((option) => option.match_label ?? ""),
          segments,
          gapCount,
          correctIndexes: correctIndexes.length ? correctIndexes : [0],
          explanation:
            question.explanation ??
            "Explicația nu a fost inclusă în JSON, dar răspunsul corect este marcat.",
          aiInsight: question.review_advice ||
            "Explică răspunsul din memorie și compară-l cu variantele apropiate.",
          review: getQuizReviewLocation(question, summaryParagraphs),
          source: `Quiz generat · ${project.name}`,
        };
      });

      if (!questionIds.length) {
        return null;
      }

      return {
        id: quiz.id,
        title: quiz.title,
        description:
          quiz.description ??
          "Quiz generat din materialele acestui proiect.",
        complexity,
        duration: `${Math.max(3, Math.ceil(questionIds.length * 1.4))} min`,
        focus: project.subjectName,
        recommended: quizIndex === 0,
        questionIds,
        completedAt: quiz.completed_at,
        scorePercent: quiz.score_percent,
        correctCount: quiz.correct_count,
        answeredCount: quiz.answered_count,
        attempts: quiz.attempts.map((attempt) => ({
          id: attempt.id,
          scorePercent: attempt.score_percent,
          correctCount: attempt.correct_count,
          answeredCount: attempt.answered_count,
          completedAt: attempt.completed_at,
        })),
      };
    })
    .filter((quiz): quiz is AccountQuiz => quiz !== null);

  if (!catalog.length) {
    return {
      catalog: [],
      questionBank: {},
    };
  }

  return { catalog, questionBank };
}

function areAnswerSetsEqual(expected: number[], received: number[] = []) {
  if (expected.length !== received.length) {
    return false;
  }

  return expected.every((answerIndex) => received.includes(answerIndex));
}

/** Split a cloze prompt into the text around its gaps. */
function splitClozeSentence(prompt: string) {
  return prompt.split(/_{3,}/);
}

/**
 * Order cloze options so the word for gap `i` sits at index `i`.
 *
 * The API sends the one-based gap number in `sort_order` for correct words
 * and 0 for distractors.
 */
function buildClozeWordOrder(options: StudyProjectQuizOption[]) {
  const gapWords = options
    .filter((option) => option.is_correct && option.sort_order > 0)
    .sort((left, right) => left.sort_order - right.sort_order);
  const distractors = options.filter((option) => !option.is_correct);

  return {
    options: [...gapWords, ...distractors],
    gapCount: gapWords.length,
  };
}

/**
 * How much of a question the student got right, from 0 to 1.
 *
 * Only cloze can land in between: each gap is scored on its own, so a
 * sentence with two of three gaps filled correctly is worth two thirds.
 */
function quizAnswerScore(
  question: AccountQuizQuestion,
  submittedAnswer?: number[],
) {
  if (submittedAnswer === undefined) return 0;

  if (question.mode === "cloze") {
    if (question.gapCount < 1) return 0;
    const correctGaps = Array.from(
      { length: question.gapCount },
      (_, gapIndex) => submittedAnswer[gapIndex] === gapIndex,
    ).filter(Boolean).length;
    return correctGaps / question.gapCount;
  }

  return isQuizAnswerCorrect(question, submittedAnswer) ? 1 : 0;
}

function isQuizAnswerCorrect(
  question: AccountQuizQuestion,
  submittedAnswer?: number[],
) {
  if (question.mode === "cloze") {
    // Fully correct only when every gap holds the word that belongs there.
    return (
      question.gapCount > 0 &&
      Array.from(
        { length: question.gapCount },
        (_, gapIndex) => submittedAnswer?.[gapIndex] === gapIndex,
      ).every(Boolean)
    );
  }

  if (question.mode === "matching" || question.mode === "ordering") {
    // Both encode the answer positionally: the word or pair at slot i is
    // correct only if it is the one stored at index i.
    if (!submittedAnswer || submittedAnswer.length !== question.answers.length) {
      return false;
    }
    return submittedAnswer.every((value, index) => value === index);
  }

  return areAnswerSetsEqual(question.correctIndexes, submittedAnswer);
}

function buildQuizCompletionResult(
  questions: AccountQuizQuestion[],
  submittedAnswers: Record<string, number[]>,
  attemptId: string,
): QuizCompletionResult {
  const questionResults = questions
    .filter((question) => submittedAnswers[question.id] !== undefined)
    .map((question) => ({
      question_id: question.sourceQuestionId,
      is_correct: isQuizAnswerCorrect(question, submittedAnswers[question.id]),
    }));
  return {
    attemptId,
    correctCount: questionResults.filter((result) => result.is_correct).length,
    answeredCount: questionResults.length,
    questionResults,
  };
}

function buildMistakeFlashcardFromQuestion(
  question: AccountQuizQuestion,
): StudyFlashcardCard {
  // Joining the options only reads as an answer for the choice questions.
  // Ordering's answer is the sentence itself, matching's is the pair list.
  const fallbackAnswer =
    question.mode === "ordering"
      ? question.answers.join(" ")
      : question.mode === "matching"
        ? question.answers
            .map((item, itemIndex) => `${item} → ${question.pairs[itemIndex]}`)
            .join("; ")
        : question.correctIndexes
            .map((answerIndex) => question.answers[answerIndex])
            .filter(Boolean)
            .join("; ");

  return {
    id: `quiz-${question.sourceQuestionId ?? question.id}`,
    flashcardId: question.sourceQuestionId ?? question.id,
    review: false,
    topic: question.concept,
    question: question.question,
    answer: question.explanation || fallbackAnswer || "vezi explicația",
    tone: "danger",
    sourceQuestionId: question.sourceQuestionId ?? question.id,
  };
}

function getQuizComplexityClass(complexity: QuizComplexity) {
  if (complexity === "Ușor") {
    return "border-success-border bg-success-soft text-success";
  }

  if (complexity === "Mediu") {
    return "border-info-border bg-info-soft text-info";
  }

  if (complexity === "Greu") {
    return "border-warning-border bg-warning-soft text-warning";
  }

  return "border-danger-border bg-danger-soft text-danger";
}

function formatQuizAttemptTimestamp(value: string) {
  return new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function QuizPanel({
  project,
  onQuizMistake,
  onQuizComplete,
  onGenerateQuiz,
  onCancelQuizGeneration,
  maxQuizQuestions,
  maxQuizzesPerProject,
}: {
  project: StudyProject;
  onQuizMistake: (
    projectId: string,
    questionId: string | null,
    fallbackFlashcard: StudyFlashcardCard,
  ) => void;
  onQuizComplete: (
    projectId: string,
    quizId: string,
    result: QuizCompletionResult,
  ) => Promise<void>;
  onGenerateQuiz: (
    projectId: string,
    config: QuizGenerationConfig,
  ) => Promise<StudyProject>;
  onCancelQuizGeneration: (projectId: string) => Promise<StudyProject>;
  /** Upper bound for one quiz, from the account's plan. */
  maxQuizQuestions: number;
  /** How many quizzes this project may hold, from the account's plan. */
  maxQuizzesPerProject: number;
}) {
  const [isQuizConfigOpen, setIsQuizConfigOpen] = useState(false);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, number[]>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<
    Record<string, number[]>
  >({});
  // Which questions the student chose to keep as a flashcard, so the offer
  // is not repeated and a double click cannot save twice.
  const [savedMistakeCards, setSavedMistakeCards] = useState<
    Record<string, "saving" | "saved" | "error">
  >({});
  const [showQuizSummary, setShowQuizSummary] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [isGeneratingQuizzes, setIsGeneratingQuizzes] = useState(false);
  const [isCancellingQuizGeneration, setIsCancellingQuizGeneration] =
    useState(false);
  const completionSavesRef = useRef(new Map<string, "saving" | "saved" | "error">());
  const [completionSave, setCompletionSave] = useState<{
    attemptId: string;
    status: "saving" | "saved" | "error";
  } | null>(null);
  const [completionRetry, setCompletionRetry] = useState(0);

  const quizData = useMemo(() => buildProjectQuizData(project), [project]);
  const hasReachedQuizLimit = quizData.catalog.length >= maxQuizzesPerProject;
  const activeQuiz = activeQuizId
    ? quizData.catalog.find((quiz) => quiz.id === activeQuizId) ?? null
    : null;
  const quizQuestions = useMemo(
    () => activeQuiz ? getQuizQuestions(activeQuiz, quizData.questionBank) : [],
    [activeQuiz, quizData.questionBank],
  );
  const answeredCount = Object.keys(submittedAnswers).length;
  const correctCount = quizQuestions.reduce((count, question) => {
    return isQuizAnswerCorrect(question, submittedAnswers[question.id])
      ? count + 1
      : count;
  }, 0);
  const isComplete =
    quizQuestions.length > 0 && answeredCount === quizQuestions.length;
  // Flashcards actually kept from this quiz's questions, counted from the
  // project rather than from this run, so a reload does not reset it.
  const quizSourceQuestionIds = new Set(
    quizQuestions
      .map((question) => question.sourceQuestionId)
      .filter((id): id is string => Boolean(id)),
  );
  const savedMistakeCount = project.quizMistakeFlashcards.filter(
    (card) =>
      card.sourceQuestionId && quizSourceQuestionIds.has(card.sourceQuestionId),
  ).length;

  useEffect(() => {
    if (!activeQuiz || !isComplete || !attemptId || completionSavesRef.current.has(attemptId)) {
      return;
    }

    completionSavesRef.current.set(attemptId, "saving");
    setCompletionSave({ attemptId, status: "saving" });
    onQuizComplete(
      project.id,
      activeQuiz.id,
      buildQuizCompletionResult(quizQuestions, submittedAnswers, attemptId),
    )
      .then(() => {
        completionSavesRef.current.set(attemptId, "saved");
        setCompletionSave((current) =>
          current?.attemptId === attemptId ? { attemptId, status: "saved" } : current,
        );
      })
      .catch(() => {
        completionSavesRef.current.set(attemptId, "error");
        setCompletionSave((current) =>
          current?.attemptId === attemptId ? { attemptId, status: "error" } : current,
        );
        toast.error("Rezultatul quizului nu a putut fi salvat.", "Reîncearcă salvarea înainte să ieși din quiz.");
      });
  }, [
    activeQuiz,
    isComplete,
    attemptId,
    quizQuestions,
    submittedAnswers,
    completionRetry,
    onQuizComplete,
    project.id,
  ]);

  // No resume effect: a quiz can no longer be re-requested without the
  // configuration the student chose, and re-calling was always a no-op anyway
  // (the API returns early while a project is already generating). QuizLibrary
  // reflects the backend status on its own.

  function resetQuiz() {
    setDraftAnswers({});
    setSubmittedAnswers({});
    setSavedMistakeCards({});
    setActiveQuestionIndex(0);
    setShowQuizSummary(false);
    setAttemptId(crypto.randomUUID());
    setCompletionSave(null);
  }

  function handleBackToQuizList() {
    setActiveQuizId(null);
  }

  async function handleCancelQuizGeneration() {
    if (
      isCancellingQuizGeneration ||
      (!isGeneratingQuizzes && project.status !== "generating_quizzes")
    ) {
      return;
    }

    setIsCancellingQuizGeneration(true);
    try {
      await onCancelQuizGeneration(project.id);
      setIsGeneratingQuizzes(false);
      setIsQuizConfigOpen(false);
      toast.success("Generarea quizului a fost anulată.");
    } catch (error) {
      toast.error(
        (error instanceof Error
          ? toFriendlyGenerationError(error.message)
          : null) ?? "Nu am putut anula generarea quizului.",
      );
    } finally {
      setIsCancellingQuizGeneration(false);
    }
  }

  const quizConfigModal = isQuizConfigOpen ? (
    <QuizConfigModal
      maxQuestions={maxQuizQuestions}
      isSubmitting={isGeneratingQuizzes}
      onCancel={() => setIsQuizConfigOpen(false)}
      onConfirm={async (config) => {
        setIsQuizConfigOpen(false);
        setIsGeneratingQuizzes(true);
        try {
          await onGenerateQuiz(project.id, config);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          toast.error(
            (error instanceof Error
              ? toFriendlyGenerationError(error.message)
              : null) ?? "Quizul nu a putut fi generat.",
          );
        } finally {
          setIsGeneratingQuizzes(false);
        }
      }}
    />
  ) : null;

  if (!activeQuiz) {
    return (
      <>
      {quizConfigModal}
      <QuizLibrary
        projectStatus={project.status}
        errorMessage={project.errorMessage}
        quizzes={quizData.catalog}
        isGenerating={isGeneratingQuizzes}
        isCancellingGeneration={isCancellingQuizGeneration}
        quizLimit={maxQuizzesPerProject}
        onCancelGeneration={handleCancelQuizGeneration}
        onOpenQuizConfig={() => {
          if (hasReachedQuizLimit) {
            toast.warning(
              `Ai atins limita de ${maxQuizzesPerProject} ${
                maxQuizzesPerProject === 1 ? "quiz" : "quizuri"
              } pentru acest proiect.`,
              "Treci la un plan superior ca să generezi mai multe.",
            );
            return;
          }
          setIsQuizConfigOpen(true);
        }}
        onStartQuiz={(quizId) => {
          setActiveQuizId(quizId);
          resetQuiz();
        }}
      />
      </>
    );
  }

  const activeQuestion = quizQuestions[activeQuestionIndex];
  const submittedAnswer = submittedAnswers[activeQuestion.id];
  const draftAnswer = draftAnswers[activeQuestion.id] ?? [];
  // Accuracy uses partial credit so a nearly-right cloze is not scored as a
  // total miss; "Corecte" still counts only fully correct questions.
  const earnedScore = quizQuestions.reduce(
    (total, question) =>
      total + quizAnswerScore(question, submittedAnswers[question.id]),
    0,
  );
  const scorePercent =
    answeredCount > 0 ? Math.round((earnedScore / answeredCount) * 100) : 0;
  const completionPercent = Math.round(
    (answeredCount / quizQuestions.length) * 100,
  );
  const isAnswered = submittedAnswer !== undefined;
  // Single choice commits on click; every other type needs a confirm step.
  const needsExplicitSubmit = activeQuestion.mode !== "single";
  const canSubmitDraftAnswer =
    activeQuestion.mode === "multiple"
      ? draftAnswer.length > 0
      : activeQuestion.mode === "matching"
        ? draftAnswer.length === activeQuestion.answers.length &&
          draftAnswer.every((value) => value >= 0)
        : activeQuestion.mode === "ordering"
          ? draftAnswer.length === activeQuestion.answers.length
          : activeQuestion.mode === "cloze"
            ? draftAnswer.length === activeQuestion.gapCount &&
              draftAnswer.every((value) => value >= 0)
            : false;
  const weakConcepts = getQuizWeakConcepts(quizQuestions, submittedAnswers);

  function toggleAnswer(answerIndex: number) {
    if (submittedAnswers[activeQuestion.id] !== undefined) {
      return;
    }

    if (activeQuestion.mode === "single") {
      const submittedAnswerIndexes = [answerIndex];
      setSubmittedAnswers((currentAnswers) => ({
        ...currentAnswers,
        [activeQuestion.id]: submittedAnswerIndexes,
      }));
      return;
    }

    setDraftAnswers((currentAnswers) => {
      const currentQuestionAnswers = currentAnswers[activeQuestion.id] ?? [];
      const nextQuestionAnswers = currentQuestionAnswers.includes(answerIndex)
        ? currentQuestionAnswers.filter((index) => index !== answerIndex)
        : [...currentQuestionAnswers, answerIndex];

      return {
        ...currentAnswers,
        [activeQuestion.id]: nextQuestionAnswers,
      };
    });
  }

  /**
   * Save the current question as a flashcard, on request.
   *
   * Only offered for a wrong single choice answer, so a question already
   * saved (or being saved) must not be sent twice.
   */
  function saveActiveQuestionAsFlashcard() {
    const questionId = activeQuestion.id;
    const state = savedMistakeCards[questionId];
    if (state === "saving" || state === "saved") return;

    setSavedMistakeCards((current) => ({ ...current, [questionId]: "saving" }));
    Promise.resolve(
      onQuizMistake(
        project.id,
        activeQuestion.sourceQuestionId ?? null,
        buildMistakeFlashcardFromQuestion(activeQuestion),
      ),
    )
      .then(() => {
        setSavedMistakeCards((current) => ({ ...current, [questionId]: "saved" }));
      })
      .catch(() => {
        setSavedMistakeCards((current) => ({ ...current, [questionId]: "error" }));
      });
  }

  function setDraftAnswerForActiveQuestion(answer: number[]) {
    if (submittedAnswers[activeQuestion.id] !== undefined) return;
    setDraftAnswers((currentAnswers) => ({
      ...currentAnswers,
      [activeQuestion.id]: answer,
    }));
  }

  function submitDraftAnswer() {
    if (submittedAnswers[activeQuestion.id] !== undefined) return;
    if (!canSubmitDraftAnswer) return;

    // Matching leaves gaps as -1 while the student is still assigning; the
    // submit guard above rejects those, so the answer is complete here.
    const submitted = [...draftAnswer];
    setSubmittedAnswers((currentAnswers) => ({
      ...currentAnswers,
      [activeQuestion.id]: submitted,
    }));
  }


  function goToQuestion(questionIndex: number) {
    setActiveQuestionIndex(questionIndex);
  }

  function goToNextQuestion() {
    setActiveQuestionIndex((currentIndex) =>
      Math.min(quizQuestions.length - 1, currentIndex + 1),
    );
  }

  const activeQuestionModeLabel =
    activeQuestion.mode === "multiple"
      ? "Alege toate răspunsurile corecte"
      : activeQuestion.mode === "matching"
        ? "Asociază fiecare element cu perechea lui"
        : activeQuestion.mode === "ordering"
          ? "Așază cuvintele în ordinea corectă"
          : activeQuestion.mode === "cloze"
            ? "Completează golurile din propoziție"
            : "Alege un singur răspuns";
  const activeQuestionResult = isAnswered
    ? isQuizAnswerCorrect(activeQuestion, submittedAnswer)
    : null;
  const canSaveMistakeFlashcard =
    activeQuestionResult === false && activeQuestion.mode === "single";
  const mistakeCardState = savedMistakeCards[activeQuestion.id];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleBackToQuizList}
          className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
        >
          <Icon>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </Icon>
          Înapoi la quiz-uri
        </button>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-md border border-subtle bg-surface px-3 py-1.5 text-xs font-bold text-content">
            {activeQuiz.duration}
          </span>
          <span
            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${getQuizComplexityClass(
              activeQuiz.complexity,
            )}`}
          >
            {activeQuiz.complexity}
          </span>
        </div>
      </div>

      <article className="theme-shadow-card overflow-hidden rounded-xl border border-subtle bg-surface">
        <header className="grid gap-6 border-b border-subtle p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-end">
          <div>
            <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Quiz activ
            </span>
            <h2 className="mt-4 max-w-4xl font-serif text-4xl font-semibold leading-none text-content sm:text-5xl">
              {activeQuiz.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {activeQuiz.description}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                  Progres
                </p>
                <p className="mt-1 font-serif text-4xl font-semibold text-content">
                  {completionPercent}%
                </p>
              </div>
              <p className="text-right text-xs font-bold leading-5 text-muted">
                {answeredCount}/{quizQuestions.length}
                <span className="block">răspunse</span>
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-app">
              <div
                className="h-full rounded-full bg-action transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        </header>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                  {/* One text node, so the "Întrebarea N din M" translation
                      pattern can match it. */}
                  {`Întrebarea ${activeQuestionIndex + 1} din ${quizQuestions.length}`}
                </span>
                <span className="inline-flex rounded-md border border-subtle bg-app px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                  {activeQuestionModeLabel}
                </span>
              </div>
              <span className="w-fit rounded-md border border-info-border bg-info-soft px-3 py-1.5 text-xs font-bold text-info">
                {activeQuestion.difficulty}
              </span>
            </div>

            {/* Question prompts run long, so they stay well below the
                display sizes used for page titles. A cloze prompt is the
                sentence itself, rendered with its gaps by the widget. */}
            {activeQuestion.mode === "cloze" ? null : (
              <h3 className="mt-6 max-w-4xl font-serif text-lg font-semibold leading-snug text-content sm:text-xl">
                {activeQuestion.question}
              </h3>
            )}

            {activeQuestion.mode === "matching" ? (
              <QuizMatchingAnswer
                questionId={activeQuestion.id}
                items={activeQuestion.answers}
                pairs={activeQuestion.pairs}
                draftAnswer={draftAnswer}
                submittedAnswer={submittedAnswer}
                onDraftChange={setDraftAnswerForActiveQuestion}
              />
            ) : activeQuestion.mode === "ordering" ? (
              <QuizOrderingAnswer
                questionId={activeQuestion.id}
                words={activeQuestion.answers}
                draftAnswer={draftAnswer}
                submittedAnswer={submittedAnswer}
                onDraftChange={setDraftAnswerForActiveQuestion}
              />
            ) : activeQuestion.mode === "cloze" ? (
              <QuizClozeAnswer
                questionId={activeQuestion.id}
                segments={activeQuestion.segments}
                words={activeQuestion.answers}
                gapCount={activeQuestion.gapCount}
                draftAnswer={draftAnswer}
                submittedAnswer={submittedAnswer}
                onDraftChange={setDraftAnswerForActiveQuestion}
              />
            ) : (
              <div className="mt-8 grid gap-3">
                {activeQuestion.answers.map((answer, answerIndex) => (
                  <QuizAnswerButton
                    key={answer}
                    answer={answer}
                    answerIndex={answerIndex}
                    correctIndexes={activeQuestion.correctIndexes}
                    submittedAnswer={submittedAnswer}
                    draftAnswer={draftAnswer}
                    onSelect={() => toggleAnswer(answerIndex)}
                  />
                ))}
              </div>
            )}

            {needsExplicitSubmit && !isAnswered ? (
              <button
                type="button"
                onClick={submitDraftAnswer}
                disabled={!canSubmitDraftAnswer}
                className="mt-5 inline-flex items-center justify-center rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Verifică răspunsul
              </button>
            ) : null}

            {isAnswered ? (
              <div
                className={`mt-7 border-t pt-5 ${
                  activeQuestionResult
                    ? "border-success-border text-success"
                    : "border-danger-border text-danger"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em]">
                  {activeQuestionResult ? "Corect" : "De revizuit"}
                </p>
                <h4 className="mt-2 max-w-3xl font-serif text-base font-semibold leading-snug text-content">
                  {activeQuestion.explanation}
                </h4>
                {activeQuestionResult === false ? (
                  <>
                    <p className="mt-3 max-w-3xl text-sm leading-7">
                      {activeQuestion.aiInsight}
                    </p>
                    {activeQuestion.review ? (
                      <QuizReviewReference
                        projectId={project.id}
                        review={activeQuestion.review}
                      />
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        Acest quiz nu are o trimitere verificabilă la rezumat.
                      </p>
                    )}
                  </>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-content">
                    Sursă: {activeQuestion.source}
                  </span>
                  <span className="rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-content">
                    Concept: {activeQuestion.concept}
                  </span>
                </div>

                {canSaveMistakeFlashcard ? (
                  <div className="mt-5 rounded-md border border-subtle bg-app p-4">
                    {mistakeCardState === "saved" ? (
                      <p className="text-xs font-bold leading-6 text-success">
                        Salvat în Flashcard-uri, pachetul Din quiz-urile tale.
                      </p>
                    ) : (
                      <>
                        <p className="text-xs leading-6 text-muted">
                          {mistakeCardState === "error"
                            ? "Nu am putut salva flashcard-ul. Încearcă din nou."
                            : "Vrei să reții întrebarea asta ca flashcard?"}
                        </p>
                        <button
                          type="button"
                          onClick={saveActiveQuestionAsFlashcard}
                          disabled={mistakeCardState === "saving"}
                          className="mt-3 inline-flex items-center justify-center rounded-md bg-action px-4 py-2 text-xs font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {mistakeCardState === "saving"
                            ? "Se salvează..."
                            : mistakeCardState === "error"
                              ? "Reîncearcă"
                              : "Salvează ca flashcard"}
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isComplete && completionSave?.attemptId === attemptId ? (
              <div className="mt-5 text-sm" role="status" aria-live="polite">
                {completionSave.status === "error" ? (
                  <div className="rounded-md border border-danger-border bg-danger-soft p-3 text-danger">
                    <p>Rezultatul nu a fost salvat în istoric. Reîncearcă înainte să ieși din quiz.</p>
                    <button
                      type="button"
                      className="mt-2 cursor-pointer font-bold underline underline-offset-4"
                      onClick={() => {
                        if (!attemptId) return;
                        completionSavesRef.current.delete(attemptId);
                        setCompletionRetry((value) => value + 1);
                      }}
                    >
                      Reîncearcă salvarea
                    </button>
                  </div>
                ) : completionSave.status === "saving" ? (
                  <p className="text-muted">Se salvează rezultatul în istoric...</p>
                ) : (
                  <Link
                    href={quizReviewHistoryHref(project.id, attemptId)}
                    className="font-semibold text-action underline underline-offset-4"
                  >
                    Vezi greșelile în Progres →
                  </Link>
                )}
              </div>
            ) : null}

            <div className="mt-7 flex flex-col gap-3 border-t border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => goToQuestion(Math.max(0, activeQuestionIndex - 1))}
                disabled={activeQuestionIndex === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-subtle px-5 py-3 text-sm font-bold text-content transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon>
                  <path d="M19 12H5M11 5l-7 7 7 7" />
                </Icon>
                Înapoi
              </button>

              {isComplete ? (
                <button
                  type="button"
                  onClick={() => setShowQuizSummary(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover"
                >
                  Vezi sumarul
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goToNextQuestion}
                  disabled={
                    !isAnswered || activeQuestionIndex === quizQuestions.length - 1
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Următoarea întrebare
                  <Icon>
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </Icon>
                </button>
              )}
            </div>
          </div>

          <aside className="border-t border-subtle bg-app/45 p-5 sm:p-6 xl:border-l xl:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
              Hartă quiz
            </p>
            <div className="mt-4 grid grid-cols-5 gap-2 xl:grid-cols-4">
              {quizQuestions.map((question, questionIndex) => {
                const selected = submittedAnswers[question.id];
                const isCorrect = isQuizAnswerCorrect(question, selected);
                const isCurrent = questionIndex === activeQuestionIndex;
                const isQuestionAnswered = selected !== undefined;

                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => goToQuestion(questionIndex)}
                    className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm font-bold transition ${
                      isCurrent
                        ? "border-action bg-action text-on-action"
                        : isQuestionAnswered && isCorrect
                          ? "border-success-border bg-success-soft text-success"
                          : isQuestionAnswered
                            ? "border-danger-border bg-danger-soft text-danger"
                            : "border-subtle bg-surface text-muted hover:bg-surface-hover"
                    }`}
                  >
                    {questionIndex + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 divide-y divide-subtle border-y border-subtle">
              <QuizSideStat label="Corecte" value={String(correctCount)} />
              <QuizSideStat label="Acuratețe" value={`${scorePercent}%`} />
              <QuizSideStat
                label="Concepte slabe"
                value={weakConcepts.length ? String(weakConcepts.length) : "0"}
              />
            </div>

            {activeQuiz.attempts.length ? (
              <div className="mt-6 border-t border-subtle pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  Istoric
                </p>
                <div className="mt-3 divide-y divide-subtle border-y border-subtle">
                  {activeQuiz.attempts.map((attempt, attemptIndex) => (
                    <Link
                      key={attempt.id}
                      href={quizReviewHistoryHref(project.id, attempt.id)}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs hover:text-action"
                      aria-label={`Vezi încercarea din ${formatQuizAttemptTimestamp(attempt.completedAt)} în Progres`}
                    >
                      <span className="font-bold text-muted">
                        #{activeQuiz.attempts.length - attemptIndex} ·{" "}
                        {formatQuizAttemptTimestamp(attempt.completedAt)}
                      </span>
                      <span className="shrink-0 font-bold text-content">
                        {attempt.scorePercent}% →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </article>

      {showQuizSummary ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quiz-summary-title"
        >
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl border border-subtle bg-surface p-6 theme-shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  Sumar final
                </p>
                <h3
                  id="quiz-summary-title"
                  className="mt-2 font-serif text-2xl font-semibold leading-tight"
                >
                  Ai obținut {correctCount}/{quizQuestions.length} răspunsuri
                  corecte.
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuizSummary(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-subtle text-muted transition hover:bg-surface-hover hover:text-content"
                aria-label="Închide sumarul"
              >
                <Icon className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </Icon>
              </button>
            </div>

            <p className="mt-3 text-sm leading-7 text-muted">
              {savedMistakeCount
                ? "Greșelile salvate te așteaptă în flashcard-uri."
                : "Poți salva ca flashcard întrebările greșite cu răspuns unic."}
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <QuizResultCard label="Scor quiz" value={`${scorePercent}%`} />
              <QuizResultCard
                label="Flashcard-uri salvate"
                value={String(savedMistakeCount)}
              />
              <QuizResultCard label="Concepte de revizuit" value={String(weakConcepts.length)} />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={resetQuiz}
                className="rounded-md border border-subtle px-5 py-3 text-sm font-bold text-content transition hover:bg-surface-hover"
              >
                Reia quiz-ul
              </button>
              <button
                type="button"
                onClick={handleBackToQuizList}
                className="rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover"
              >
                Înapoi la quiz-uri
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QuizLibrary({
  projectStatus,
  errorMessage,
  quizzes,
  isGenerating,
  isCancellingGeneration,
  quizLimit,
  onCancelGeneration,
  onOpenQuizConfig,
  onStartQuiz,
}: {
  projectStatus: StudyProject["status"];
  errorMessage: string | null;
  quizzes: AccountQuiz[];
  isGenerating: boolean;
  isCancellingGeneration: boolean;
  /** How many quizzes this project may hold, from the account's plan. */
  quizLimit: number;
  onCancelGeneration: () => void;
  onOpenQuizConfig: () => void;
  onStartQuiz: (quizId: string) => void;
}) {
  const { language } = useLanguage();
  const loadingCopy = quizGenerationLoadingCopy[language];
  const isButtonBusy = isGenerating || projectStatus === "generating_quizzes";
  const newQuizLabel = { ro: "Quiz nou", en: "New quiz", fr: "Nouveau quiz" }[language];

  if (!quizzes.length) {

    return (
      <section className="grid gap-6 rounded-xl border border-subtle bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            Quiz-uri
          </p>
          <h2 className="mt-4 max-w-2xl font-serif text-3xl font-semibold leading-tight">
            Generează testele când vrei.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
            Alegi dificultatea, câte întrebări vrei și ce tipuri de răspuns, iar
            noi generăm un quiz pe măsură. Planul tău permite{" "}
            {quizLimit} {quizLimit === 1 ? "quiz" : "quizuri"} în acest proiect.
          </p>
          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onOpenQuizConfig}
            disabled={isButtonBusy}
            className="inline-flex min-w-56 cursor-pointer items-center justify-center gap-2 rounded-md bg-action px-6 py-4 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:bg-subtle disabled:text-muted"
          >
            <span data-no-auto-translate>
              {isButtonBusy ? loadingCopy.buttonBusy : loadingCopy.buttonIdle}
            </span>
            {isButtonBusy ? (
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-content"
              />
            ) : (
              <Icon>
                <path d="M5 12h14M13 5l7 7-7 7" />
              </Icon>
            )}
          </button>
          {isButtonBusy ? (
            <button
              type="button"
              onClick={onCancelGeneration}
              disabled={isCancellingGeneration}
              className="inline-flex min-w-56 cursor-pointer items-center justify-center gap-2 rounded-md border border-danger-border bg-danger-soft px-6 py-3 text-sm font-black text-danger transition hover:opacity-85 disabled:cursor-wait disabled:opacity-60"
            >
              {isCancellingGeneration
                ? "Se anulează..."
                : "Anulare generare quiz"}
              <Icon>
                <path d="M18 6 6 18M6 6l12 12" />
              </Icon>
            </button>
          ) : null}
        </div>

        {isButtonBusy ? (
          <div className="border-t border-subtle pt-5 lg:col-span-2">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                <span
                  aria-hidden="true"
                  className="h-8 w-8 animate-spin rounded-full border-2 border-info-border border-t-info"
                />
              </div>
              <div className="min-w-0">
                <p className="font-serif text-2xl font-semibold leading-tight text-content">
                  {loadingCopy.title}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  {loadingCopy.description}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {loadingCopy.steps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-3 text-sm font-semibold text-content/80"
                >
                  <span
                    className="h-2.5 w-2.5 animate-pulse rounded-full bg-info"
                    style={{ animationDelay: `${index * 140}ms` }}
                  />
                  {step}
                </div>
              ))}
            </div>

            <div className="mt-5 max-w-3xl space-y-2">
              <div className="h-3 animate-pulse rounded-full bg-info-soft" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-info-soft [animation-delay:120ms]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-info-soft [animation-delay:240ms]" />
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  const completedCount = quizzes.filter((quiz) => quiz.completedAt).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-5 border-b border-subtle pb-5">
        <div>
          <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            Quiz-uri
          </span>
          <h2 className="mt-4 font-serif text-3xl font-semibold leading-tight text-content sm:text-4xl">
            Alege testul potrivit.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Recapitulare, aplicare și simulare de examen, separate ca să știi
            exact ce exersezi.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted">
            <span>
              {completedCount}/{quizzes.length} completate
            </span>
            <span>
              {quizzes.length}/{quizLimit} generate
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenQuizConfig}
              disabled={isButtonBusy}
              className="inline-flex min-h-10 min-w-40 cursor-pointer items-center justify-center gap-2 rounded-md bg-action px-4 py-2 text-xs font-black text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:bg-subtle disabled:text-muted"
            >
              <span data-no-auto-translate>
                {isButtonBusy ? loadingCopy.buttonBusy : newQuizLabel}
              </span>
              {isButtonBusy ? (
                <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
              ) : <Icon className="h-3.5 w-3.5">
                <path d="M12 5v14M5 12h14" />
              </Icon>}
            </button>
            {isButtonBusy ? (
              <button
                type="button"
                onClick={onCancelGeneration}
                disabled={isCancellingGeneration}
                className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-danger-border px-4 py-2 text-xs font-black text-danger transition hover:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
              >
                {isCancellingGeneration
                  ? "Se anulează..."
                  : "Anulare generare quiz"}
                <Icon className="h-3.5 w-3.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </Icon>
              </button>
            ) : null}
          </div>
        </div>
        {isButtonBusy ? (
          <div role="status" aria-live="polite" className="space-y-3 border-t border-subtle pt-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-muted">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-info-border border-t-info motion-reduce:animate-none" />
              <span data-no-auto-translate>{loadingCopy.title}</span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-info-soft">
              <div className="h-full w-full animate-pulse rounded-full bg-info motion-reduce:animate-none" />
            </div>
          </div>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="text-sm font-semibold text-danger">{errorMessage}</p>
        ) : null}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {quizzes.map((quiz) => (
          <QuizCatalogCard key={quiz.id} quiz={quiz} onStartQuiz={onStartQuiz} />
        ))}
      </div>
    </section>
  );
}

function QuizCatalogCard({
  quiz,
  onStartQuiz,
}: {
  quiz: AccountQuiz;
  onStartQuiz: (quizId: string) => void;
}) {
  const isCompleted = Boolean(quiz.completedAt);
  const resultLabel =
    isCompleted && quiz.scorePercent !== null
      ? `${quiz.scorePercent}%`
      : "Neîncercat";
  const lastAttemptLabel = isCompleted
    ? `Ultima rulare: ${formatQuizAttemptTimestamp(quiz.completedAt ?? "")}`
    : quiz.focus;

  return (
    <article
      className={`theme-shadow-card flex h-full flex-col rounded-xl border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-content/25 ${
        quiz.recommended ? "border-action" : "border-subtle"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex w-fit rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${getQuizComplexityClass(
            quiz.complexity,
          )}`}
        >
          {quiz.complexity}
        </span>
      </div>

      <h3 className="mt-5 font-serif text-2xl font-semibold leading-tight text-content">
        {quiz.title}
      </h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-muted">
        {quiz.description}
      </p>

      <div className="mt-5 divide-y divide-subtle border-y border-subtle">
        <QuizCardStat label="Întrebări" value={String(quiz.questionIds.length)} />
        <QuizCardStat label="Durată" value={quiz.duration} />
        <QuizCardStat
          label="Rezultat"
          value={resultLabel}
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-bold leading-5 text-muted">
          {lastAttemptLabel}
        </p>
        <button
          type="button"
          onClick={() => onStartQuiz(quiz.id)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover"
        >
          {isCompleted ? "Reintră" : "Începe"}
          <Icon>
            <path d="M5 12h14M13 5l7 7-7 7" />
          </Icon>
        </button>
      </div>
    </article>
  );
}

function QuizCardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="text-right text-sm font-bold text-content">{value}</p>
    </div>
  );
}

function QuizAnswerButton({
  answer,
  answerIndex,
  correctIndexes,
  submittedAnswer,
  draftAnswer,
  onSelect,
}: {
  answer: string;
  answerIndex: number;
  correctIndexes: number[];
  submittedAnswer?: number[];
  draftAnswer: number[];
  onSelect: () => void;
}) {
  const isAnswered = submittedAnswer !== undefined;
  const isCorrect = correctIndexes.includes(answerIndex);
  const isSelected = submittedAnswer?.includes(answerIndex) ?? false;
  const isDraftSelected = draftAnswer.includes(answerIndex);
  const stateClass = !isAnswered
    ? isDraftSelected
      ? "border-action bg-action-soft text-content"
      : "border-subtle bg-surface text-content hover:border-action/45 hover:bg-surface-hover"
    : isCorrect
      ? "border-success-border bg-success-soft text-success"
      : isSelected
        ? "border-danger-border bg-danger-soft text-danger"
        : "border-subtle bg-surface text-muted opacity-60";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isAnswered}
      className={`group grid cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)_1.5rem] items-center gap-4 rounded-md border px-4 py-4 text-left text-sm font-bold transition disabled:cursor-default ${stateClass}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-current/20 bg-app font-serif text-lg font-semibold">
        {String.fromCharCode(65 + answerIndex)}
      </span>
      <span className="leading-6">
        {answer}
      </span>
      {isAnswered && isCorrect ? (
        <Icon className="h-5 w-5 justify-self-end">
          <path d="m5 12 4 4L19 6" />
        </Icon>
      ) : null}
      {isAnswered && isSelected && !isCorrect ? (
        <Icon className="h-5 w-5 justify-self-end">
          <path d="M18 6 6 18M6 6l12 12" />
        </Icon>
      ) : null}
    </button>
  );
}

function QuizSideStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs font-bold text-muted">{label}</span>
      <span className="font-serif text-xl font-semibold">{value}</span>
    </div>
  );
}

function QuizResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-success-border bg-surface p-4">
      <p className="font-serif text-2xl font-semibold text-content">{value}</p>
      <p className="mt-1 text-xs font-bold">{label}</p>
    </div>
  );
}

function StrategiesPanel({ project }: { project: StudyProject }) {
  const strategies = project.strategies;
  const universalStrategies = [
    [
      "Închide cursul și încearcă să răspunzi",
      "După fiecare secțiune, spune pe scurt ideea principală fără să te uiți în material.",
    ],
    [
      "Revino mâine peste ideile importante",
      "O recapitulare scurtă după o zi te ajută să fixezi conceptele care altfel se uită repede.",
    ],
    [
      "Explică simplu, cu exemple",
      "Dacă poți lega teoria de un exemplu concret, ai șanse mult mai mari să o reții la examen.",
    ],
  ];
  const readyFlashcards = getGeneratedFlashcards(project.flashcards).length;
  const stats = [
    ["Strategii AI", String(strategies.length)],
    ["Quiz-uri", String(project.quizzes.length)],
    ["Flashcard-uri", String(readyFlashcards)],
  ];

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="theme-shadow-card rounded-xl border border-subtle bg-surface">
          <div className="border-b border-subtle p-5 sm:p-6">
            <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Strategii AI
            </span>
            <h2 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight text-content sm:text-4xl">
              Plan de studiu pentru {project.subjectName}.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Pașii sunt generați din materialul proiectului și sunt gândiți
              pentru recapitulare activă, nu pentru citire pasivă.
            </p>
          </div>

          <div className="divide-y divide-subtle">
            {strategies.map((strategy, index) => (
              <StrategyPlanRow
                key={strategy.title}
                index={index}
                title={strategy.title}
                description={strategy.description}
              />
            ))}
          </div>
        </article>

        <aside className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
            Context
          </p>
          <div className="mt-4 divide-y divide-subtle border-y border-subtle">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="text-sm font-semibold text-muted">{label}</span>
                <span className="font-serif text-2xl font-semibold text-content">
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-subtle pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
              Ritm recomandat
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-content">
              20-30 min pe sesiune, apoi verificare rapidă în quiz-uri.
            </p>
          </div>
        </aside>
      </div>

      <section className="rounded-xl border border-subtle bg-surface">
        <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="border-b border-subtle p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <span className="inline-flex rounded-md border border-subtle bg-app px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Bază
            </span>
            <h3 className="mt-4 font-serif text-2xl font-semibold leading-tight text-content">
              Bune de folosit la orice curs.
            </h3>
          </div>
          <div className="divide-y divide-subtle">
            {universalStrategies.map(([title, description], index) => (
              <StrategyPlanRow
                key={title}
                index={index}
                title={title}
                description={description}
                muted
              />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

function StrategyPlanRow({
  index,
  title,
  description,
  muted = false,
}: {
  index: number;
  title: string;
  description: string;
  muted?: boolean;
}) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:p-6">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-black ${
          muted
            ? "border-subtle bg-app text-muted"
            : "border-success-border bg-success-soft text-success"
        }`}
      >
        {muted ? (
          index + 1
        ) : (
          <Icon className="h-4 w-4">
            <circle cx="12" cy="12" r="10" />
            <path d="m16.2 7.8-2 6.4-6.4 2 2-6.4z" />
          </Icon>
        )}
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-serif text-2xl font-semibold leading-tight text-content">
            {title}
          </h3>
          {!muted ? (
            <span className="rounded-md border border-subtle bg-app px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted">
              pas {index + 1}
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

type ProgressAttempt = {
  quizTitle: string;
  scorePercent: number;
  completedAt: string;
};

type ProgressQuizScore = {
  title: string;
  scorePercent: number | null;
  completed: boolean;
};

type CompletedProgressQuizScore = ProgressQuizScore & {
  scorePercent: number;
};

type ProgressCompetencyScore = {
  label: string;
  value: number;
};

type ProgressActivityDay = {
  key: string;
  label: string;
  count: number;
  level: number;
  /** Today's cell, highlighted so the grid can be read against the calendar. */
  isLatest: boolean;
  /** Later this week: no activity yet, rather than a day without activity. */
  isFuture: boolean;
};

type ProgressFlashcardSegment = {
  label: string;
  detail: string;
  value: number;
  color: string;
};

function isCompletedProgressQuizScore(
  quiz: ProgressQuizScore,
): quiz is CompletedProgressQuizScore {
  return quiz.completed && typeof quiz.scorePercent === "number";
}

function clampProgressPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatProgressPercent(value: number | null) {
  return typeof value === "number" ? `${value}%` : "-";
}

function formatSignedPercent(value: number) {
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return "0%";
}

function startOfLocalDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function addLocalDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatProgressDayLabel(date: Date) {
  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
  });
}

function buildProgressActivityDays(
  attempts: ProgressAttempt[],
): ProgressActivityDay[] {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    const date = startOfLocalDay(new Date(attempt.completedAt));
    counts.set(toLocalDateKey(date), (counts.get(toLocalDateKey(date)) ?? 0) + 1);
  }

  // Four calendar weeks ending with the current one, starting on a Monday, so
  // the L..D column headers describe the cells underneath them.
  const today = startOfLocalDay(new Date());
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const gridStart = addLocalDays(today, -daysSinceMonday - 21);
  const todayKey = toLocalDateKey(today);
  const maxCount = Math.max(1, ...counts.values());

  return Array.from({ length: 28 }, (_, index) => {
    const date = addLocalDays(gridStart, index);
    const key = toLocalDateKey(date);
    const count = counts.get(key) ?? 0;
    const level =
      count === 0
        ? 0
        : count >= maxCount
          ? 3
          : count >= Math.ceil(maxCount / 2)
            ? 2
            : 1;

    return {
      key,
      label: formatProgressDayLabel(date),
      count,
      level,
      isLatest: key === todayKey,
      isFuture: date.getTime() > today.getTime(),
    };
  });
}

function buildProgressCompetencyScores(
  quizScores: ProgressQuizScore[],
  weakConcepts: Array<[string, number]>,
): ProgressCompetencyScore[] {
  const completedScores = quizScores
    .filter(isCompletedProgressQuizScore)
    .map((quiz) => ({
      label: quiz.title,
      value: clampProgressPercent(quiz.scorePercent),
    }));
  const usedLabels = new Set(
    completedScores.map((score) => score.label.toLocaleLowerCase("ro-RO")),
  );
  const inferredWeakScores = weakConcepts
    .filter(([concept]) => !usedLabels.has(concept.toLocaleLowerCase("ro-RO")))
    .map(([concept, count]) => ({
      label: concept,
      value: clampProgressPercent(78 - count * 9),
    }));

  return [...completedScores, ...inferredWeakScores].slice(0, 6);
}

type QuizReviewHistoryEntry = {
  quiz: StudyProject["quizzes"][number];
  attempt: StudyProject["quizzes"][number]["attempts"][number];
};

type ProgressReviewItem = {
  question: StudyProject["quizzes"][number]["questions"][number];
  quizTitle: string;
  attemptId: string;
  completedAt: string;
  review: QuizReviewLocation | null;
};

type ProgressReviewGroup = {
  key: string;
  concept: string;
  items: ProgressReviewItem[];
};

function quizReviewHistoryHref(projectId: string, attemptId?: string | null) {
  const params = new URLSearchParams({ project: projectId });
  if (attemptId) params.set("attempt", attemptId);
  return `/myaccount/progres?${params.toString()}#de-revizuit`;
}

function getQuizReviewHistory(quizzes: StudyProject["quizzes"]): QuizReviewHistoryEntry[] {
  return quizzes
    .flatMap((quiz) => quiz.attempts.map((attempt) => ({ quiz, attempt })))
    .sort((a, b) => new Date(b.attempt.completed_at).getTime() - new Date(a.attempt.completed_at).getTime());
}

function buildQuizReviewHistoryData(
  project: StudyProject,
  selectedAttemptId: string | null = null,
) {
  const history = getQuizReviewHistory(project.quizzes);
  const latestByQuiz = new Map<string, QuizReviewHistoryEntry>();
  for (const entry of history) {
    if (!latestByQuiz.has(entry.quiz.id)) latestByQuiz.set(entry.quiz.id, entry);
  }
  const selected = selectedAttemptId
    ? history.filter(({ attempt }) => attempt.id === selectedAttemptId)
    : [...latestByQuiz.values()];
  const paragraphs = splitSummaryParagraphs(project.summary?.content ?? "");
  const groups = new Map<string, ProgressReviewGroup>();
  let unavailableCount = 0;
  let detailedCount = 0;
  for (const { quiz, attempt } of selected) {
    if (attempt.question_results == null) {
      unavailableCount += 1;
      continue;
    }
    detailedCount += 1;
    for (const result of attempt.question_results) {
      if (result.is_correct) continue;
      const question = quiz.questions.find((item) => item.id === result.question_id);
      if (!question) {
        unavailableCount += 1;
        continue;
      }
      const review = getQuizReviewLocation(question, paragraphs);
      const concept = question.concept?.trim() || question.review_section?.trim() || quiz.title;
      const key = `${concept.toLocaleLowerCase("ro-RO")}:${review?.paragraphIndex ?? "none"}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, concept, items: [] };
        groups.set(key, group);
      }
      group.items.push({
        question, quizTitle: quiz.title, attemptId: attempt.id,
        completedAt: attempt.completed_at, review,
      });
    }
  }
  return {
    history,
    groups: [...groups.values()],
    unavailableCount,
    detailedCount,
    missingAttempt: Boolean(selectedAttemptId && !selected.length),
    selectedEntry: selectedAttemptId ? selected[0] ?? null : null,
  };
}

function ProgressQuizReviewPanel({ project }: { project: StudyProject }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedAttemptId = searchParams.get("attempt");
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.location.hash !== "#de-revizuit") return;
    const frame = window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      sectionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [project.id]);
  const data = useMemo(
    () => buildQuizReviewHistoryData(project, selectedAttemptId),
    [project, selectedAttemptId],
  );

  return (
    <section ref={sectionRef} id="de-revizuit" tabIndex={-1} className="scroll-mt-24 rounded-xl border border-subtle bg-surface p-5 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-content">De revizuit</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {data.selectedEntry
              ? `Greșelile din „${data.selectedEntry.quiz.title}”, ${formatQuizAttemptTimestamp(data.selectedEntry.attempt.completed_at)}.`
              : "Greșelile din ultima încercare a fiecărui quiz, grupate pe concepte."}
          </p>
        </div>
        <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold text-content lg:max-w-sm">
          Afișează
          <select
            value={data.missingAttempt ? "missing" : selectedAttemptId ?? ""}
            onChange={(event) => router.replace(
              quizReviewHistoryHref(project.id, event.target.value), { scroll: false },
            )}
            className="w-full rounded-md border border-subtle bg-app px-3 py-2 text-sm text-content"
          >
            <option value="">Ultimele încercări</option>
            {data.missingAttempt ? <option value="missing" disabled>Încercare indisponibilă</option> : null}
            {data.history.map(({ quiz, attempt }) => (
              <option key={attempt.id} value={attempt.id}>
                {quiz.title} · {formatQuizAttemptTimestamp(attempt.completed_at)} · {attempt.score_percent}%
              </option>
            ))}
          </select>
        </label>
      </div>

      {data.selectedEntry ? (
        <p className="mt-4 text-sm font-semibold text-content">
          Scor: {data.selectedEntry.attempt.score_percent}% · {data.selectedEntry.attempt.correct_count}/{data.selectedEntry.attempt.answered_count} răspunsuri corecte
        </p>
      ) : null}
      {data.missingAttempt ? (
        <p className="mt-5 text-sm text-muted">Încercarea nu mai este disponibilă pentru acest proiect. Alege „Ultimele încercări”.</p>
      ) : data.unavailableCount > 0 ? (
        <p className="mt-5 rounded-md border border-subtle bg-app p-3 text-sm leading-6 text-muted">
          Unele încercări au doar scorul salvat, fără detaliile întrebărilor greșite. Reia acele quizuri pentru a le include în „De revizuit”.
        </p>
      ) : null}
      {!data.groups.length && !data.missingAttempt ? (
        <p className="mt-5 text-sm leading-6 text-muted">
          {data.detailedCount > 0
            ? "Nu există răspunsuri greșite în încercările cu detalii afișate."
            : data.history.length
              ? "Recomandările vor apărea aici după o nouă încercare."
              : "Finalizează un quiz pentru a vedea aici conceptele de reluat."}
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        {data.groups.map((group) => (
          <details key={group.key} className="rounded-lg border border-subtle bg-app/40 p-4">
            <summary className="cursor-pointer font-semibold text-content">
              {group.concept}
              <span className="ml-2 text-xs font-normal text-muted">
                {group.items.length} {group.items.length === 1 ? "întrebare" : "întrebări"}
              </span>
            </summary>
            <div className="mt-4 space-y-5">
              {group.items.map((item) => (
                <div key={`${item.attemptId}:${item.question.id}`} className="border-t border-subtle pt-4">
                  <p className="text-xs text-muted">
                    {item.quizTitle} · {formatQuizAttemptTimestamp(item.completedAt)}
                  </p>
                  <h3 className="mt-2 font-semibold text-content">{item.question.prompt}</h3>
                  {item.question.explanation ? (
                    <p className="mt-2 text-sm leading-6 text-muted">{item.question.explanation}</p>
                  ) : null}
                  {item.question.review_advice ? (
                    <p className="mt-3 text-sm leading-6 text-content">{item.question.review_advice}</p>
                  ) : null}
                  {item.review ? (
                    <QuizReviewReference projectId={project.id} review={item.review} />
                  ) : (
                    <p className="mt-3 text-xs text-muted">Această întrebare nu are o trimitere verificabilă la rezumat.</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function buildProgressWeakConcepts(project: StudyProject): Array<[string, number]> {
  const reviewData = buildQuizReviewHistoryData(project);
  const weakConceptCounts = new Map<string, number>();
  for (const group of reviewData.groups) {
    weakConceptCounts.set(
      group.concept, (weakConceptCounts.get(group.concept) ?? 0) + group.items.length,
    );
  }
  // Keep the old flashcard-based signal only where no detailed attempt exists.
  const detailedQuestionIds = new Set<string>();
  const seenQuizIds = new Set<string>();
  for (const { quiz, attempt } of reviewData.history) {
    if (seenQuizIds.has(quiz.id)) continue;
    seenQuizIds.add(quiz.id);
    if (attempt.question_results != null) {
      quiz.questions.forEach((question) => detailedQuestionIds.add(question.id));
    }
  }
  for (const mistake of project.quizMistakeFlashcards) {
    if (mistake.sourceQuestionId && detailedQuestionIds.has(mistake.sourceQuestionId)) continue;
    const key = mistake.topic || "General";
    weakConceptCounts.set(key, (weakConceptCounts.get(key) ?? 0) + 1);
  }
  return Array.from(weakConceptCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  );
}

function buildProjectProgressData(project: StudyProject) {
  const quizzes = project.quizzes;
  const totalQuizzes = quizzes.length;
  const completedQuizzes = quizzes.filter((quiz) => quiz.completed_at);
  const completedCount = completedQuizzes.length;
  const completedQuizScores = completedQuizzes
    .map((quiz) => quiz.score_percent)
    .filter((score): score is number => typeof score === "number");
  const averageScore = completedQuizScores.length
    ? Math.round(
        completedQuizScores.reduce((sum, score) => sum + score, 0) /
          completedQuizScores.length,
      )
    : null;

  const allAttempts: ProgressAttempt[] = quizzes
    .flatMap((quiz) =>
      quiz.attempts.map((attempt) => ({
        quizTitle: quiz.title,
        scorePercent: attempt.score_percent,
        completedAt: attempt.completed_at,
      })),
    )
    .sort(
      (a, b) =>
        new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    );
  const allAttemptScores = allAttempts.map((attempt) => attempt.scorePercent);
  const averageAttemptScore = allAttemptScores.length
    ? Math.round(
        allAttemptScores.reduce((sum, score) => sum + score, 0) /
          allAttemptScores.length,
      )
    : averageScore;
  const maxScore = allAttemptScores.length
    ? Math.max(...allAttemptScores)
    : completedQuizScores.length
      ? Math.max(...completedQuizScores)
      : null;
  const trendDelta =
    allAttempts.length > 1
      ? allAttempts[allAttempts.length - 1].scorePercent -
        allAttempts[0].scorePercent
      : 0;

  const weakConcepts = buildProgressWeakConcepts(project);

  const quizScores: ProgressQuizScore[] = quizzes
    .map((quiz) => ({
      title: quiz.title,
      scorePercent: quiz.score_percent,
      completed: Boolean(quiz.completed_at),
    }))
    .sort((a, b) => {
      if (a.completed !== b.completed) {
        return Number(b.completed) - Number(a.completed);
      }

      return (b.scorePercent ?? -1) - (a.scorePercent ?? -1);
    });
  const generatedFlashcardsCount = getGeneratedFlashcards(
    project.flashcards,
  ).length;

  return {
    totalQuizzes,
    completedCount,
    averageScore,
    averageAttemptScore,
    maxScore,
    trendDelta,
    totalAttempts: allAttempts.length,
    recentAttempts: allAttempts.slice(-8),
    weakConcepts,
    quizScores,
    competencyScores: buildProgressCompetencyScores(quizScores, weakConcepts),
    activityDays: buildProgressActivityDays(allAttempts),
    totalFlashcards: project.flashcards.length,
    generatedFlashcardsCount,
    manualFlashcardsCount: project.manualFlashcards.length,
    quizMistakeFlashcardsCount: project.quizMistakeFlashcards.length,
    keywordsCount: project.keywords.length,
    highlightsCount: project.summaryHighlights.length,
  };
}

function ProgressPanel({ project }: { project: StudyProject }) {
  const data = useMemo(() => buildProjectProgressData(project), [project]);
  const completionPercent = data.totalQuizzes
    ? Math.round((data.completedCount / data.totalQuizzes) * 100)
    : 0;
  const readinessScore =
    data.averageScore !== null
      ? Math.round(data.averageScore * 0.72 + completionPercent * 0.28)
      : completionPercent;
  const latestAttempt = data.recentAttempts.length
    ? data.recentAttempts[data.recentAttempts.length - 1]
    : null;
  const nextQuiz = data.quizScores.find((quiz) => !quiz.completed);
  const focusText = data.weakConcepts.length
    ? data.weakConcepts
        .slice(0, 2)
        .map(([concept]) => concept)
        .join(" și ")
    : "nu există încă zone slabe clare";
  const trendLabel = data.totalAttempts
    ? data.totalAttempts > 1
      ? `${formatSignedPercent(data.trendDelta)} de la prima încercare`
      : "Primul reper salvat"
    : "Fără încercări încă";
  const flashcardSegments: ProgressFlashcardSegment[] = [
    {
      label: "Generate",
      detail: "din material",
      value: data.generatedFlashcardsCount,
      color: "var(--theme-action)",
    },
    {
      label: "Manuale",
      detail: "adăugate de tine",
      value: data.manualFlashcardsCount,
      color: "var(--theme-warning-text)",
    },
    {
      label: "Din greșeli",
      detail: "salvate la quiz",
      value: data.quizMistakeFlashcardsCount,
      color: "var(--theme-danger-text)",
    },
  ];
  const summaryStats = [
    ["Flashcard-uri generate", String(data.generatedFlashcardsCount)],
    ["Concepte cheie", String(data.keywordsCount)],
    ["Flashcard-uri manuale", String(data.manualFlashcardsCount)],
    ["Highlight-uri în rezumat", String(data.highlightsCount)],
    ["Flashcard-uri din greșeli", String(data.quizMistakeFlashcardsCount)],
    ["Încercări la quiz-uri", String(data.totalAttempts)],
  ] as const;

  return (
    <div className="space-y-5">
      <section className="theme-shadow-card overflow-hidden rounded-xl border border-subtle bg-surface">
        <div className="grid gap-7 border-b border-subtle p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                Progres general
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  data.trendDelta >= 0
                    ? "border-success-border bg-success-soft text-success"
                    : "border-danger-border bg-danger-soft text-danger"
                }`}
              >
                <Icon className="h-3.5 w-3.5">
                  <path d="M13 7h8v8" />
                  <path d="m21 7-8 8-4-4-6 6" />
                </Icon>
                {trendLabel}
              </span>
            </div>

            <div>
              <h2 className="max-w-3xl font-serif text-4xl font-semibold leading-none text-content sm:text-5xl">
                {data.totalQuizzes
                  ? `Scor de pregătire ${readinessScore}%.`
                  : "Încă nu ai date de progres."}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                {data.totalQuizzes
                  ? `Estimarea combină scorurile, quiz-urile finalizate și ritmul încercărilor. Focus recomandat: ${focusText}.`
                  : "Generează sau rezolvă cel puțin un quiz ca să apară scorul, zonele slabe și evoluția."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-subtle pt-5 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
            <ProgressHeroMetric
              label="Scor mediu quiz-uri"
              value={formatProgressPercent(data.averageScore)}
            />
            <ProgressHeroMetric
              label="Quiz-uri finalizate"
              value={`${data.completedCount}/${data.totalQuizzes}`}
            />
            <ProgressHeroMetric
              label="Ultimul scor obținut"
              value={latestAttempt ? `${latestAttempt.scorePercent}%` : "-"}
            />
            <ProgressHeroMetric
              label="Greșeli salvate"
              value={String(data.quizMistakeFlashcardsCount)}
            />
          </div>
        </div>

        <div className="grid divide-y divide-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
          <ProgressHeroStrip
            label="Material activ"
            value={project.subjectName || project.name}
            detail={`${data.totalFlashcards} flashcard-uri și ${data.keywordsCount} concepte cheie`}
          />
          <ProgressHeroStrip
            label="Atenție azi"
            value={data.weakConcepts.length ? `${data.weakConcepts.length} concepte` : "Stabil"}
            detail={
              data.weakConcepts.length
                ? "Repetă cardurile salvate din răspunsuri greșite."
                : "Nu există greșeli recurente înregistrate."
            }
            href={getTabHref("flashcards", project.id)}
            actionLabel="Recapitulează"
          />
          <ProgressHeroStrip
            label="Următorul pas"
            value={nextQuiz?.title ?? (data.totalQuizzes ? "Repetă quiz-uri" : "Generează quiz")}
            detail="O sesiune scurtă îți actualizează scorul și harta de progres."
            href={getTabHref("quiz", project.id)}
            actionLabel="Începe"
          />
        </div>
      </section>

      <Suspense fallback={<p className="text-sm text-muted">Se încarcă recomandările...</p>}>
        <ProgressQuizReviewPanel project={project} />
      </Suspense>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
          <ProgressSectionHeader
            eyebrow="Evoluția în timp"
            title="Performanță și consecvență"
            meta={`${data.recentAttempts.length} înregistrări`}
          />

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-subtle bg-app px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs font-bold text-content">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-action" />
              <span>
                {data.totalAttempts > 1
                  ? data.trendDelta >= 0
                    ? "Tendință ascendentă pe ultimele încercări"
                    : "Tendință de stabilizat pe următoarele quiz-uri"
                  : "Primul reper va construi graficul de evoluție"}
              </span>
            </div>
            <span
              className={`w-fit rounded-md border px-2 py-1 text-xs font-black ${
                data.trendDelta >= 0
                  ? "border-success-border bg-success-soft text-success"
                  : "border-danger-border bg-danger-soft text-danger"
              }`}
            >
              {trendLabel}
            </span>
          </div>

          {data.recentAttempts.length ? (
            <ProgressScoreTrendChart attempts={data.recentAttempts} />
          ) : (
            <ProgressEmptyState
              title="Graficul apare după primul quiz."
              description="Primele încercări vor crea linia de evoluție și comparația dintre scoruri."
            />
          )}

          <div className="mt-5 grid divide-y divide-subtle border-t border-subtle pt-3 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <ProgressChartStat
              label="Media curentă"
              value={formatProgressPercent(data.averageAttemptScore)}
            />
            <ProgressChartStat
              label="Punct maxim"
              value={formatProgressPercent(data.maxScore)}
            />
            <ProgressChartStat
              label="Creștere totală"
              value={data.totalAttempts > 1 ? formatSignedPercent(data.trendDelta) : "0%"}
            />
          </div>
        </section>

        <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
          <ProgressSectionHeader
            eyebrow="Matrice de competențe"
            title="Stăpânirea pe subiecte"
            meta="din quiz-uri"
          />
          <ProgressRadarChart scores={data.competencyScores} />
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-subtle bg-app px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span className="font-bold text-muted">Punct de urmărit:</span>
            <span className="font-black text-content">
              {data.weakConcepts[0]
                ? `${data.weakConcepts[0][0]} (${data.weakConcepts[0][1]} greșeli)`
                : "niciun concept critic încă"}
            </span>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
          <ProgressSectionHeader
            eyebrow="Detaliu pe module"
            title="Scor per quiz parcurs"
            meta="Top 6"
          />
          <ProgressTopicBars quizScores={data.quizScores} />
        </section>

        <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
          <ProgressSectionHeader
            eyebrow="Distribuție flashcard-uri"
            title="Retenție și memorie"
            meta={`${data.totalFlashcards} total`}
          />
          <ProgressFlashcardDoughnut
            segments={flashcardSegments}
            total={data.totalFlashcards}
          />
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
        <div className="space-y-5">
          <ProgressActivityHeatmap activityDays={data.activityDays} />
          <ProgressWeakConceptsPanel
            concepts={data.weakConcepts}
            projectId={project.id}
          />
        </div>

        <ProgressQuizBreakdown
          quizScores={data.quizScores}
          projectId={project.id}
        />
      </div>

      <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-7">
        <div className="grid gap-6 md:grid-cols-3">
          {summaryStats.map(([label, value], index) => (
            <ProgressMiniStat
              key={label}
              label={label}
              value={value}
              withDivider={index % 3 !== 2}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function buildProgressTrendPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlOffset = Math.max(18, (next.x - current.x) * 0.42);
    path += ` C ${current.x + controlOffset} ${current.y}, ${
      next.x - controlOffset
    } ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function ProgressScoreTrendChart({
  attempts,
}: {
  attempts: ProgressAttempt[];
}) {
  const width = 760;
  const height = 280;
  const paddingLeft = 52;
  const paddingRight = 28;
  const paddingTop = 28;
  const paddingBottom = 42;
  const latestIndex = attempts.length - 1;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const points = attempts.map((attempt, index) => ({
    x:
      attempts.length > 1
        ? paddingLeft + (plotWidth * index) / (attempts.length - 1)
        : paddingLeft + plotWidth / 2,
    y: paddingTop + plotHeight * (1 - attempt.scorePercent / 100),
    attempt,
    index,
  }));
  const linePath = buildProgressTrendPath(points);
  const baselineY = paddingTop + plotHeight;
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : "";
  const latestAttempt = attempts[latestIndex];

  return (
    <div className="mt-5">
      <div
        className="overflow-x-auto border-y border-subtle py-5 [scrollbar-width:thin]"
        role="img"
        aria-label="Evoluția scorurilor la quiz-uri în timp"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-72 min-w-[44rem] w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="progress-line-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--theme-action)" stopOpacity="0.24" />
              <stop offset="74%" stopColor="var(--theme-action)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--theme-action)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((line) => {
            const y = paddingTop + plotHeight * (1 - line / 100);
            return (
              <g key={line}>
                <line
                  x1={paddingLeft}
                  x2={width - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="var(--theme-border)"
                  strokeDasharray={line === 0 ? "0" : "6 7"}
                  strokeWidth={1}
                />
                <text
                  x={paddingLeft - 14}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted text-[10px] font-bold"
                >
                  {line}%
                </text>
              </g>
            );
          })}

          {points.length > 1 ? (
            <path d={areaPath} fill="url(#progress-line-fill)" />
          ) : null}
          <path
            d={linePath}
            fill="none"
            stroke="var(--theme-action)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map(({ x, y, attempt, index }) => {
            const isLatest = index === latestIndex;

            return (
              <g key={`${attempt.completedAt}-${index}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={paddingTop}
                  y2={baselineY}
                  stroke="var(--theme-border)"
                  strokeOpacity={isLatest ? 0.9 : 0.45}
                  strokeDasharray="3 7"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={isLatest ? 8 : 6}
                  fill="var(--theme-surface)"
                  stroke="var(--theme-action)"
                  strokeWidth={isLatest ? 4 : 3}
                >
                  <title>
                    {attempt.quizTitle} · {attempt.scorePercent}% ·{" "}
                    {formatQuizAttemptTimestamp(attempt.completedAt)}
                  </title>
                </circle>
                <text
                  x={x}
                  y={y - 14}
                  textAnchor="middle"
                  className="fill-content text-[11px] font-black"
                >
                  {attempt.scorePercent}%
                </text>
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-muted text-[10px] font-bold"
                >
                  #{index + 1}
                </text>
              </g>
            );
          })}

          <line
            x1={paddingLeft}
            x2={width - paddingRight}
            y1={baselineY}
            y2={baselineY}
            stroke="var(--theme-border)"
            strokeWidth={1.5}
          />
        </svg>
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-subtle bg-app p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            Ultima încercare
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-content">
            {latestAttempt.quizTitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-action bg-action px-3 py-1.5 text-xs font-black text-on-action">
            {latestAttempt.scorePercent}%
          </span>
          <span className="text-xs font-bold text-muted">
            {formatQuizAttemptTimestamp(latestAttempt.completedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProgressSectionHeader({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-subtle pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight text-content">
          {title}
        </h3>
      </div>
      {meta ? (
        <span className="w-fit rounded-md border border-subtle bg-app px-3 py-1.5 text-xs font-bold text-muted">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function ProgressEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-subtle bg-app px-4 py-5">
      <p className="text-sm font-black text-content">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

/** Break an axis label into short lines instead of cutting it off. */
function wrapProgressLabel(label: string, maxCharsPerLine: number, maxLines: number) {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) {
      current = "";
      break;
    }
    // A single word longer than the line still has to be cut somewhere.
    current =
      word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
  }
  if (current && lines.length < maxLines) lines.push(current);

  const dropped = words.join(" ").length > lines.join(" ").length;
  if (dropped && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      last.length + 1 > maxCharsPerLine ? `${last.slice(0, maxCharsPerLine - 1)}…` : `${last}…`;
  }
  return lines;
}

function ProgressRadarChart({ scores }: { scores: ProgressCompetencyScore[] }) {
  const size = 280;
  const center = size / 2;
  const radius = 92;
  // Side labels grow outward from the plot, so the drawing area is wider
  // than the plot itself and the text is no longer clipped.
  const padX = 92;
  const padY = 22;

  if (scores.length < 3) {
    return (
      <ProgressEmptyState
        title="Radarul se activează după mai multe rezultate."
        description="Ai nevoie de cel puțin trei subiecte evaluate pentru o matrice de competențe lizibilă."
      />
    );
  }

  const angles = scores.map(
    (_, index) => -Math.PI / 2 + (index * Math.PI * 2) / scores.length,
  );
  const valuePoints = scores.map((score, index) => {
    const currentRadius = (radius * score.value) / 100;
    const angle = angles[index];
    return {
      x: center + Math.cos(angle) * currentRadius,
      y: center + Math.sin(angle) * currentRadius,
    };
  });
  const polygonPoints = valuePoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <div
      className="mt-5 flex justify-center overflow-hidden border-b border-subtle pb-4"
      role="img"
      aria-label="Radarul competențelor pe subiecte"
    >
      <svg
        viewBox={`${-padX} ${-padY} ${size + padX * 2} ${size + padY * 2}`}
        className="h-72 w-full max-w-lg"
      >
        {[0.34, 0.67, 1].map((scale) => {
          const ringPoints = angles
            .map((angle) => {
              const x = center + Math.cos(angle) * radius * scale;
              const y = center + Math.sin(angle) * radius * scale;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <polygon
              key={scale}
              points={ringPoints}
              fill="none"
              stroke="var(--theme-border)"
              strokeWidth={1}
            />
          );
        })}

        {angles.map((angle, index) => {
          const outerX = center + Math.cos(angle) * radius;
          const outerY = center + Math.sin(angle) * radius;
          const labelX = center + Math.cos(angle) * (radius + 26);
          const labelY = center + Math.sin(angle) * (radius + 26);
          const textAnchor =
            labelX < center - 10 ? "end" : labelX > center + 10 ? "start" : "middle";
          const labelLines = wrapProgressLabel(scores[index].label, 18, 4);
          // Centre the wrapped block on its anchor point.
          const firstLineY = labelY + 4 - ((labelLines.length - 1) * 11) / 2;

          return (
            <g key={scores[index].label}>
              <line
                x1={center}
                y1={center}
                x2={outerX}
                y2={outerY}
                stroke="var(--theme-border)"
                strokeWidth={1}
              />
              <text
                x={labelX}
                y={firstLineY}
                textAnchor={textAnchor}
                className="fill-muted text-[10px] font-bold"
              >
                {labelLines.map((line, lineIndex) => (
                  <tspan
                    key={line + lineIndex}
                    x={labelX}
                    dy={lineIndex === 0 ? 0 : 11}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        <polygon
          points={polygonPoints}
          fill="var(--theme-action)"
          fillOpacity={0.15}
          stroke="var(--theme-action)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {valuePoints.map((point, index) => (
          <circle
            key={`${scores[index].label}-${index}`}
            cx={point.x}
            cy={point.y}
            r={4}
            fill="var(--theme-action)"
          >
            <title>
              {scores[index].label}: {scores[index].value}%
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function ProgressTopicBars({ quizScores }: { quizScores: ProgressQuizScore[] }) {
  const completedScores = quizScores
    .filter(isCompletedProgressQuizScore)
    .slice(0, 6);

  if (!completedScores.length) {
    return (
      <ProgressEmptyState
        title="Nu există quiz-uri parcurse încă."
        description="Scorurile pe module vor apărea aici după primele rezultate salvate."
      />
    );
  }

  return (
    <div className="mt-5 space-y-4">
      {completedScores.map((quiz) => (
        <ProgressBarRow
          key={quiz.title}
          label={quiz.title}
          value={quiz.scorePercent}
        />
      ))}
    </div>
  );
}

function buildProgressDoughnutBackground(
  segments: ProgressFlashcardSegment[],
  total: number,
) {
  const visibleSegments = segments.filter((segment) => segment.value > 0);

  if (!visibleSegments.length) {
    return "var(--theme-border)";
  }

  const safeTotal = Math.max(1, total);
  let offset = 0;
  const gradientStops = visibleSegments.map((segment) => {
    const start = offset;
    const end = start + (segment.value / safeTotal) * 100;
    offset = end;
    return `${segment.color} ${start}% ${end}%`;
  });

  return `conic-gradient(${gradientStops.join(", ")})`;
}

function ProgressFlashcardDoughnut({
  segments,
  total,
}: {
  segments: ProgressFlashcardSegment[];
  total: number;
}) {
  const ringBackground = buildProgressDoughnutBackground(segments, total);

  return (
    <div className="mt-5">
      <div className="flex justify-center border-b border-subtle pb-5">
        <div
          className="relative flex h-48 w-48 items-center justify-center rounded-full"
          style={{ background: ringBackground }}
          role="img"
          aria-label="Distribuția flashcard-urilor pe surse"
        >
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border border-subtle bg-surface text-center">
            <span className="font-serif text-4xl font-semibold leading-none text-content">
              {total}
            </span>
            <span className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted">
              total
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {segments.map((segment) => {
          const percent = total
            ? Math.round((segment.value / total) * 100)
            : 0;

          return (
            <div key={segment.label} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex min-w-0 items-center gap-2 font-bold text-content">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: segment.color }}
                />
                <span className="truncate">{segment.label}</span>
                <span className="hidden text-muted sm:inline">{segment.detail}</span>
              </span>
              <span className="shrink-0 font-black text-content">
                {segment.value} ({percent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressActivityHeatmap({
  activityDays,
}: {
  activityDays: ProgressActivityDay[];
}) {
  const days = activityDays;
  const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

  return (
    <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
      <ProgressSectionHeader
        eyebrow="Activitate zilnică"
        title="Constanță în recapitulare"
        meta="4 săptămâni"
      />
      <div className="mt-5 space-y-2">
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-muted">
          {dayLabels.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
            <span
              key={day.key}
              title={
                day.isFuture
                  ? day.label
                  : `${day.label}: ${day.count} încercări`
              }
              className={`h-7 rounded-md border transition hover:scale-105 ${getProgressHeatmapLevelClass(
                day.level,
              )} ${day.isFuture ? "opacity-40" : ""} ${
                day.isLatest ? "ring-2 ring-action ring-offset-2 ring-offset-surface" : ""
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-bold text-muted">
        <span>Mai puțin activ</span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((level) => (
            <span
              key={level}
              className={`h-3 w-3 rounded border ${getProgressHeatmapLevelClass(level)}`}
            />
          ))}
        </div>
        <span>Foarte activ</span>
      </div>
    </section>
  );
}

function getProgressHeatmapLevelClass(level: number) {
  if (level >= 3) return "border-action bg-action";
  if (level === 2) return "border-warning-border bg-warning";
  if (level === 1) return "border-warning-border bg-warning-soft";
  return "border-subtle bg-app";
}

function ProgressWeakConceptsPanel({
  concepts,
  projectId,
}: {
  concepts: Array<[string, number]>;
  projectId: string;
}) {
  return (
    <section className="rounded-xl border border-subtle bg-surface p-5 sm:p-6">
      <ProgressSectionHeader
        eyebrow="Zone critice recomandate"
        title="Top concepte greșite"
      />
      {concepts.length ? (
        <div className="mt-5 space-y-3">
          {concepts.slice(0, 3).map(([concept, count], index) => (
            <div
              key={concept}
              className="grid gap-3 rounded-xl border border-subtle bg-app px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface font-serif text-lg font-semibold text-content">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-content">
                  {concept}
                </p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {count} {count === 1 ? "greșeală salvată" : "greșeli salvate"}
                </p>
              </div>
              <Link
                href={getTabHref("flashcards", projectId)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-subtle bg-surface px-3 text-xs font-black text-content transition hover:bg-surface-hover"
              >
                Repetă
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <ProgressEmptyState
          title="Nu există concepte problematice."
          description="Când salvezi greșeli din quiz-uri, Reviss le grupează aici pentru recapitulare rapidă."
        />
      )}
    </section>
  );
}

function ProgressQuizBreakdown({
  quizScores,
  projectId,
}: {
  quizScores: ProgressQuizScore[];
  projectId: string;
}) {
  return (
    <section className="flex rounded-xl border border-subtle bg-surface p-5 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <ProgressSectionHeader
          eyebrow="Scor pe fiecare quiz"
          title="Rezultate salvate"
          meta={`${quizScores.length} module`}
        />
        {quizScores.length ? (
          <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-2 [scrollbar-width:thin]">
            {quizScores.map((quiz) =>
              quiz.completed && typeof quiz.scorePercent === "number" ? (
                <ProgressQuizListRow
                  key={quiz.title}
                  title={quiz.title}
                  scorePercent={quiz.scorePercent}
                />
              ) : (
                <div
                  key={quiz.title}
                  className="flex items-center justify-between gap-3 border-b border-subtle pb-3 text-xs"
                >
                  <span className="min-w-0 truncate font-bold text-content">
                    {quiz.title}
                  </span>
                  <span className="shrink-0 rounded-md bg-app px-2.5 py-1 font-bold text-muted">
                    Neîncercat
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          <ProgressEmptyState
            title="Quiz-urile nu sunt generate încă."
            description="După generarea quiz-urilor, lista completă de module apare aici."
          />
        )}

        <div className="mt-5 border-t border-subtle pt-4">
          <Link
            href={getTabHref("quiz", projectId)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-black text-on-action transition hover:bg-action-hover"
          >
            Începe un quiz nou
            <Icon>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </Icon>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProgressQuizListRow({
  title,
  scorePercent,
}: {
  title: string;
  scorePercent: number;
}) {
  return (
    <div className="border-b border-subtle pb-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-black text-content">{title}</span>
        <span className="font-black text-content">{scorePercent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full rounded-full ${getProgressScoreBarClass(scorePercent)}`}
          style={{ width: `${scorePercent}%` }}
        />
      </div>
    </div>
  );
}

function ProgressHeroMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-subtle bg-app/55 px-3 py-3">
      <p className="font-serif text-3xl font-semibold leading-none text-content">
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-muted">{label}</p>
    </div>
  );
}

function ProgressHeroStrip({
  label,
  value,
  detail,
  href,
  actionLabel,
}: {
  label: string;
  value: string;
  detail: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
          {label}
        </p>
        <p className="mt-2 min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-content">
          {value}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
      </div>
      {href && actionLabel ? (
        <Link
          href={href}
          className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-subtle bg-app px-3 text-xs font-black text-content transition hover:bg-surface-hover"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ProgressChartStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-0 py-3 text-left sm:px-4 sm:text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl font-semibold text-content">
        {value}
      </p>
    </div>
  );
}

function ProgressMiniStat({
  label,
  value,
  withDivider,
}: {
  label: string;
  value: string;
  withDivider: boolean;
}) {
  return (
    <div className={withDivider ? "md:border-r md:border-subtle md:pr-6" : ""}>
      <p className="font-serif text-4xl font-semibold leading-none text-content">
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold leading-5 text-muted">{label}</p>
    </div>
  );
}

function getProgressScoreBarClass(value: number) {
  if (value >= 80) return "bg-success";
  if (value >= 60) return "bg-warning";
  return "bg-danger";
}

function getProgressScoreBadgeClass(value: number) {
  if (value >= 80) return "bg-success-soft text-success";
  if (value >= 60) return "bg-warning-soft text-warning";
  return "bg-danger-soft text-danger";
}

function ProgressBarRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-bold text-content">{label}</p>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold ${getProgressScoreBadgeClass(value)}`}>
          {value}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-app">
        <div
          className={`h-full rounded-full ${getProgressScoreBarClass(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function NewProjectView({
  projectName,
  subjectName,
  institutionName,
  files,
  canGenerate,
  hasMaterialRights,
  generationState,
  generationProgress,
  completedSteps,
  preparedProject,
  isCancellingGeneration,
  quotaNotice,
  planLimits,
  isDragging,
  fileInputRef,
  onBack,
  onProjectNameChange,
  onSubjectNameChange,
  onInstitutionNameChange,
  onMaterialRightsChange,
  onAddFiles,
  onRemoveFile,
  onDrop,
  onDragStateChange,
  onStartGeneration,
  onCancelGeneration,
  onOpenGeneratedProject,
}: {
  projectName: string;
  subjectName: string;
  institutionName: string;
  files: UploadedFile[];
  canGenerate: boolean;
  hasMaterialRights: boolean;
  generationState: GenerationState;
  generationProgress: number;
  completedSteps: string[];
  preparedProject: StudyProjectPrepareResponse | null;
  isCancellingGeneration: boolean;
  quotaNotice: string | null;
  planLimits: ProjectUploadPlanLimits;
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onProjectNameChange: (value: string) => void;
  onSubjectNameChange: (value: string) => void;
  onInstitutionNameChange: (value: string) => void;
  onMaterialRightsChange: (value: boolean) => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onDragStateChange: (isDragging: boolean) => void;
  onStartGeneration: () => void | Promise<void>;
  onCancelGeneration: () => void | Promise<void>;
  onOpenGeneratedProject: () => void;
}) {
  const totalFileSize = files.reduce((total, file) => total + file.size, 0);
  const detailFieldsCompleted =
    projectName.trim().length >= PROJECT_DETAIL_MIN_LENGTH &&
    subjectName.trim().length >= PROJECT_DETAIL_MIN_LENGTH &&
    institutionName.trim().length >= PROJECT_DETAIL_MIN_LENGTH;
  const setupSteps = [
    detailFieldsCompleted,
    files.length > 0,
    hasMaterialRights,
  ];
  const setupProgress = Math.round(
    (setupSteps.filter(Boolean).length / setupSteps.length) * 100,
  );

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-subtle bg-surface px-4 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
      >
        <Icon>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </Icon>
        Proiectele tale
      </button>

      {generationState === "form" ? (
        <>
          <header className="flex flex-col gap-4 border-b border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                Proiect nou
              </p>
              <h1 className="mt-3 font-serif text-4xl font-semibold leading-none text-content sm:text-5xl">
                Încarcă un curs.
              </h1>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5">
              <div className="rounded-xl border border-subtle bg-surface">
                <label className="grid gap-3 border-b border-subtle px-5 py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
                  <span>
                    <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                      Nume proiect
                    </span>
                    <span className="mt-1 hidden text-xs text-muted md:block">
                      Cum îl vei găsi în cont.
                    </span>
                  </span>
                  <input
                    value={projectName}
                    onChange={(event) =>
                      onProjectNameChange(event.target.value)
                    }
                    type="text"
                    minLength={PROJECT_DETAIL_MIN_LENGTH}
                    maxLength={160}
                    placeholder="Ex: Farma sem. 2"
                    className="h-11 w-full rounded-lg border border-subtle bg-app px-3 text-sm font-semibold text-content outline-none transition placeholder:text-muted/45 focus:border-action focus:ring-4 focus:ring-action-soft"
                  />
                </label>

                <label className="grid gap-3 border-b border-subtle px-5 py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
                  <span>
                    <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                      Materie
                    </span>
                    <span className="mt-1 hidden text-xs text-muted md:block">
                      Context pentru AI.
                    </span>
                  </span>
                  <input
                    value={subjectName}
                    onChange={(event) =>
                      onSubjectNameChange(event.target.value)
                    }
                    type="text"
                    minLength={PROJECT_DETAIL_MIN_LENGTH}
                    maxLength={160}
                    placeholder="Ex: Imunologie"
                    className="h-11 w-full rounded-lg border border-subtle bg-app px-3 text-sm font-semibold text-content outline-none transition placeholder:text-muted/45 focus:border-action focus:ring-4 focus:ring-action-soft"
                  />
                </label>

                <label className="grid gap-3 px-5 py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:items-center">
                  <span>
                    <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-muted">
                      Școală
                    </span>
                    <span className="mt-1 hidden text-xs text-muted md:block">
                      Facultate, școală sau nivel.
                    </span>
                  </span>
                  <input
                    value={institutionName}
                    onChange={(event) =>
                      onInstitutionNameChange(event.target.value)
                    }
                    type="text"
                    minLength={PROJECT_DETAIL_MIN_LENGTH}
                    maxLength={220}
                    placeholder="Ex: UMF / UTCN"
                    className="h-11 w-full rounded-lg border border-subtle bg-app px-3 text-sm font-semibold text-content outline-none transition placeholder:text-muted/45 focus:border-action focus:ring-4 focus:ring-action-soft"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  onDragStateChange(true);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  onDragStateChange(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  onDragStateChange(false);
                }}
                onDrop={onDrop}
                className={`group flex w-full cursor-pointer items-center gap-4 rounded-xl border bg-surface px-5 py-5 text-left transition hover:-translate-y-0.5 hover:border-content/25 ${
                  isDragging
                    ? "border-success bg-success-soft"
                    : "border-subtle hover:bg-surface-hover"
                }`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-app text-content transition group-hover:bg-action group-hover:text-on-action">
                  <Icon className="h-6 w-6">
                    <path d="M12 16V4M7 9l5-5 5 5" />
                    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  </Icon>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black leading-tight text-content">
                    {files.length
                      ? `${files.length} materiale selectate`
                      : "Adaugă materialele"}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {files.length
                      ? `${formatBytes(totalFileSize)} în total`
                      : "Trage fișiere aici sau apasă pentru selectare."}
                  </span>
                </span>
                <span className="hidden rounded-md bg-action px-4 py-2 text-xs font-black text-on-action sm:inline-flex">
                  Alege fișiere
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.pptx,.docx,.txt,.md,.html,.csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  onAddFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />

              <div className="rounded-xl border border-subtle bg-surface px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-muted">
                      Limite plan {planLimits.planName}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Maximum{" "}
                      {formatCountLabel(
                        planLimits.monthlyProjects,
                        "proiect",
                        "proiecte",
                      )}
                      /lună,{" "}
                      {planLimits.filesPerProject} fișiere/proiect,{" "}
                      {planLimits.fileSizeMb} MB/fișier,{" "}
                      {planLimits.projectSizeMb} MB/proiect. Cota lunară:{" "}
                      {planLimits.monthlyMaterials} materiale și{" "}
                      {planLimits.monthlyPageLimit} pagini procesate. Documente
                      scanate:{" "}
                      {planLimits.allowScannedDocuments
                        ? "incluse"
                        : "neincluse"}
                      .
                    </p>
                  </span>
                  <Link
                    href="/upgrade"
                    className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-subtle bg-app px-4 text-sm font-black text-content transition hover:bg-action hover:text-on-action"
                  >
                    Vezi planuri
                  </Link>
                </div>
                {quotaNotice ? (
                  <p className="mt-3 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
                    {quotaNotice}
                  </p>
                ) : null}
              </div>

              {files.length > 0 ? (
                <div className="divide-y divide-subtle rounded-xl border border-subtle bg-surface">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black">
                          {file.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveFile(index)}
                        className="w-fit cursor-pointer rounded-md border border-subtle px-3 py-2 text-xs font-bold text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        Elimină
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="h-fit rounded-xl border border-subtle bg-surface p-5 xl:sticky xl:top-6">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">
                Pregătire
              </p>

              <div className="mt-4 rounded-lg border border-subtle bg-app p-3">
                <div
                  role="progressbar"
                  aria-label="Progres pregătire"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={setupProgress}
                  className="h-2 overflow-hidden rounded-full bg-surface-hover"
                >
                  <div
                    className="h-full rounded-full bg-action transition-all duration-300"
                    style={{ width: `${setupProgress}%` }}
                  />
                </div>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-subtle pt-4 text-sm font-semibold leading-6">
                <input
                  type="checkbox"
                  checked={hasMaterialRights}
                  onChange={(event) =>
                    onMaterialRightsChange(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-action"
                />
                Am dreptul să folosesc aceste materiale.
              </label>

              <button
                type="button"
                disabled={!canGenerate}
                onClick={onStartGeneration}
                className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-action px-5 py-4 text-sm font-black text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
              >
                Generează pachetul
                <Icon>
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </Icon>
              </button>

              <p className="mt-4 text-xs leading-5 text-muted">
                Se generează rezumatul, cuvintele cheie, strategiile și
                flashcardurile. Quizurile se pornesc separat din tabul dedicat.
              </p>

              <p className="mt-3 text-xs leading-5 text-muted">
                Nu încărca date sensibile sau materiale pentru care nu ai drept
                de utilizare.
              </p>
            </aside>
          </div>

        </>
      ) : (
          <GenerationView
            projectName={projectName}
            state={generationState}
            progress={generationProgress}
            completedSteps={completedSteps}
            preparedProject={preparedProject}
            isCancellingGeneration={isCancellingGeneration}
            onCancelGeneration={onCancelGeneration}
            onOpenGeneratedProject={onOpenGeneratedProject}
          />
      )}
    </section>
  );
}

function GenerationView({
  projectName,
  state,
  progress,
  completedSteps,
  preparedProject,
  isCancellingGeneration,
  onCancelGeneration,
  onOpenGeneratedProject,
}: {
  projectName: string;
  state: GenerationState;
  progress: number;
  completedSteps: string[];
  preparedProject: StudyProjectPrepareResponse | null;
  isCancellingGeneration: boolean;
  onCancelGeneration: () => void | Promise<void>;
  onOpenGeneratedProject: () => void;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-surface p-6 sm:p-8">
      <h1 className="font-serif text-3xl font-semibold leading-tight">
        {state === "done" ? "Pachetul este pregătit" : "Generăm pachetul"}
        <span className="text-muted"> - {projectName}</span>
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        {state === "done"
          ? "Rezumatul, cuvintele cheie, strategiile și flashcardurile au fost salvate în proiect."
          : "Pregătim materialele și creăm primul pachet de studiu."}
      </p>

      <div className="mt-6 h-2 overflow-hidden rounded-full bg-app">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {state !== "done" ? (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancelGeneration}
            disabled={isCancellingGeneration}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-subtle bg-app px-5 py-3 text-sm font-black text-content transition hover:border-danger-border hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
          >
            {isCancellingGeneration ? "Se anulează..." : "Anulare"}
            <Icon>
              <path d="M18 6 6 18M6 6l12 12" />
            </Icon>
          </button>
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-subtle border-y border-subtle">
        {generationSteps.map((step) => {
          const isDone = completedSteps.includes(step);
          const isCurrent =
            !isDone && completedSteps.length === generationSteps.indexOf(step);

          return (
            <div key={step} className="flex items-center gap-3 py-4">
              <span className="flex-1 text-sm font-semibold">{step}</span>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isDone
                    ? "bg-success text-app"
                    : isCurrent
                      ? "animate-spin border-2 border-subtle border-t-success"
                      : "border border-subtle"
                }`}
              >
                {isDone ? (
                  <Icon className="h-3.5 w-3.5">
                    <path d="M20 6 9 17l-5-5" />
                  </Icon>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {state === "done" ? (
        <div className="mt-8 border-t border-subtle pt-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
            <Icon className="h-6 w-6">
              <path d="M20 6 9 17l-5-5" />
            </Icon>
          </span>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
            Proiectul este pregătit pentru studiu. Quizurile se generează separat,
            din tabul Quiz-uri, când vrei să intri în testare.
          </p>

          <button
            type="button"
            disabled={!preparedProject}
            onClick={onOpenGeneratedProject}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-action px-5 py-3 text-sm font-semibold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
          >
            Deschide proiectul
            <Icon>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </Icon>
          </button>

        </div>
      ) : null}
    </div>
  );
}
