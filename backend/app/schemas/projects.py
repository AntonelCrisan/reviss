import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.study_project import QUIZ_COMPLEXITIES, QUIZ_QUESTION_TYPES

SummaryHighlightColor = Literal["yellow", "green", "blue", "pink", "purple", "orange"]


class StudyProjectFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    content_type: str | None
    size_bytes: int
    markdown_char_count: int
    conversion_status: str
    conversion_error: str | None
    created_at: datetime


class StudyProjectSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    estimated_reading_minutes: int | None


class StudyProjectKeywordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    term: str
    explanation: str
    anchor_text: str | None
    paragraph_index: int | None = None
    sort_order: int


class StudyProjectFlashcardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    front: str
    front_image: str | None
    back: str
    category: str | None
    difficulty: str | None
    source_type: str
    source_quiz_question_id: uuid.UUID | None
    sort_order: int
    review: bool


class StudyProjectFlashcardReviewUpdate(BaseModel):
    review: bool


class AccountWipeResponse(BaseModel):
    deleted_count: int
    message: str


class StudyProjectSummaryHighlightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paragraph_index: int
    text: str
    color: str
    start_offset: int | None = None
    end_offset: int | None = None


class StudyProjectSummaryHighlightCreate(BaseModel):
    paragraph_index: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=2000)
    color: SummaryHighlightColor = "pink"
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)


class StudyProjectSummaryHighlightColorUpdate(BaseModel):
    color: SummaryHighlightColor


class StudyProjectSummaryNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paragraph_index: int
    text: str
    note: str
    created_at: datetime
    updated_at: datetime


class StudyProjectSummaryNoteCreate(BaseModel):
    paragraph_index: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=2000)
    note: str = Field(min_length=1, max_length=4000)


class StudyProjectSummaryNoteUpdate(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class StudyProjectQuizOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str
    # "matching" only: the item `label` pairs with. The client shuffles the
    # right-hand column before showing it.
    match_label: str | None = None
    is_correct: bool
    # "ordering": the word's correct position in the sentence.
    sort_order: int


class StudyProjectQuizQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    prompt: str
    question_type: str
    explanation: str | None
    concept: str | None = None
    review_section: str | None = None
    review_paragraph_index: int | None = None
    review_anchor_text: str | None = None
    review_advice: str | None = None
    sort_order: int
    options: list[StudyProjectQuizOptionResponse] = Field(default_factory=list)


class StudyProjectQuizAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    score_percent: int
    correct_count: int
    answered_count: int
    completed_at: datetime


class StudyProjectQuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    complexity: str | None
    sort_order: int
    completed_at: datetime | None
    score_percent: int | None
    correct_count: int | None
    answered_count: int | None
    questions: list[StudyProjectQuizQuestionResponse] = Field(default_factory=list)
    attempts: list[StudyProjectQuizAttemptResponse] = Field(default_factory=list)


class StudyProjectQuizCompletionCreate(BaseModel):
    correct_count: int = Field(ge=0)
    answered_count: int = Field(ge=0)


class StudyProjectStrategyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    sort_order: int


class QuizGenerationRequest(BaseModel):
    """Configuration for one generated quiz.

    `question_count` is additionally capped by the plan server-side; the bound
    here only keeps an absurd payload from reaching the service.
    """

    # Derived from the model constants so adding a question type or a
    # difficulty cannot leave this request schema rejecting it.
    complexity: Literal[*QUIZ_COMPLEXITIES]
    question_count: int = Field(ge=1, le=50)
    question_types: list[Literal[*QUIZ_QUESTION_TYPES]] = Field(
        min_length=1, max_length=len(QUIZ_QUESTION_TYPES)
    )


class ActiveProjectSelectionRequest(BaseModel):
    """Which projects keep the plan's active slots. Bounded to the plan's max."""

    keep_project_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)


class StudyProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    subject_name: str
    institution_name: str
    slug: str
    status: str
    material_rights_confirmed: bool
    generation_language: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    is_archived: bool = False
    archived_at: datetime | None = None
    # Deactivated projects stay in the list, marked, but cannot be studied.
    is_deactivated: bool = False
    deactivated_at: datetime | None = None
    file_count: int = 0
    summary_count: int = 0
    keyword_count: int = 0
    flashcard_count: int = 0
    quiz_count: int = 0
    strategy_count: int = 0
    summary_highlight_count: int = 0
    markdown_download_url: str | None = None
    prompt_download_url: str | None = None
    files: list[StudyProjectFileResponse] = Field(default_factory=list)
    summary: StudyProjectSummaryResponse | None = None
    keywords: list[StudyProjectKeywordResponse] = Field(default_factory=list)
    flashcards: list[StudyProjectFlashcardResponse] = Field(default_factory=list)
    quizzes: list[StudyProjectQuizResponse] = Field(default_factory=list)
    strategies: list[StudyProjectStrategyResponse] = Field(default_factory=list)
    summary_highlights: list[StudyProjectSummaryHighlightResponse] = Field(
        default_factory=list
    )
    summary_notes: list[StudyProjectSummaryNoteResponse] = Field(default_factory=list)


class StudyProjectPrepareResponse(BaseModel):
    project: StudyProjectResponse
    markdown_download_url: str
    prompt_download_url: str
    next_step: str


class StudyProjectPrepareCancelRequest(BaseModel):
    request_id: str = Field(
        min_length=8,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class StudyProjectPrepareCancelResponse(BaseModel):
    cancelled: bool = True
    project_id: uuid.UUID | None = None


class StudyProjectImportResponse(BaseModel):
    project: StudyProjectResponse
    imported: bool
    message: str


class StudyProjectRenameRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class StudyProjectQuizMistakeFlashcardCreate(BaseModel):
    question_id: uuid.UUID


class StudyProjectAiSelectionExplainRequest(BaseModel):
    paragraph_index: int = Field(ge=0)
    selected_text: str = Field(min_length=3, max_length=2000)
    student_question: str | None = Field(default=None, max_length=1000)
    # The browser knows the exact character range it selected; matching the
    # text again is only the fallback when it cannot supply one.
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)


class StudyProjectFlashcardAiSelectionExplainRequest(BaseModel):
    flashcard_id: uuid.UUID
    side: Literal["question", "answer"]
    selected_text: str = Field(min_length=3, max_length=2000)
    student_question: str | None = Field(default=None, max_length=1000)


class StudyProjectAiSelectionExplainResponse(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    answer: str = Field(min_length=2, max_length=1200)
    bullets: list[str] = Field(min_length=2, max_length=4)


class StudyProjectChatMessage(BaseModel):
    role: Literal["assistant", "user"]
    text: str = Field(min_length=1, max_length=3000)


class StudyProjectChatRequest(BaseModel):
    message: str = Field(min_length=2, max_length=3000)
    history: list[StudyProjectChatMessage] = Field(default_factory=list, max_length=20)
    conversation_summary: str | None = Field(default=None, max_length=6000)


class StudyProjectChatResponse(BaseModel):
    answer: str = Field(min_length=2, max_length=4000)
