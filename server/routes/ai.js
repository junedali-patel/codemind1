"use strict";
// server/routes/aiRouter.js
// Requires: npm install ollama node-fetch dotenv

const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Ollama } = require("ollama");
const fetch = require("node-fetch");
require("dotenv").config();

const { preAnalyzeCode } = require("./codeAnalyzer");
const { generateMermaidSkeleton } = require("./mermaidSkeleton");

const router = express.Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
  requestTimeout: 60_000,
});

const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const LOCAL_PRIMARY = "qwen2.5-coder:3b";
const LOCAL_FALLBACK = "qwen2.5-coder:1.5b";
const GROQ_PRIMARY = "llama-3.1-8b-instant";
const GROQ_SECONDARY = "llama-3.1-70b-versatile";
const DEFAULT_TIMEOUT = 30_000;

const FALLBACK_SUGGESTIONS = [
  "// Suggestion: break function into smaller functions for clarity.",
  "// Suggestion: add basic input validation for this function.",
  "// Suggestion: consider early returns to reduce nesting.",
  "// Suggestion: add try/catch to improve error handling.",
  "// Suggestion: improve naming for readability.",
];

// ─── Small utilities ─────────────────────────────────────────────────────────

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

function withTimeout(promise, ms, msg = "Request timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

// ─── LLM infrastructure ──────────────────────────────────────────────────────

async function selectLocalModel() {
  try {
    const names = ((await ollama.list()).models || []).map((m) => m.name || m);
    if (names.includes("qwen2.5-coder:3b")) return "qwen2.5-coder:3b";
    if (names.includes("qwen2.5-coder:1.5b")) return "qwen2.5-coder:1.5b";
    if (names.includes("qwen2.5:3b")) return "qwen2.5:3b";
  } catch {
    /* ollama not running – fall through */
  }
  return LOCAL_PRIMARY;
}

async function callLocalOllama(model, messages, options = {}) {
  return ollama.chat({ model, messages, stream: false, options });
}

async function callGroq(model, messages, options = {}) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set.");
  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      max_tokens: options.max_tokens || 512,
      temperature: options.temperature ?? 0.2,
      top_p: options.top_p ?? 0.95,
    }),
    timeout: options.requestTimeout || 30_000,
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || JSON.stringify(json);
  return { message: { content }, raw: json };
}

/**
 * Try models in order: local primary → local fallback → Groq 8B → Groq 70B.
 */
async function generateWithFallback(messages, options = {}) {
  const timeout = options.timeoutMs || DEFAULT_TIMEOUT;
  const primary = await selectLocalModel();
  const ollamaOpts = {
    num_predict: options.num_predict || 200,
    temperature: options.temperature ?? 0.2,
    top_p: options.top_p ?? 0.95,
    top_k: options.top_k ?? 40,
  };

  const tryLocal = (model) =>
    withTimeout(
      callLocalOllama(model, messages, ollamaOpts).then((response) => ({
        source: "local",
        model,
        response,
      })),
      timeout,
      `Local ${model} timed out`
    );

  const tryGroq = (model, t = timeout) =>
    withTimeout(
      callGroq(model, messages, options).then((response) => ({
        source: "groq",
        model,
        response,
      })),
      t,
      `Groq ${model} timed out`
    );

  try {
    return await tryLocal(primary);
  } catch (e1) {
    try {
      return await tryLocal(LOCAL_FALLBACK);
    } catch (e2) {
      if (!GROQ_API_KEY)
        throw new Error(`Local models failed. ${e1.message}; ${e2.message}`);
      try {
        return await tryGroq(GROQ_PRIMARY);
      } catch (g1) {
        try {
          return await tryGroq(GROQ_SECONDARY, timeout * 2);
        } catch (g2) {
          throw new Error(
            `All models failed. ${e1.message}; ${e2.message}; ${g1.message}; ${g2.message}`
          );
        }
      }
    }
  }
}

