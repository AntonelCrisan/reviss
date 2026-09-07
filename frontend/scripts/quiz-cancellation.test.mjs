import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

function evaluate(source, globals) {
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return vm.runInNewContext(code, {
    AbortController, DOMException, URL, Request, Response, Headers, ...globals,
  });
}

// Exercise the actual handlers without mounting the full account dashboard.
const dashboard = ts.createSourceFile(
  "dashboard.tsx",
  fs.readFileSync(path.join(root, "src/components/account/account-dashboard.tsx"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function functionSource(name) {
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(dashboard);
  assert.ok(found, name);
  return found.getText(dashboard);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function quizHarness() {
  const cancellation = deferred();
  const polling = deferred();
  const queued = { id: "project", status: "generating_quizzes", quizzes: [] };
  const ready = { id: "project", status: "ready", quizzes: [{ id: "quiz" }] };
  const controller = { current: null };
  const stored = [];
  const api = evaluate(
    functionSource("generateProjectQuiz") + "\n" +
    functionSource("cancelProjectQuizGeneration") +
    "\n({ generateProjectQuiz, cancelProjectQuizGeneration })",
    {
      projects: [], getProjectById: () => ({ quizzes: [] }),
      quizGenerationAbortControllerRef: controller,
      generateStudyProjectQuiz: async () => queued,
      cancelStudyProjectGeneration: () => cancellation.promise,
      getStudyProject: async () => ready,
      storeApiProject: (value) => { stored.push(value); return value; },
      mapApiProject: (value) => value,
      refreshUsageSnapshot: async () => {},
      toFriendlyGenerationError: (value) => value,
      isAbortError: (error) => error?.name === "AbortError",
      QUIZ_GENERATION_POLL_ATTEMPTS: 2,
      GENERATION_POLL_INTERVAL_MS: 0,
      delay: () => polling.promise,
    },
  );
  return { api, cancellation, polling, controller, stored, ready, queued };
}

test("prepare cancellation is forwarded with body and session cookie", async () => {
  let forwarded;
  const exports = {};
  evaluate(
    fs.readFileSync(path.join(root, "src/app/api/projects/[...path]/route.ts"), "utf8"),
    {
      exports, process: { env: { API_URL: "https://backend.example" } },
      fetch: async (url, options) => {
        forwarded = { url, options };
        return Response.json({ cancelled: true, project_id: null });
      },
    },
  );
  const body = JSON.stringify({ request_id: "request-123" });
  const response = await exports.POST(
    new Request("https://frontend.example/api/projects/prepare/cancel", {
      method: "POST", body,
      headers: { "content-type": "application/json", cookie: "session=test" },
    }),
    { params: Promise.resolve({ path: ["prepare", "cancel"] }) },
  );
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://backend.example/api/projects/prepare/cancel");
  assert.equal(forwarded.options.headers.get("cookie"), "session=test");
  assert.equal(Buffer.from(forwarded.options.body).toString(), body);
  const unsupported = await exports.GET(
    new Request("https://frontend.example/api/projects/prepare/cancel"),
    { params: Promise.resolve({ path: ["prepare", "cancel"] }) },
  );
  assert.equal(unsupported.status, 404);
});

test("failed cancellation preserves polling through successful completion", async () => {
  const h = quizHarness();
  const generation = h.api.generateProjectQuiz("project", {});
  const cancelling = h.api.cancelProjectQuizGeneration("project");
  const rejection = assert.rejects(cancelling, /network failure/);
  assert.equal(h.controller.current.signal.aborted, false);
  h.cancellation.reject(new Error("network failure"));
  await rejection;
  assert.equal(h.controller.current.signal.aborted, false);
  h.polling.resolve();
  assert.equal(await generation, h.ready);
  assert.equal(h.stored.at(-1), h.ready);
});

test("confirmed cancellation prevents a late poll from replacing server state", async () => {
  const h = quizHarness();
  const generation = h.api.generateProjectQuiz("project", {});
  const rejectedGeneration = assert.rejects(generation, { name: "AbortError" });
  await Promise.resolve();
  const cancelling = h.api.cancelProjectQuizGeneration("project");
  const cancelled = { ...h.queued, status: "ready" };
  h.cancellation.resolve(cancelled);
  assert.equal(await cancelling, cancelled);
  h.polling.resolve();
  await rejectedGeneration;
  assert.equal(h.stored.at(-1), cancelled);
  assert.equal(h.stored.includes(h.ready), false);
});

test("a cancellation response does not abort a newer generation controller", async () => {
  const h = quizHarness();
  const original = new AbortController();
  h.controller.current = original;
  const cancelling = h.api.cancelProjectQuizGeneration("project");
  const newer = new AbortController();
  h.controller.current = newer;
  h.cancellation.resolve(h.ready);
  await cancelling;
  assert.equal(original.signal.aborted, true);
  assert.equal(newer.signal.aborted, false);
});
