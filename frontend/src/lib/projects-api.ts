import type { LanguagePreference } from "@/lib/auth-api";

export type StudyProjectFile = {
  id: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number;
  markdown_char_count: number;
  conversion_status: string;
  conversion_error: string | null;
  created_at: string;
};

export type StudyProjectSummary = {
  id: string;
  content: string;
  estimated_reading_minutes: number | null;
};

export type StudyProjectKeyword = {
  id: string;
  term: string;
  explanation: string;
  anchor_text: string | null;
  paragraph_index?: number | null;
  sort_order: number;
};

export type StudyProjectFlashcard = {
  id: string;
  front: string;
  front_image: string | null;
  back: string;
  category: string | null;
  difficulty: string | null;
  source_type: string;
  source_quiz_question_id: string | null;
  sort_order: number;
  review: boolean;
};

export type StudyProjectQuizOption = {
  id: string;
  label: string;
  /** "matching" only: the item `label` pairs with. */
  match_label: string | null;
  is_correct: boolean;
  sort_order: number;
};

export type StudyProjectQuizQuestion = {
  id: string;
  prompt: string;
  question_type: string;
  explanation: string | null;
  concept?: string | null;
  review_section?: string | null;
  review_paragraph_index?: number | null;
  review_anchor_text?: string | null;
  review_advice?: string | null;
  sort_order: number;
  options: StudyProjectQuizOption[];
};

export type StudyProjectQuizAttempt = {
  id: string;
  score_percent: number;
  correct_count: number;
  answered_count: number;
  completed_at: string;
};

export type StudyProjectQuiz = {
  id: string;
  title: string;
  description: string | null;
  complexity: string | null;
  sort_order: number;
  completed_at: string | null;
  score_percent: number | null;
  correct_count: number | null;
  answered_count: number | null;
  attempts: StudyProjectQuizAttempt[];
  questions: StudyProjectQuizQuestion[];
};

export type StudyProjectStrategy = {
  id: string;
  title: string;
  description: string;
  sort_order: number;
};

export type SummaryHighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange";

export type StudyProjectSummaryHighlight = {
  id: string;
  paragraph_index: number;
  text: string;
  color: SummaryHighlightColor;
  start_offset: number | null;
  end_offset: number | null;
};

export type StudyProjectSummaryNote = {
  id: string;
  paragraph_index: number;
  text: string;
  note: string;
  created_at: string;
  updated_at: string;
};

export type StudyProject = {
  id: string;
  name: string;
  subject_name: string;
  institution_name: string;
  slug: string;
  status:
    | "processing"
    | "generating_study_pack"
    | "awaiting_ai_json"
    | "ready"
    | "generating_quizzes"
    | "failed"
    | string;
  material_rights_confirmed: boolean;
  generation_language: LanguagePreference | string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  archived_at: string | null;
  /** Deactivated projects stay in the list, marked, but cannot be studied. */
  is_deactivated: boolean;
  deactivated_at: string | null;
  file_count: number;
  summary_count: number;
  keyword_count: number;
  flashcard_count: number;
  quiz_count: number;
  strategy_count: number;
  summary_highlight_count: number;
  markdown_download_url: string | null;
  prompt_download_url: string | null;
  files: StudyProjectFile[];
  summary: StudyProjectSummary | null;
  keywords: StudyProjectKeyword[];
  flashcards: StudyProjectFlashcard[];
  quizzes: StudyProjectQuiz[];
  strategies: StudyProjectStrategy[];
  summary_highlights: StudyProjectSummaryHighlight[];
  summary_notes: StudyProjectSummaryNote[];
};

export type StudyProjectPrepareResponse = {
  project: StudyProject;
  markdown_download_url: string;
  prompt_download_url: string;
  next_step: string;
};

export type StudyProjectPrepareCancelResponse = {
  cancelled: boolean;
  project_id: string | null;
};

export type StudyProjectImportResponse = {
  project: StudyProject;
  imported: boolean;
  message: string;
};

export type StudyProjectAiSelectionExplainResponse = {
  title: string;
  answer: string;
  bullets: string[];
};

export type StudyProjectChatMessage = {
  role: "assistant" | "user";
  text: string;
};

export type StudyProjectChatResponse = {
  answer: string;
};

type ApiErrorPayload = {
  detail?:
    | string
    | Array<{ loc?: Array<string | number>; msg?: string }>
    | { code?: string; message?: string };
};

export class ProjectsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ProjectsApiError";
  }
}

function extractErrorMessage(payload: ApiErrorPayload): string {
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    const firstError = payload.detail.find((item) => item.msg);
    if (firstError?.msg) {
      const field = firstError.loc?.at(-1);
      return field ? `${String(field)}: ${firstError.msg}` : firstError.msg;
    }
  }
  if (
    payload.detail &&
    typeof payload.detail === "object" &&
    !Array.isArray(payload.detail) &&
    typeof payload.detail.message === "string"
  ) {
    return payload.detail.message;
  }
  return "A apărut o eroare la proiect. Te rugăm să încerci din nou.";
}