/** Pull text out of any model response shape. */
function extractContent({ source, response }) {
  if (source === "local")
    return (
      response.message?.content ||
      response.output?.[0]?.content?.[0]?.text ||
      JSON.stringify(response)
    );
  if (source === "groq")
    return (
      response.message?.content ||
      response.raw?.choices?.[0]?.text ||
      JSON.stringify(response.raw)
    );
  return JSON.stringify(response);
}

/** Extract fenced code blocks; fall back to heuristic line filtering. */
function extractCodeOnly(text) {
  if (!text) return "";
  const blocks = [...text.matchAll(/```(?:[\w-]+)?\n?([\s\S]*?)```/g)].map(
    (m) => m[1].trim()
  );
  if (blocks.length) return blocks.join("\n\n");

  const CODE_HINTS = [
    "const ",
    "let ",
    "var ",
    "function ",
    "class ",
    "import ",
    "export ",
    "return ",
    "=>",
    ";",
    "{",
    "}",
    "console.",
    "if(",
    "if (",
    "for(",
    "for (",
    "while(",
    "try{",
    "try {",
  ];
  return (
    text
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        return (
          t &&
          !/^(\/\/|#|\/\*|\*|```)/.test(t) &&
          (CODE_HINTS.some((k) => t.includes(k)) || /[;{}()=<>]/.test(t))
        );
      })
      .join("\n")
      .trim() || text.trim()
  );
}

// ─── Flowchart processing ─────────────────────────────────────────────────────

