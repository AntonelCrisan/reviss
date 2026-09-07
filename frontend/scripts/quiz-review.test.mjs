import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

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
  "getQuizReviewQuestions", "isQuizAnswerCorrect", "areAnswerSetsEqual", "findSummaryRanges",
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
const api = vm.runInNewContext(code);
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

test("only incorrect answers are recommended and repeated concepts are deduplicated", () => {
  const base = { mode: "single", correctIndexes: [0], concept: "Morala", review: { paragraphIndex: 1 } };
  const questions = [
    { ...base, id: "wrong" }, { ...base, id: "duplicate" },
    { ...base, id: "correct", concept: "Cunoscut" },
    { ...base, id: "unanswered", concept: "Netestat" },
    { ...base, id: "partial", mode: "cloze", gapCount: 2, concept: "Alt concept" },
  ];
  assert.deepEqual(plain(api.getQuizReviewQuestions(questions, {
    wrong: [1], duplicate: [2], correct: [0], partial: [0, 3],
  }).map((item) => item.id)), ["wrong", "partial"]);
  assert.equal(api.getQuizReviewQuestions(questions, {}).length, 0);
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