function extractErrorCode(payload: ApiErrorPayload): string | undefined {
  if (
    payload.detail &&
    typeof payload.detail === "object" &&
    !Array.isArray(payload.detail) &&
    typeof payload.detail.code === "string"
  ) {
    return payload.detail.code;
  }
  return undefined;
}

async function parseProjectResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback.
    }
    throw new ProjectsApiError(
      extractErrorMessage(payload),
      response.status,
      extractErrorCode(payload),
    );
  }

  return (await response.json()) as T;
}

export async function listStudyProjects(): Promise<StudyProject[]> {
  const response = await fetch("/api/projects", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject[]>(response);
}

export async function getStudyProject(
  projectId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function listArchivedStudyProjects(): Promise<StudyProject[]> {
  const response = await fetch("/api/projects/archived", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject[]>(response);
}

export type AccountWipeResult = {
  deleted_count: number;
  message: string;
};

export async function deleteAllMaterials(): Promise<AccountWipeResult> {
  const response = await fetch("/api/projects/materials/delete-all", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<AccountWipeResult>(response);
}

export async function deleteAllFlashcards(): Promise<AccountWipeResult> {
  const response = await fetch("/api/projects/flashcards/delete-all", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<AccountWipeResult>(response);
}

export async function renameStudyProject(payload: {
  projectId: string;
  name: string;
}): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${payload.projectId}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: payload.name }),
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function archiveStudyProject(projectId: string): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/archive`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function restoreStudyProject(projectId: string): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/restore`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

/** Slot usage for the account; drives the post-downgrade selection modal. */
export type ActiveProjectSlots = {
  slots: number;
  used: number;
  over_limit: boolean;
  must_choose: boolean;
};

export async function getActiveProjectSlots(): Promise<ActiveProjectSlots> {
  const response = await fetch("/api/projects/active-slots", {
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<ActiveProjectSlots>(response);
}

/** Set the whole active-slot selection in one request. */
export async function applyActiveProjectSelection(
  keepProjectIds: string[],
): Promise<ActiveProjectSlots> {
  const response = await fetch("/api/projects/active-slots", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_project_ids: keepProjectIds }),
    cache: "no-store",
  });
  return parseProjectResponse<ActiveProjectSlots>(response);
}

export async function deactivateStudyProject(
  projectId: string,
): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/deactivate`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function activateStudyProject(
  projectId: string,
): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/activate`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function deleteStudyProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return;
    }

    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Non-JSON upstream errors are handled by the fallback.
    }
    throw new ProjectsApiError(
      extractErrorMessage(payload),
      response.status,
      extractErrorCode(payload),
    );
  }
}

export async function prepareStudyProject(
  payload: {
    name: string;
    subjectName: string;
    institutionName: string;
    files: File[];
    materialRightsConfirmed: boolean;
    generationLanguage?: LanguagePreference;
    prepareRequestId?: string;
  },
  options: { signal?: AbortSignal } = {},
): Promise<StudyProjectPrepareResponse> {
  const formData = new FormData();
  formData.set("name", payload.name.trim());
  formData.set("subject_name", payload.subjectName.trim());
  formData.set("institution_name", payload.institutionName.trim());
  formData.set(
    "material_rights_confirmed",
    String(payload.materialRightsConfirmed),
  );
  if (payload.generationLanguage) {
    formData.set("generation_language", payload.generationLanguage);
  }
  if (payload.prepareRequestId) {
    formData.set("prepare_request_id", payload.prepareRequestId);
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await fetch("/api/projects/prepare", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
    cache: "no-store",
    signal: options.signal,
  });
  return parseProjectResponse<StudyProjectPrepareResponse>(response);
}

export async function cancelStudyProjectPrepare(
  requestId: string,
): Promise<StudyProjectPrepareCancelResponse> {
  const response = await fetch("/api/projects/prepare/cancel", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ request_id: requestId }),
    cache: "no-store",
  });
  return parseProjectResponse<StudyProjectPrepareCancelResponse>(response);
}

export async function cancelStudyProjectGeneration(
  projectId: string,
): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/cancel-generation`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function importStudyProjectJson(payload: {
  projectId: string;
  file: File;
}): Promise<StudyProjectImportResponse> {
  const formData = new FormData();
  formData.set("file", payload.file);

  const response = await fetch(`/api/projects/${payload.projectId}/import-json`, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
    cache: "no-store",
  });
  return parseProjectResponse<StudyProjectImportResponse>(response);
}

/** How a quiz question is answered. */
export type QuizQuestionType =
  | "single_choice"
  | "multiple_choice"
  /** Left label pairs with `match_label`. */
  | "matching"
  /** Options are the words of one sentence; `sort_order` is the answer. */
  | "ordering"
  /**
   * The prompt is a sentence with `____` gaps. Correct options carry the
   * one-based gap number in `sort_order`; distractors carry 0.
   */
  | "cloze";

export type QuizComplexity = "low" | "medium" | "high" | "exam";

/** What the student picked in the generation modal. */
export type QuizGenerationConfig = {
  complexity: QuizComplexity;
  questionCount: number;
  questionTypes: QuizQuestionType[];
};

/** Queue one quiz built to the given configuration.
 *
 * Replaces the old batch call: the whole difficulty range in a single request
 * gave the model too much at once, which made the questions weaker and the
 * generation more expensive.
 */
export async function generateStudyProjectQuiz(
  projectId: string,
  config: QuizGenerationConfig,
  options: { signal?: AbortSignal } = {},
): Promise<StudyProject> {
  const response = await fetch(`/api/projects/${projectId}/quizzes`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      complexity: config.complexity,
      question_count: config.questionCount,
      question_types: config.questionTypes,
    }),
    cache: "no-store",
    signal: options.signal,
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function explainStudyProjectSummarySelection(payload: {
  projectId: string;
  paragraphIndex: number;
  selectedText: string;
  studentQuestion?: string | null;
  startOffset?: number | null;
  endOffset?: number | null;
}): Promise<StudyProjectAiSelectionExplainResponse> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/ai/explain-selection`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paragraph_index: payload.paragraphIndex,
        selected_text: payload.selectedText,
        student_question: payload.studentQuestion?.trim() || null,
        start_offset: payload.startOffset ?? null,
        end_offset: payload.endOffset ?? null,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProjectAiSelectionExplainResponse>(response);
}