/** Strip syntax-breaking chars; max 5 words / 35 chars. */
function sanitizeLabel(raw) {
  // Convert array subscripts: a[j] → a(j), a[j+1] → a(j+1)
  // Keep =  +  -  >  <  (needed for assignments, arithmetic, conditions)
  // Strip only chars that BREAK Mermaid syntax: { } " ` \ | ; @ # $ % ^ & * ?
  return raw
    .replace(/\[([^\]]+)\]/g, "($1)")
    .replace(/[`'"\\\\]/g, "")
    .replace(/[{}|;@#$%^&*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 7)
    .join(" ")
    .substring(0, 45);
}

function classifyNode(label) {
  const l = label.toLowerCase();
  if (/^(start|end|stop|begin)$/.test(l)) return "terminator";
  if (
    /^(read|input|enter|get|scan|print|output|display|show|write|prompt|log)\b/.test(
      l
    )
  )
    return "io";
  // Detect conditions: explicit comparisons like a(j)>a(j+1), flag==0, beg<=end
  if (
    /\b(if|is|has|should|can|does|are|was|were|will|could|would|may|must|valid|check|exists)\b/.test(
      l
    ) ||
    /\?$/.test(l) ||
    /[<>]=?|[!=]=|==/.test(l)
  )
    return "decision";
  return "process";
}

function wrapLabel(id, label, forceShape) {
  switch (forceShape || classifyNode(label)) {
    case "terminator":
      return `${id}(["${label}"])`;
    case "io":
      return `${id}[/"${label}"/]`;
    case "decision":
      return `${id}{"${label}"}`;
    default:
      return `${id}["${label}"]`;
  }
}

function extractLabelFromShape(s) {
  let m;
  if (!s) return null;
  // terminator: (["label"])
  if ((m = s.match(/^\(\["?([^"\]]*)"?\]\)$/))) return m[1];
  // parallelogram: [/"label"/]
  if ((m = s.match(/^\[\/"?([^"/]*)"?\/\]$/))) return m[1];
  // diamond: {"label"} or {'label'} or {label} — keep = + - > < in content
  if ((m = s.match(/^\{["']?([^"'{}]*)["']?\}$/))) return m[1];
  // rectangle: ["label"] or ['label']
  if ((m = s.match(/^\["?([^"\]]+)"?\]$/))) return m[1];
  // rounded: ("label")
  if ((m = s.match(/^\("?([^")]+)"?\)$/))) return m[1];
  // cylinder: [("label")]
  if ((m = s.match(/^\[\("?([^"]*)"?\)\]$/))) return m[1];
  // plain word/phrase
  if (/^[\w\s().><=!+\-]+$/.test(s)) return s;
  return null;
}

function processNodeLine(line) {
  const m = line.match(/^([A-Za-z]\w*)\s*(.*)/);
  if (!m) return null;
  const [, id, rest] = m;
  if (!rest.trim()) return null;
  const label = extractLabelFromShape(rest.trim());
  if (!label) return null;
  const clean = sanitizeLabel(label);
  return clean ? wrapLabel(id, clean) : null;
}

function processEdgeLine(line) {
  const tokens = line.split(
    /(-->(?:\|[^|]*\|)?|--(?:\|[^|]*\|)?|==>(?:\|[^|]*\|)?)/
  );
  const fixed = tokens.map((token, idx) => {
    if (idx % 2 === 1) return token; // connector — pass through
    token = token.trim();
    if (!token) return "";
    const m = token.match(/^([A-Za-z]\w*)\s*(.*)/);
    if (!m) return token;
    const [, id, rest] = m;
    if (!rest.trim()) return id;
    const deduped = rest.replace(new RegExp(`${id}$`), "").trim();
    const label = extractLabelFromShape(deduped);
    if (!label) return id;
    const clean = sanitizeLabel(label);
    return clean ? wrapLabel(id, clean) : id;
  });
  const result = fixed.join("").trim();
  return /(-->|--|==>)/.test(result) ? result : null;
}

function detectFlowchartErrors(code) {
  const errors = [];
  code.split("\n").forEach((line, i) => {
    if (/\["[^"]*"[^"]*"\]/.test(line))
      errors.push({ ln: i + 1, msg: "Nested quotes in label" });
    if (/([A-Za-z]\w*)[\]})]\1(?=\s|-->|$)/.test(line))
      errors.push({ ln: i + 1, msg: "Duplicate ID suffix" });
    const stripped = line.replace(/\|[^|]*\|/g, "");
    if (
      (stripped.match(/\[/g) || []).length !==
      (stripped.match(/\]/g) || []).length
    )
      errors.push({ ln: i + 1, msg: "Unmatched [ ]" });
    if (/(-->|--)\s*$/.test(line))
      errors.push({ ln: i + 1, msg: "Trailing arrow with no target" });
  });
  return errors;
}

function fixFlowchartSyntax(raw) {
  if (!raw) return raw;
  let code = raw.replace(/```(?:mermaid)?/gi, "").trim();
  const start = code.match(/(flowchart|graph)\b[\s\S]*/i);
  code = start ? start[0].trim() : `flowchart TD\n${code}`;

  const out = ["flowchart TD"];

  for (let line of code.split("\n")) {
    line = line.trim();
    if (!line) continue;
    if (/^(flowchart|graph)\b/i.test(line)) continue; // header already added

    // Drop obvious non-Mermaid lines
    if (
      /^(\/\/|#|\/\*|\*|here|note|this|the |and |then |next |first|final)/i.test(
        line
      )
    )
      continue;
    if (/parse error|at index %d|console\.log|^function /i.test(line)) continue;
    if (/^[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+/.test(line)) continue;

    // Fix duplicate ID suffixes (all bracket types)
    line = line
      .replace(/([A-Za-z]\w*)(\[[^\]]*\])\1(?=\s|-->|$)/g, "$1$2")
      .replace(/([A-Za-z]\w*)(\{[^}]*\})\1(?=\s|-->|$)/g, "$1$2")
      .replace(/([A-Za-z]\w*)(\([^)]*\))\1(?=\s|-->|$)/g, "$1$2");

    // Remove trailing arrows
    line = line.replace(/(-->|--|==>)\s*$/, "").trim();
    if (!line) continue;

    const processed = /-->|--|==>/.test(line)
      ? processEdgeLine(line)
      : processNodeLine(line);
    if (processed) out.push(processed);
  }

  return out.join("\n");
}

// ─── Mindmap processing ───────────────────────────────────────────────────────

