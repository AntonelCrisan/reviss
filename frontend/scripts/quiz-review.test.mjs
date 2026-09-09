import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createElement, useEffect, useMemo, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

const dashboard = ts.createSourceFile(
  "dashboard.tsx",
  fs.readFileSync(new URL("../src/components/account/account-dashboard.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
const names = [
  "splitParagraphEnumeration", "splitSummaryParagraphs", "normalizeSummarySelection",
  "pushSummaryInlineSegment", "appendParsedSummaryInlineSegments",
  "appendDelimitedSummaryInlineSegment", "findNextSummaryInlineMarker",
  "parseSummaryInlineMarkdown", "stripSummaryInlineMarkdown",
  "findParagraphIndexForKeyword", "buildProjectSummaryKeywords", "getQuizReviewLocation",
  "buildQuizCompletionResult", "quizReviewHistoryHref", "getQuizReviewHistory",
  "buildQuizReviewHistoryData", "buildProgressWeakConcepts", "getQuizWeakConcepts", "isQuizAnswerCorrect", "areAnswerSetsEqual", "findSummaryRanges",
];
const source = names.map((name) => {
  const node = dashboard.statements.find((item) =>
    ts.isFunctionDeclaration(item) && item.name?.text === name,
  );
  assert.ok(node, name);
  return node.getText(dashboard);
}).join("\n");
const code = ts.transpileModule(
  source + "\n({ " + names.join(",") + " })",
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const api = vm.runInNewContext(code, { URLSearchParams });
const plain = (value) => JSON.parse(JSON.stringify(value));
const summary = [
  "## Etica", "", "**Morala** se formează prin învățare socială.", "",
  "### Sancțiuni", "", "Sancțiunile juridice pot influența comportamentul.", "",
  "- Normele morale ghidează conduita.", "- Normele juridice sunt stabilite prin lege.", "",
  "## Distincții", "", "Conceptele diferă prin sursa regulilor.",
].join("\n");
const paragraphs = api.splitSummaryParagraphs(summary);
const question = {
  review_paragraph_index: 3,
  review_section: "Etica / Sancțiuni",
  review_anchor_text: "Sancțiunile juridice pot influența comportamentul.",
};

test("review shows the true section and paragraph number excluding headings", () => {
  assert.deepEqual(plain(api.getQuizReviewLocation(question, paragraphs)), {
    section: "Etica / Sancțiuni", paragraphIndex: 3, paragraphNumber: 2,
    anchorText: question.review_anchor_text,
  });
  const first = api.getQuizReviewLocation({
    review_paragraph_index: 1, review_anchor_text: "Morala se formează",
  }, paragraphs);
  assert.equal(first.paragraphNumber, 1);
  assert.equal(first.section, "Etica");
});

test("legacy, missing and ambiguous references never point to a random paragraph", () => {
  assert.equal(api.getQuizReviewLocation({}, paragraphs), null);
  assert.equal(api.getQuizReviewLocation({ ...question, review_anchor_text: "Text inventat" }, paragraphs), null);
  assert.equal(api.getQuizReviewLocation({ ...question, review_paragraph_index: -1 }, paragraphs), null);
  const duplicated = api.splitSummaryParagraphs(summary + "\n\n" + question.review_anchor_text);
  assert.equal(api.getQuizReviewLocation({ ...question, review_paragraph_index: 50 }, duplicated), null);
});

test("a moved exact quote can be relocated without guessing", () => {
  const moved = api.splitSummaryParagraphs("## Introducere\n\nUn paragraf nou.\n\n" + summary);
  const review = api.getQuizReviewLocation(question, moved);
  assert.equal(review.paragraphIndex, 5);
  assert.equal(review.paragraphNumber, 3);
  assert.equal(review.section, "Etica / Sancțiuni");
});

test("keyword anchors ignore headings and missing anchors instead of falling back to index zero", () => {
  const keywords = [
    { id: "good", term: "Morala", anchor_text: "Morala se formează", paragraph_index: 1 },
    { id: "heading", term: "Etica", anchor_text: "Etica" },
    { id: "absent", term: "absent", anchor_text: "Nu există" },
  ];
  const result = api.buildProjectSummaryKeywords(keywords, paragraphs);
  assert.equal(result.length, 1);
  assert.equal(result[0].paragraphIndex, 1);
});

test("weak concept statistics count only incorrect answers and deduplicate concepts", () => {
  const base = { mode: "single", correctIndexes: [0], concept: "Morala" };
  const questions = [
    { ...base, id: "wrong" }, { ...base, id: "duplicate", concept: " MORALA " },
    { ...base, id: "correct", concept: "Cunoscut" },
    { ...base, id: "unanswered", concept: "Netestat" },
    { ...base, id: "partial", mode: "cloze", gapCount: 2, concept: "Alt concept" },
  ];
  assert.deepEqual(plain(api.getQuizWeakConcepts(questions, {
    wrong: [1], duplicate: [2], correct: [0], partial: [0, 3],
  })), ["Morala", "Alt concept"]);
  assert.equal(api.getQuizWeakConcepts(questions, {}).length, 0);
});

test("legacy inline enumerations preserve the backend paragraph indices", () => {
  const blocks = api.splitSummaryParagraphs("## Etape\n\nProces: analiză; decizie; verificare.");
  const review = api.getQuizReviewLocation({
    review_paragraph_index: 3, review_anchor_text: "decizie",
  }, blocks);
  assert.equal(review.paragraphIndex, 3);
  assert.equal(review.paragraphNumber, 3);
});


test("review links scroll and focus the referenced paragraph after rendering", () => {
  let focusFunction;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "focusReviewParagraph") {
      focusFunction = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(dashboard);
  assert.ok(focusFunction);
  const compiled = ts.transpileModule(
    focusFunction.getText(dashboard) + "\nfocusReviewParagraph();",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const selected = [];
  const calls = [];
  const paragraph = {
    scrollIntoView: (options) => calls.push(["scroll", options.block]),
    focus: (options) => calls.push(["focus", options.preventScroll]),
  };
  const summaryRef = {
    current: { querySelector: (selector) => { selected.push(selector); return paragraph; } },
  };
  vm.runInNewContext(compiled, {
    window: { location: { hash: "#summary-paragraph-31" } }, summaryRef,
  });
  assert.deepEqual(selected, ['[data-summary-paragraph="31"]']);
  assert.deepEqual(calls, [["scroll", "center"], ["focus", true]]);
  selected.length = 0;
  calls.length = 0;
  vm.runInNewContext(compiled, {
    window: { location: { hash: "#summary-paragraph--1" } }, summaryRef,
  });
  assert.equal(selected.length, 0);
  assert.equal(calls.length, 0);
});

test("older keyword anchors retain case-insensitive matching and highlighting", () => {
  const result = api.buildProjectSummaryKeywords([
    { id: "legacy", term: "Morala", anchor_text: "morala  se\nformează", paragraph_index: null },
  ], paragraphs);
  assert.equal(result.length, 1);
  assert.equal(result[0].paragraphIndex, 1);
  const text = api.stripSummaryInlineMarkdown(paragraphs[1].text);
  const highlights = api.findSummaryRanges(text, result[0].text, { kind: "keyword" });
  assert.equal(highlights.length, 1);
  assert.equal(text.slice(highlights[0].start, highlights[0].end), "Morala se formează");
});


test("completion stores source question IDs and the same correctness as inline feedback", () => {
  const questions = [
    { id: "shown-single", sourceQuestionId: "source-single", mode: "single", correctIndexes: [2] },
    { id: "shown-multiple", sourceQuestionId: "source-multiple", mode: "multiple", correctIndexes: [0, 2] },
    { id: "shown-matching", sourceQuestionId: "source-matching", mode: "matching", answers: ["a", "b"] },
    { id: "shown-ordering", sourceQuestionId: "source-ordering", mode: "ordering", answers: ["a", "b"] },
    { id: "shown-cloze", sourceQuestionId: "source-cloze", mode: "cloze", gapCount: 2 },
    { id: "unanswered", sourceQuestionId: "source-unanswered", mode: "single", correctIndexes: [0] },
  ];
  const answers = {
    "shown-single": [2], "shown-multiple": [2, 0], "shown-matching": [1, 0],
    "shown-ordering": [0, 1], "shown-cloze": [0, 3],
  };
  assert.deepEqual(plain(api.buildQuizCompletionResult(questions, answers, "stable-attempt")), {
    attemptId: "stable-attempt", correctCount: 3, answeredCount: 5,
    questionResults: [
      { question_id: "source-single", is_correct: true },
      { question_id: "source-multiple", is_correct: true },
      { question_id: "source-matching", is_correct: false },
      { question_id: "source-ordering", is_correct: true },
      { question_id: "source-cloze", is_correct: false },
    ],
  });
});

function historyProject() {
  const question = {
    id: "question-a", concept: "Morala", prompt: "Cum se formează morala?",
    review_paragraph_index: 1, review_anchor_text: "Morala se formează",
  };
  return {
    id: "project", summary: { content: summary },
    quizzes: [
      { id: "quiz-a", title: "Etica", questions: [question], attempts: [
        { id: "old-a", completed_at: "2026-09-07T10:00:00Z", score_percent: 0, question_results: [
          { question_id: "question-a", is_correct: false },
        ] },
        { id: "latest-a", completed_at: "2026-09-07T11:00:00Z", score_percent: 100, question_results: [
          { question_id: "question-a", is_correct: true },
        ] },
      ] },
      { id: "quiz-b", title: "Etica B", questions: [{ ...question, id: "question-b" }], attempts: [
        { id: "latest-b", completed_at: "2026-09-07T10:30:00Z", score_percent: 0, question_results: [
          { question_id: "question-b", is_correct: false },
        ] },
      ] },
    ],
  };
}

test("progress uses each quiz's latest attempt and preserves old mistakes in history", () => {
  const project = historyProject();
  const latest = api.buildQuizReviewHistoryData(project);
  assert.equal(latest.groups.length, 1);
  assert.deepEqual(plain(latest.groups[0].items.map((item) => item.question.id)), ["question-b"]);
  assert.equal(latest.groups[0].items[0].review.paragraphIndex, 1);
  const old = api.buildQuizReviewHistoryData(project, "old-a");
  assert.equal(old.selectedEntry.attempt.id, "old-a");
  assert.deepEqual(plain(old.groups[0].items.map((item) => item.question.id)), ["question-a"]);
  assert.equal(api.buildQuizReviewHistoryData(project, "latest-a").groups.length, 0);
});

test("legacy attempts and unknown history IDs never invent per-question mistakes", () => {
  const project = historyProject();
  project.quizzes[0].attempts.push({
    id: "legacy-latest", completed_at: "2026-09-07T12:00:00Z", score_percent: 0,
  });
  const latest = api.buildQuizReviewHistoryData(project);
  assert.equal(latest.unavailableCount, 1);
  assert.deepEqual(plain(latest.groups[0].items.map((item) => item.question.id)), ["question-b"]);
  const old = api.buildQuizReviewHistoryData(project, "legacy-latest");
  assert.equal(old.groups.length, 0);
  assert.equal(old.unavailableCount, 1);
  const missing = api.buildQuizReviewHistoryData(project, "different-project-attempt");
  assert.equal(missing.missingAttempt, true);
  assert.equal(missing.groups.length, 0);
  const empty = api.buildQuizReviewHistoryData({ ...project, quizzes: [] });
  assert.equal(empty.groups.length, 0);
  assert.equal(empty.history.length, 0);
});

test("review links encode both project and historical attempt and preserve the target section", () => {
  const url = new URL(api.quizReviewHistoryHref("project & one", "attempt&1"), "https://reviss.app");
  assert.equal(url.pathname, "/myaccount/progres");
  assert.equal(url.searchParams.get("project"), "project & one");
  assert.equal(url.searchParams.get("attempt"), "attempt&1");
  assert.equal(url.hash, "#de-revizuit");
  assert.equal(new URL(api.quizReviewHistoryHref("project"), url).searchParams.has("attempt"), false);
});


test("the review panel renders old attempt details, legacy notices and paragraph links", () => {
  const renderNames = ["ProgressQuizReviewPanel", "QuizReviewReference", "formatQuizAttemptTimestamp"];
  const renderSource = renderNames.map((name) => dashboard.statements.find((item) =>
    ts.isFunctionDeclaration(item) && item.name?.text === name,
  ).getText(dashboard)).join("\n");
  const compiled = ts.transpileModule(
    renderSource + "\n({ ProgressQuizReviewPanel })",
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  let selectedAttempt = "old-a";
  const { ProgressQuizReviewPanel } = vm.runInNewContext(compiled, {
    ...api, useMemo, useRef, useEffect, exports: {},
    useRouter: () => ({ replace() {} }),
    useSearchParams: () => new URLSearchParams({ attempt: selectedAttempt }),
    Link: ({ children, ...props }) => createElement("a", props, children),
    require: () => jsxRuntime,
  });
  const project = historyProject();
  let html = renderToStaticMarkup(createElement(ProgressQuizReviewPanel, { project }));
  assert.match(html, /Cum se formează morala/);
  assert.match(html, /summary-paragraph-1/);
  assert.match(html, /id="de-revizuit"/);
  selectedAttempt = "latest-a";
  html = renderToStaticMarkup(createElement(ProgressQuizReviewPanel, { project }));
  assert.doesNotMatch(html, /Cum se formează morala/);
  assert.match(html, /Nu există răspunsuri greșite/);
  delete project.quizzes[0].attempts[1].question_results;
  html = renderToStaticMarkup(createElement(ProgressQuizReviewPanel, { project }));
  assert.match(html, /fără detaliile întrebărilor greșite/);
  assert.doesNotMatch(html, /summary-paragraph-1/);
});

test("completion effect deduplicates saves, permits explicit retry and ignores stale status updates", async () => {
  let saveEffect;
  const quizPanel = dashboard.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === "QuizPanel");
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(dashboard) === "useEffect" &&
        node.arguments[0]?.getText(dashboard).includes("buildQuizCompletionResult")) {
      saveEffect = node.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(quizPanel);
  assert.ok(saveEffect);
  const compiled = ts.transpileModule(
    "(" + saveEffect.getText(dashboard) + ")();",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const calls = [];
  const pending = [];
  let status;
  const context = {
    activeQuiz: { id: "quiz" }, isComplete: true, attemptId: "attempt",
    project: { id: "project" }, completionSavesRef: { current: new Map() },
    quizQuestions: [{ id: "q", sourceQuestionId: "source", mode: "single", correctIndexes: [0] }],
    submittedAnswers: { q: [1] }, buildQuizCompletionResult: api.buildQuizCompletionResult,
    setCompletionSave: (next) => { status = typeof next === "function" ? next(status) : next; },
    toast: { error() {} },
    onQuizComplete: (...args) => {
      calls.push(args);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
  };
  const run = () => vm.runInNewContext(compiled, context);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  run();
  run();
  assert.equal(calls.length, 1);
  pending[0].reject(new Error("connection lost"));
  await flush();
  assert.equal(status.status, "error");
  run();
  assert.equal(calls.length, 1);
  context.completionSavesRef.current.delete("attempt");
  run();
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].attemptId, calls[1][2].attemptId);
  status = { attemptId: "newer-attempt", status: "saving" };
  pending[1].resolve();
  await flush();
  assert.deepEqual(status, { attemptId: "newer-attempt", status: "saving" });
  assert.equal(context.completionSavesRef.current.get("attempt"), "saved");
});

test("completeQuiz sends persistent result IDs through the API contract", async () => {
  const source = ts.createSourceFile("api.ts", fs.readFileSync(
    new URL("../src/lib/projects-api.ts", import.meta.url), "utf8",
  ), ts.ScriptTarget.Latest, true);
  const node = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === "completeQuiz");
  const compiled = ts.transpileModule(
    node.getText(source).replace("export ", "") + "\ncompleteQuiz",
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  let sent;
  const complete = vm.runInNewContext(compiled, {
    fetch: async (url, options) => { sent = { url, ...options }; return {}; },
    parseProjectResponse: async () => ({ id: "project" }),
  });
  const result = {
    attemptId: "attempt-id", correctCount: 0, answeredCount: 1,
    questionResults: [{ question_id: "question-id", is_correct: false }],
  };
  await complete({ projectId: "project", quizId: "quiz", ...result });
  assert.equal(sent.url, "/api/projects/project/quizzes/quiz/complete");
  assert.equal(sent.credentials, "same-origin");
  assert.deepEqual(JSON.parse(sent.body), {
    correct_count: 0, answered_count: 1, attempt_id: "attempt-id",
    question_results: result.questionResults,
  });
});


test("progress counts current mistakes and does not resurrect corrected concepts from saved flashcards", () => {
  const project = historyProject();
  project.quizMistakeFlashcards = [
    { sourceQuestionId: "question-a", topic: "Morala" },
    { sourceQuestionId: "question-b", topic: "Morala" },
  ];
  assert.deepEqual(plain(api.buildProgressWeakConcepts(project)), [["Morala", 1]]);
  project.quizzes[1].attempts[0].question_results[0].is_correct = true;
  assert.deepEqual(plain(api.buildProgressWeakConcepts(project)), []);
  delete project.quizzes[0].attempts[1].question_results;
  assert.deepEqual(plain(api.buildProgressWeakConcepts(project)), [["Morala", 1]]);
});