export async function explainStudyProjectFlashcardSelection(payload: {
  projectId: string;
  flashcardId: string;
  side: "question" | "answer";
  selectedText: string;
  studentQuestion?: string | null;
}): Promise<StudyProjectAiSelectionExplainResponse> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/ai/explain-flashcard-selection`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flashcard_id: payload.flashcardId,
        side: payload.side,
        selected_text: payload.selectedText,
        student_question: payload.studentQuestion?.trim() || null,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProjectAiSelectionExplainResponse>(response);
}

export async function chatWithStudyProjectAi(payload: {
  projectId: string;
  message: string;
  history: StudyProjectChatMessage[];
  conversationSummary?: string;
}): Promise<StudyProjectChatResponse> {
  const response = await fetch(`/api/projects/${payload.projectId}/ai/chat`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: payload.message,
      history: payload.history,
      conversation_summary: payload.conversationSummary?.trim() || undefined,
    }),
    cache: "no-store",
  });
  return parseProjectResponse<StudyProjectChatResponse>(response);
}

export async function createQuizMistakeFlashcard(payload: {
  projectId: string;
  questionId: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/quiz-mistake-flashcards`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question_id: payload.questionId,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function createManualStudyProjectFlashcard(payload: {
  projectId: string;
  front: string;
  back: string;
  category?: string;
  difficulty?: string;
  frontImage?: File;
}): Promise<StudyProject> {
  const formData = new FormData();
  formData.set("front", payload.front);
  formData.set("back", payload.back);
  if (payload.category?.trim()) {
    formData.set("category", payload.category.trim());
  }
  if (payload.difficulty?.trim()) {
    formData.set("difficulty", payload.difficulty.trim());
  }
  if (payload.frontImage) {
    formData.set("front_image", payload.frontImage);
  }

  const response = await fetch(`/api/projects/${payload.projectId}/flashcards`, {
    method: "POST",
    credentials: "same-origin",
    body: formData,
    cache: "no-store",
  });
  return parseProjectResponse<StudyProject>(response);
}

export async function createSummaryHighlight(payload: {
  projectId: string;
  paragraphIndex: number;
  text: string;
  color: SummaryHighlightColor;
  startOffset?: number | null;
  endOffset?: number | null;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-highlights`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paragraph_index: payload.paragraphIndex,
        text: payload.text,
        color: payload.color,
        start_offset: payload.startOffset ?? null,
        end_offset: payload.endOffset ?? null,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function updateSummaryHighlightColor(payload: {
  projectId: string;
  highlightId: string;
  color: SummaryHighlightColor;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-highlights/${payload.highlightId}`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ color: payload.color }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function deleteSummaryHighlight(payload: {
  projectId: string;
  highlightId: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-highlights/${payload.highlightId}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function deleteAllSummaryHighlights(payload: {
  projectId: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-highlights`,
    {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function createSummaryNote(payload: {
  projectId: string;
  paragraphIndex: number;
  text: string;
  note: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-notes`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paragraph_index: payload.paragraphIndex,
        text: payload.text,
        note: payload.note,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function updateSummaryNote(payload: {
  projectId: string;
  noteId: string;
  note: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-notes/${payload.noteId}`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note: payload.note }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function deleteSummaryNote(payload: {
  projectId: string;
  noteId: string;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/summary-notes/${payload.noteId}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function completeQuiz(payload: {
  projectId: string;
  quizId: string;
  correctCount: number;
  answeredCount: number;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/quizzes/${payload.quizId}/complete`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        correct_count: payload.correctCount,
        answered_count: payload.answeredCount,
      }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}

export async function setFlashcardReview(payload: {
  projectId: string;
  flashcardId: string;
  review: boolean;
}): Promise<StudyProject> {
  const response = await fetch(
    `/api/projects/${payload.projectId}/flashcards/${payload.flashcardId}/review`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ review: payload.review }),
      cache: "no-store",
    },
  );
  return parseProjectResponse<StudyProject>(response);
}