function fixMindmapSyntax(raw) {
  if (!raw) return raw;
  const out = [];
  let rootFound = false;

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toLowerCase() === "mindmap") {
      out.push("mindmap");
      continue;
    }

    if (!rootFound) {
      const m = line.match(/root\(\(([^)]+)\)\)/i);
      if (m) {
        let label = m[1]
          .replace(/[()[\]{}|;:.<>/\\'"`,!@#$%^&*+=?%]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .split(" ")
          .slice(0, 2)
          .join(" ")
          .substring(0, 40);
        if (label.length < 2) label = "Code Structure";
        out.push(`  root(("${label}"))`);
        rootFound = true;
        continue;
      }
    }

    for (const node of line.split(/\s{3,}/)) {
      const clean = node
        .replace(/^[-*•:>\s]+/, "")
        .replace(/[()[\]{}|;:.<>/\\'"`,!@#$%^&*+=?%]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 40);
      if (clean) out.push(`    ${clean}`);
    }
  }

  if (!rootFound) out.splice(1, 0, "  root((Code))");
  if (out.length < 3) out.push("    Empty");

  return out
    .filter(
      (l) =>
        !/error|parse error|at index|%d|console\.|function |=>|;|\{|\}/i.test(l)
    )
    .join("\n");
}

// ─── Validator ────────────────────────────────────────────────────────────────

function validateMermaid(code, type) {
  if (!code) return { valid: false, error: "No code." };
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (type === "flowchart") {
    if (!/^flowchart\b/i.test(lines[0]))
      return { valid: false, error: 'Must start with "flowchart TD".' };
    const errs = detectFlowchartErrors(code);
    if (errs.length)
      return { valid: false, error: `Line ${errs[0].ln}: ${errs[0].msg}` };
    if (!lines.some((l) => /-->|--|==>/.test(l)))
      return { valid: false, error: "No edges found." };
    return { valid: true };
  }

  if (type === "mindmap") {
    if (lines[0]?.toLowerCase() !== "mindmap")
      return { valid: false, error: 'Must start with "mindmap".' };
    if (!lines.some((l) => /root\(\([^)]+\)\)/i.test(l)))
      return { valid: false, error: "Missing root((...)) node." };
    if (lines.length < 3) return { valid: false, error: "No child nodes." };
    return { valid: true };
  }

  return { valid: false, error: "Unknown diagram type." };
}

function getFallbackMermaid(type) {
  if (type === "flowchart") {
    return `flowchart TD
  A(["Start"]) --> B["Analyze Code"]
  B --> C{"Valid Syntax?"}
  C -->|Yes| D["Render Diagram"]
  C -->|No| E["Use Fallback"]
  D --> F(["End"])
  E --> F`;
  }
  return `mindmap
  root((Code Analysis))
    Status
      Fallback Mode
    Components
      Functions
      Classes
      Variables`;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildFlowchartPrompt(codeContent, filePath = "", language = "") {
  // ── Phase 1: Parse code → CFG ─────────────────────────────────────────────
  const analysis = preAnalyzeCode(codeContent, filePath, language);
  const lang = analysis.language || language || "code";

  // ── Phase 2: Generate Mermaid skeleton directly from CFG ──────────────────
  //
  // OLD approach: send a text summary → LLM interprets [PROCESS]/[IF]/[LOOP]
  //   tags → 3B model copies tag text verbatim into labels ("Process: Assign:")
  //
  // NEW approach: build the Mermaid directly from the AST, send it to the LLM
  //   for syntax verification only. The LLM can no longer corrupt labels because
  //   labels are already embedded in the skeleton.
  //
  let skeleton = "";
  let skeletonOk = false;

  if (
    analysis.hasStructure &&
    analysis.cfgNodes &&
    analysis.cfgNodes.length > 0
  ) {
    try {
      skeleton = generateMermaidSkeleton(analysis.cfgNodes);
      skeletonOk =
        skeleton.includes("flowchart TD") &&
        skeleton.includes("S(") &&
        skeleton.includes("Z(");
    } catch (e) {
      console.warn(
        "[buildFlowchartPrompt] skeleton generation failed:",
        e.message
      );
    }
  }

  // ── Phase 3: Build the prompt ─────────────────────────────────────────────
  if (skeletonOk) {
    // ── SKELETON PATH — LLM only fixes syntax, never guesses structure ──────
    return {
      system: [
        "You are a Mermaid flowchart syntax validator.",
        "You receive a pre-generated Mermaid flowchart skeleton derived from static code analysis.",
        "The structure, nodes, edges, and labels are already correct.",
        "Your ONLY job: output the skeleton with minor syntax fixes if needed.",
        "Rules: (1) Never add, remove, or rename any node or edge.",
        "(2) Ensure every node ID is unique — no duplicate IDs.",
        '(3) Labels inside ["..."] and [/"..."/] and {"..."} must not contain unescaped " characters.',
        "(4) Output ONLY the raw Mermaid. No prose, no markdown fences, no comments.",
      ].join(" "),

      user: `Output this Mermaid flowchart with any syntax errors fixed.
Do NOT change node labels, structure, edges, or IDs.
Do NOT add or remove nodes.
Just clean the syntax and output the Mermaid.

SKELETON TO CLEAN:
\`\`\`
${skeleton}
\`\`\`

Output the corrected Mermaid starting with "flowchart TD" on line 1.`,
    };
  }

  // ── FALLBACK PATH — skeleton failed, send code with tight instructions ────
  const codeBlock = `\`\`\`${lang}\n${codeContent.substring(0, 1500)}\n\`\`\``;
  const summaryBlock = analysis.summary
    ? `PRE-ANALYSIS:\n${analysis.summary.substring(0, 800)}`
    : "";

  return {
    system: [
      "You are a Mermaid flowchart generator.",
      "Convert code into a Mermaid flowchart.",
      "Output ONLY raw Mermaid syntax. No prose, no fences, no explanations.",
    ].join(" "),

    user: `Convert the code below into a Mermaid flowchart.

${summaryBlock}

CODE:
${codeBlock}

RULES:
  flowchart TD on line 1
  S(["Start"]) → steps → Z(["End"])
  Processes  → N["label"]
  I/O        → N[/"label"/]
  Conditions → N{"condition?"}  with Yes/No edges
  Loops      → L{"condition?"} — Yes → body → loop back; No → continue
  Labels max 6 words, no double-quotes inside labels
  Every unique step = unique node ID

Output Mermaid only.`,
  };
}

function buildMindmapPrompt(codeContent, filePath = "", language = "") {
  const snippet = codeContent.substring(0, 2500);
  const fileHint = filePath ? `File: ${filePath}\n\n` : "";
  return {
    system:
      "You are a Mermaid mindmap generator. Output ONLY valid Mermaid mindmap syntax. No prose, no markdown fences.",
    user: `Generate a Mermaid mindmap for the code below.
${fileHint}
RULES:
1. First line: mindmap
2. Second line (2 spaces): root((ShortName))  — 1-2 words, no special chars
3. Indent child nodes with 2 extra spaces per level. One node per line.
4. NO parentheses, dots, or special chars in node text.
5. Use actual names from the code.
6. Output ONLY the mindmap code.

Example:
mindmap
  root((Auth Module))
    Functions
      login
      logout
    Helpers
      hashPassword

CODE:
\`\`\`${language}
${snippet}
\`\`\``,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post("/complete", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided." });
  try {
    const result = await generateWithFallback(
      [
        {
          role: "system",
          content:
            "You are a helpful coding assistant. Respond only with improved code, no explanations.",
        },
        { role: "user", content: `Complete or improve this code:\n\n${code}` },
      ],
      { timeoutMs: 120_000, num_predict: 200, temperature: 0 }
    );
    const snippet = extractCodeOnly(extractContent(result));
    const suggestion =
      snippet && snippet.length > 5
        ? snippet
        : randomItem(FALLBACK_SUGGESTIONS);
    return res.json({ suggestion });
  } catch (err) {
    return res
      .status(500)
      .json({
        error: err.message,
        suggestion: randomItem(FALLBACK_SUGGESTIONS),
      });
  }
});

router.post("/analyze-repo", async (req, res) => {
  const { files = [], owner = "unknown", repo = "unknown" } = req.body;
  if (!files.length)
    return res.status(400).json({ error: "No files provided." });
  try {
    const pkgFile = files.find((f) => f.path.endsWith("package.json"));
    let deps = [];
    if (pkgFile?.content) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        deps = Object.entries({
          ...pkg.dependencies,
          ...pkg.devDependencies,
        }).map(([name, version]) => ({ name, version }));
      } catch {
        /* malformed JSON */
      }
    }
    const fileTypes = files.reduce((acc, f) => {
      const ext = f.path.split(".").pop() || "other";
      (acc[ext] = acc[ext] || []).push(f);
      return acc;
    }, {});

    const result = await generateWithFallback(
      [
        {
          role: "system",
          content:
            "You are an expert software architect. Be concise and actionable.",
        },
        {
          role: "user",
          content: `Analyze ${owner}/${repo}: ${
            files.length
          } files, types: ${Object.keys(fileTypes).join(", ")}, ${
            deps.length
          } deps.\n\nProvide: 1) Purpose 2) Architecture 3) Dep risks 4) Top improvements 5) 3 beginner tasks 6) Production readiness.`,
        },
      ],
      {
        timeoutMs: 220_000,
        num_predict: 1500,
        temperature: 0.2,
        max_tokens: 2000,
      }
    );
    return res.json({
      success: true,
      analysis: extractContent(result),
      metadata: {
        totalFiles: files.length,
        fileTypes: Object.keys(fileTypes).length,
        dependencies: deps.length,
        usedModel: result.model,
        source: result.source,
        analyzedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/explain", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided." });
  try {
    const result = await generateWithFallback(
      [
        { role: "system", content: "Explain code clearly and concisely." },
        { role: "user", content: `Explain what this code does:\n\n${code}` },
      ],
      { timeoutMs: 40_000, num_predict: 400, temperature: 0.3 }
    );
    return res.json({
      explanation: extractContent(result).trim() || "No explanation.",
      usedModel: result.model,
      source: result.source,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/chat", async (req, res) => {
  const { message, conversationHistory } = req.body;
  if (!message) return res.status(400).json({ error: "No message provided." });
  try {
    const result = await generateWithFallback(
      [
        {
          role: "system",
          content:
            "You are an expert AI coding assistant in an IDE. Help with analysis, debugging, refactoring, and programming questions.",
        },
        ...(Array.isArray(conversationHistory)
          ? conversationHistory.slice(-12)
          : []),
        { role: "user", content: message },
      ],
      { timeoutMs: 30_000, num_predict: 600, temperature: 0.6 }
    );
    return res.json({
      response: extractContent(result).trim() || "No response.",
      usedModel: result.model,
      source: result.source,
    });
  } catch (err) {
    const fallback = err.message?.includes("timed out")
      ? "Request took too long. Try a shorter message."
      : "Error processing request. Please try again.";
    return res.status(500).json({ error: err.message, response: fallback });
  }
});

/**
 * POST /api/ai/generate-diagram
 * Body: { codeContent, diagramType, filePath?, language? }
 *
 * Pipeline:
 *   Layer 1 – LLM generates raw Mermaid via lean, targeted prompt
 *   Layer 2 – Cleaner strips fences and fixes syntax errors
 *   Layer 3 – Validator; returns safe fallback if still broken
 */
router.post("/generate-diagram", async (req, res) => {
  const { codeContent, diagramType, filePath = "", language = "" } = req.body;
  if (!codeContent)
    return res.status(400).json({ error: "No code content provided." });
  if (!["flowchart", "mindmap"].includes(diagramType))
    return res
      .status(400)
      .json({ error: 'diagramType must be "flowchart" or "mindmap".' });

  try {
    // ── Layer 1: Generate ─────────────────────────────────────────────────
    const { system, user } =
      diagramType === "flowchart"
        ? buildFlowchartPrompt(codeContent, filePath, language)
        : buildMindmapPrompt(codeContent, filePath, language);

    const result = await generateWithFallback(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        timeoutMs: 120_000,
        num_predict: 800,
        temperature: 0.1,
        max_tokens: 1500,
      }
    );
    const rawContent = extractContent(result);

    // ── Layer 2: Clean ────────────────────────────────────────────────────
    let mermaidCode = rawContent
      .replace(/```(?:mermaid)?\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const startMatch = mermaidCode.match(/(flowchart|mindmap|graph)\b[\s\S]*/i);
    if (startMatch) mermaidCode = startMatch[0].trim();

    mermaidCode =
      diagramType === "flowchart"
        ? fixFlowchartSyntax(mermaidCode)
        : fixMindmapSyntax(mermaidCode);

    // ── Layer 3: Validate ─────────────────────────────────────────────────
    const validation = validateMermaid(mermaidCode, diagramType);
    const meta = {
      usedModel: result.model,
      source: result.source,
      generatedAt: new Date().toISOString(),
    };

    if (!validation.valid) {
      return res.json({
        success: true,
        diagramType,
        isFallback: true,
        mermaidCode: getFallbackMermaid(diagramType),
        validationError: validation.error,
        metadata: meta,
      });
    }
    return res.json({
      success: true,
      diagramType,
      isFallback: false,
      mermaidCode,
      validationError: null,
      metadata: meta,
    });
  } catch (err) {
    return res.json({
      success: true,
      diagramType,
      isFallback: true,
      mermaidCode: getFallbackMermaid(diagramType),
      validationError: err.message,
      metadata: {
        usedModel: "error-fallback",
        source: "error-handler",
        generatedAt: new Date().toISOString(),
      },
    });
  }
});

router.post("/export-diagram", (req, res) => {
  const { mermaidCode, format = "png", diagramType = "flowchart" } = req.body;
  if (!mermaidCode)
    return res.status(400).json({ error: "No mermaidCode provided." });
  if (!["png", "svg", "pdf"].includes(format))
    return res.status(400).json({ error: "Format must be png, svg, or pdf." });
  if (!["flowchart", "mindmap"].includes(diagramType))
    return res
      .status(400)
      .json({ error: "diagramType must be flowchart or mindmap." });

  try {
    const tempDir = path.join(__dirname, "../../tmp");
    fs.mkdirSync(tempDir, { recursive: true });
    const fileId = `diagram_${Date.now()}`;
    const mmdPath = path.join(tempDir, `${fileId}.mmd`);
    const outPath = path.join(tempDir, `${fileId}.${format}`);
    const header =
      '%%{init: {"themeVariables": {"fontFamily": "Arial, Helvetica, sans-serif", "fontSize": "18px"}}}%%\n';
    fs.writeFileSync(
      mmdPath,
      (mermaidCode.startsWith("%%{init:") ? "" : header) + mermaidCode,
      "utf8"
    );
    exec(`mmdc -i "${mmdPath}" -o "${outPath}" -t default`, (err) => {
      if (err)
        return res.status(500).json({ success: false, error: err.message });
      return res.json({ success: true, url: `/tmp/${fileId}.${format}` });
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Utility endpoints ────────────────────────────────────────────────────────

router.get("/models", async (_req, res) => {
  try {
    const models = ((await ollama.list()).models || []).map((m) => m.name || m);
    return res.json({
      installed: models,
      primary: LOCAL_PRIMARY,
      fallback: LOCAL_FALLBACK,
    });
  } catch {
    return res.json({
      installed: [],
      note: "Ollama not reachable.",
      primary: LOCAL_PRIMARY,
      fallback: LOCAL_FALLBACK,
    });
  }
});

router.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    ollamaHost: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    groqConfigured: !!GROQ_API_KEY,
  })
);

module.exports = router;
