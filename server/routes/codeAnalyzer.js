"use strict";
/**
 * codeAnalyzer.js  — SELF-CONTAINED, ZERO EXTERNAL DEPENDENCIES
 * ═══════════════════════════════════════════════════════════════
 *
 * Drop this ONE file into server/routes/ and it works immediately.
 * No tokenizer.js, blockParser.js, cfgBuilder.js, or c_patterns.js needed.
 *
 * Full pipeline — all stages embedded:
 *   Phase 1 — Tokenizer       (strings / comments safely isolated)
 *   Phase 2 — Block Parser    (detects if/for/while/.on()/switch/try/...)
 *   Phase 3 — CFG Builder     (decision, loop, event, tryCatch, switch nodes)
 *   Phase 4 — Summary Writer  (structured text fed to LLM prompt)
 *
 * Language support:
 *   ✅ JavaScript / TypeScript  (full AST pipeline)
 *   ✅ C / C++                  (dedicated C analyzer — printf, scanf, loops, etc.)
 *   ✅ Python                   (regex-based — indentation-based language)
 *   ✅ Generic fallback for any other language
 *
 * API (unchanged — drop-in replacement):
 *   preAnalyzeCode(code, filePath?, languageHint?) → { summary, language, ... }
 *   detectLanguage(filePath, code) → string
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — TOKENIZER
// ═══════════════════════════════════════════════════════════════════════════════

const KEYWORDS = new Set([
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "try",
  "catch",
  "finally",
  "throw",
  "return",
  "break",
  "continue",
  "const",
  "let",
  "var",
  "function",
  "class",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "import",
  "export",
  "from",
  "as",
  "of",
  "in",
  "await",
  "async",
  "yield",
  "extends",
  "super",
  "this",
  "void",
  "static",
  "get",
  "set",
  "interface",
  "type",
  "enum",
  "declare",
  "abstract",
  "implements",
  "namespace",
  "module",
  "readonly",
  "override",
]);

// Structural + statement-terminating characters → PUNCT
const PUNCT_CHARS = new Set(["(", ")", "{", "}", "[", "]", ";", ","]);

function tokenize(code) {
  const tokens = [];
  let i = 0,
    line = 1;

  while (i < code.length) {
    const ch = code[i];

    if (ch === "\n") {
      tokens.push({ type: "NEWLINE", value: "\n", line });
      line++;
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\t" || ch === " ") {
      i++;
      continue;
    }

    // Line comment
    if (ch === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (ch === "/" && code[i + 1] === "*") {
      i += 2;
      while (i < code.length - 1) {
        if (code[i] === "\n") line++;
        if (code[i] === "*" && code[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    // Template literal
    if (ch === "`") {
      let str = "";
      i++;
      while (i < code.length) {
        if (code[i] === "\n") line++;
        if (code[i] === "\\") {
          str += code[i + 1];
          i += 2;
          continue;
        }
        if (code[i] === "$" && code[i + 1] === "{") {
          str += "…";
          i += 2;
          continue;
        }
        if (code[i] === "`") {
          i++;
          break;
        }
        str += code[i];
        i++;
      }
      tokens.push({ type: "STRING", value: str, line });
      continue;
    }
    // String literals
    if (ch === '"' || ch === "'") {
      const q = ch;
      let str = "";
      i++;
      while (i < code.length && code[i] !== q) {
        if (code[i] === "\\") {
          str += code[i + 1];
          i += 2;
          continue;
        }
        if (code[i] === "\n") line++;
        str += code[i];
        i++;
      }
      i++;
      tokens.push({ type: "STRING", value: str, line });
      continue;
    }
    // Numbers
    if (/[0-9]/.test(ch)) {
      let n = "";
      while (i < code.length && /[0-9._eExXa-fA-FoObBnN]/.test(code[i])) {
        n += code[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: n, line });
      continue;
    }
    // Identifiers / keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let w = "";
      while (i < code.length && /[\w$]/.test(code[i])) {
        w += code[i];
        i++;
      }
      tokens.push({
        type: KEYWORDS.has(w) ? "KEYWORD" : "IDENT",
        value: w,
        line,
      });
      continue;
    }
    // PUNCT
    if (PUNCT_CHARS.has(ch)) {
      tokens.push({ type: "PUNCT", value: ch, line });
      i++;
      continue;
    }
    // Multi-char operators
    const ops = [
      "===",
      "!==",
      "**=",
      "||=",
      "&&=",
      "??=",
      "**",
      "??",
      "?.",
      "==",
      "!=",
      "<=",
      ">=",
      "=>",
      "||",
      "&&",
      "++",
      "--",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
    ];
    const op = ops.find((o) => code.slice(i, i + o.length) === o);
    if (op) {
      tokens.push({ type: "OPERATOR", value: op, line });
      i += op.length;
      continue;
    }
    // Single-char operator
    if (/[.:<>=+\-*/%!~^&|@?]/.test(ch)) {
      tokens.push({ type: "OPERATOR", value: ch, line });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — BLOCK PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseBlocks(tokens) {
  const root = {
    owner: { kind: "root", label: "root", meta: {} },
    tokens: [],
    children: [],
    startLine: 1,
    endLine: 1,
  };
  const stack = [root];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];
    const cur = stack[stack.length - 1];

    if (tok.type === "PUNCT" && tok.value === "{") {
      const owner = detectOwner(cur.tokens);
      const child = {
        owner,
        tokens: [],
        children: [],
        startLine: tok.line,
        endLine: tok.line,
      };
      cur.children.push(child);
      trimToLastSemicolon(cur.tokens);
      stack.push(child);
      i++;
      continue;
    }
    if (tok.type === "PUNCT" && tok.value === "}") {
      const closed = stack.pop();
      closed.endLine = tok.line;
      i++;
      continue;
    }
    cur.tokens.push(tok);
    i++;
  }
  return root;
}

function detectOwner(priorTokens) {
  const stmt = getLastStatement(priorTokens);
  const flat = stmt
    .filter((t) => t.type !== "NEWLINE")
    .map((t) => (t.type === "STRING" ? `'${t.value}'` : t.value))
    .join(" ");

  const onM = flat.match(/(\w+)\s*\.\s*on\s*\(\s*'(\w+)'/);
  if (onM)
    return {
      kind: "on-event",
      label: `${onM[1]}.on('${onM[2]}')`,
      meta: { obj: onM[1], event: onM[2] },
    };

  const isElseIf = /\belse\s+if\b/.test(flat);
  if (/\bif\b/.test(flat)) {
    const cond = extractBetweenParens(stmt, "if");
    return {
      kind: isElseIf ? "else-if" : "if",
      label: cond || "condition",
      meta: { condition: cond },
    };
  }
  if (/^\s*else\s*$/.test(flat.trim()))
    return { kind: "else", label: "else", meta: {} };
  if (/\bfor\b/.test(flat) && /\bof\b/.test(flat)) {
    const m = flat.match(/for\s*\([^)]*\bof\b\s*(\w+)/);
    return {
      kind: "for-of",
      label: m ? `For each in ${m[1]}` : "for...of",
      meta: {},
    };
  }
  if (/\bfor\b/.test(flat) && /\bin\b/.test(flat))
    return { kind: "for-in", label: "for...in loop", meta: {} };
  if (/\bfor\b/.test(flat)) {
    const cond = extractBetweenParens(stmt, "for");
    return {
      kind: "for",
      label: cond ? `For: ${cond.substring(0, 40)}` : "for loop",
      meta: {},
    };
  }
  if (/\bwhile\b/.test(flat) && !/\bdo\b/.test(flat)) {
    const cond = extractBetweenParens(stmt, "while");
    return {
      kind: "while",
      label: cond ? `While: ${cond.substring(0, 40)}` : "while loop",
      meta: {},
    };
  }
  if (/\bdo\b/.test(flat) && !/\bwhile\b/.test(flat))
    return { kind: "do-while", label: "do...while", meta: {} };
  if (/\bswitch\b/.test(flat)) {
    const cond = extractBetweenParens(stmt, "switch");
    return {
      kind: "switch",
      label: `Switch on ${cond || "value"}`,
      meta: { expr: cond },
    };
  }
  if (
    /\btry\b/.test(flat) &&
    !/\bcatch\b/.test(flat) &&
    !/\bfinally\b/.test(flat)
  )
    return { kind: "try", label: "try", meta: {} };
  if (/\bcatch\b/.test(flat)) {
    const m = flat.match(/\bcatch\s*\(\s*(\w+)/);
    return {
      kind: "catch",
      label: `catch (${m?.[1] || "e"})`,
      meta: { param: m?.[1] || "e" },
    };
  }
  if (/\bfinally\b/.test(flat))
    return { kind: "finally", label: "finally", meta: {} };
  if (/\.then\s*\(/.test(flat))
    return { kind: "then", label: "Promise resolved", meta: {} };
  if (/\.catch\s*\(/.test(flat))
    return { kind: "promise-catch", label: "Promise rejected", meta: {} };
  if (/\.finally\s*\(/.test(flat))
    return { kind: "promise-finally", label: "Promise finally", meta: {} };
  const iterM = flat.match(
    /(\w+)\s*\.\s*(forEach|map|filter|reduce|find|some|every)\s*\(/
  );
  if (iterM)
    return {
      kind: "iterator",
      label: `${iterM[1]}.${iterM[2]}()`,
      meta: { obj: iterM[1], method: iterM[2] },
    };
  const fnM = flat.match(/\bfunction\s+(\w+)\s*\(/);
  if (fnM)
    return {
      kind: "function",
      label: `function ${fnM[1]}()`,
      meta: { name: fnM[1] },
    };
  const arM = flat.match(/\b(?:const|let|var)\s+(\w+)\s*=.*=>/);
  if (arM)
    return {
      kind: "arrow",
      label: `${arM[1]} = () =>`,
      meta: { name: arM[1] },
    };
  const clM = flat.match(/\bclass\s+(\w+)/);
  if (clM)
    return { kind: "class", label: `class ${clM[1]}`, meta: { name: clM[1] } };
  if (/=>/.test(flat) || /\bfunction\b/.test(flat))
    return { kind: "arrow", label: "callback", meta: {} };
  return { kind: "object", label: "block", meta: {} };
}

function getLastStatement(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === "PUNCT" && tokens[i].value === ";")
      return tokens.slice(i + 1);
  }
  return [...tokens];
}

function trimToLastSemicolon(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type === "PUNCT" && tokens[i].value === ";") {
      tokens.length = i + 1;
      return;
    }
  }
  tokens.length = 0;
}

function extractBetweenParens(tokens, afterKw) {
  let found = false,
    depth = 0,
    content = "";
  for (const tok of tokens) {
    if (!found && tok.type === "KEYWORD" && tok.value === afterKw) {
      found = true;
      continue;
    }
    if (!found) continue;
    if (tok.type === "PUNCT" && tok.value === "(") {
      depth++;
      if (depth === 1) continue;
    }
    if (tok.type === "PUNCT" && tok.value === ")") {
      depth--;
      if (depth === 0) break;
    }
    if (depth > 0)
      content += (tok.type === "STRING" ? `'${tok.value}'` : tok.value) + " ";
  }
  return content.trim().substring(0, 60);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — CFG BUILDER  (JavaScript / TypeScript)
// ═══════════════════════════════════════════════════════════════════════════════

const JS_STMT_PATTERNS = [
  { re: /^(const|let|var)\w*=require\(/, skip: true },
  { re: /^import.+from['"]/, skip: true },
  { re: /^'use strict'/, skip: true },
  {
    re: /createReadStream\('([^']+)'\)/,
    type: "io",
    label: (m) => `Create read stream: ${m[1]}`,
  },
  {
    re: /createWriteStream\('([^']+)'\)/,
    type: "io",
    label: (m) => `Create write stream: ${m[1]}`,
  },
  {
    re: /(\w+)\.pipe\((\w+)\)/,
    type: "process",
    label: (m) => `Pipe ${m[1]} to ${m[2]}`,
  },
  { re: /pipeline\(/, type: "process", label: () => "Stream pipeline" },
  {
    re: /fs\.(readFile|readFileSync)\('([^']+)'\)/,
    type: "io",
    label: (m) => `Read file: ${m[2]}`,
  },
  {
    re: /fs\.(writeFile|writeFileSync|appendFile)\('([^']+)'\)/,
    type: "io",
    label: (m) => `Write file: ${m[2]}`,
  },
  {
    re: /fs\.(open|close|mkdir|unlink|rename|stat)\(/,
    type: "io",
    label: (m) => `fs.${m[1]}`,
  },
  {
    re: /console\.\w+\('([^']{1,60})'\)/,
    type: "output",
    label: (m) => `Log: ${m[1].substring(0, 45)}`,
  },
  {
    re: /console\.\w+\((.{1,50})\)/,
    type: "output",
    label: (m) => `Log: ${m[1].replace(/['"]/g, "").substring(0, 40)}`,
  },
  {
    re: /res\.(send|json|render)\(/,
    type: "output",
    label: (m) => `Send response (${m[1]})`,
  },
  {
    re: /\.listen\((\w+|\d+)\)/,
    type: "io",
    label: (m) => `Listen on port ${m[1]}`,
  },
  {
    re: /fetch\('([^']{1,50})'\)/,
    type: "io",
    label: (m) => `Fetch ${m[1].replace(/^https?:\/\//, "").substring(0, 35)}`,
  },
  {
    re: /axios\.(get|post|put|delete|patch)\('([^']{1,40})'\)/,
    type: "io",
    label: (m) => `${m[1].toUpperCase()} ${m[2].substring(0, 30)}`,
  },
  {
    re: /\.(find|findOne|findById)\(/,
    type: "io",
    label: (m) => `DB query: ${m[1]}`,
  },
  { re: /\.(save|create|insertOne?)\(/, type: "io", label: () => "DB insert" },
  {
    re: /\.(update|updateOne|updateMany)\(/,
    type: "io",
    label: () => "DB update",
  },
  {
    re: /\.(delete|deleteOne|deleteMany)\(/,
    type: "io",
    label: () => "DB delete",
  },
  {
    re: /await(\w+(?:\.\w+)*)\(/,
    type: "process",
    label: (m) => `Await ${m[1]}`,
  },
  {
    re: /Promise\.(all|race|allSettled)\(/,
    type: "process",
    label: (m) => `Promise.${m[1]}`,
  },
  {
    re: /^throw new(\w+(?:Error|Exception))\(/,
    type: "throw",
    label: (m) => `Throw ${m[1]}`,
  },
  { re: /^return res\./, type: "return", label: () => "Return response" },
  {
    re: /^return(.{1,35})/,
    type: "return",
    label: (m) => `Return: ${m[1].trim().substring(0, 30)}`,
  },
  {
    re: /^(?:const|let|var)(\w+)=new(\w+)\(/,
    type: "process",
    label: (m) => `Create ${m[2]} → ${m[1]}`,
  },
];

function buildCFG(block, depth = 0) {
  const nodes = [];
  const allStmts =
    block.tokens.length > 0 ? extractJsStmtNodes(block.tokens) : [];
  const earlyStmts = allStmts.filter(
    (n) => !["return", "throw"].includes(n.type)
  );
  const trailingStmts = allStmts.filter((n) =>
    ["return", "throw"].includes(n.type)
  );
  nodes.push(...earlyStmts);

  let i = 0;
  while (i < block.children.length) {
    const child = block.children[i];
    const kind = child.owner.kind;

    if (kind === "if" || kind === "else-if") {
      const node = {
        type: "decision",
        label: child.owner.label,
        yesBranch: buildCFG(child, depth + 1),
        noBranch: [],
      };
      let j = i + 1;
      while (j < block.children.length) {
        const next = block.children[j];
        if (next.owner.kind === "else-if") {
          node.noBranch = [
            {
              type: "decision",
              label: next.owner.label,
              yesBranch: buildCFG(next, depth + 1),
              noBranch: [],
            },
          ];
          j++;
        } else if (next.owner.kind === "else") {
          const tip = getCfgTip(node);
          tip.noBranch = buildCFG(next, depth + 1);
          j++;
        } else break;
      }
      nodes.push(node);
      i = j;
      continue;
    }
    if (kind === "else") {
      i++;
      continue;
    }
    if (
      ["for", "for-of", "for-in", "while", "do-while", "iterator"].includes(
        kind
      )
    ) {
      nodes.push({
        type: "loop",
        label: child.owner.label,
        kind,
        body: buildCFG(child, depth + 1),
      });
      i++;
      continue;
    }
    if (kind === "switch") {
      nodes.push({
        type: "switch",
        label: child.owner.label,
        cases: extractJsSwitchCases(child),
      });
      i++;
      continue;
    }
    if (kind === "try") {
      const node = {
        type: "tryCatch",
        tryBody: buildCFG(child, depth + 1),
        catchParam: "e",
        catchBody: [],
        finallyBody: [],
      };
      let j = i + 1;
      if (
        j < block.children.length &&
        block.children[j].owner.kind === "catch"
      ) {
        node.catchParam = block.children[j].owner.meta?.param || "e";
        node.catchBody = buildCFG(block.children[j], depth + 1);
        j++;
      }
      if (
        j < block.children.length &&
        block.children[j].owner.kind === "finally"
      ) {
        node.finallyBody = buildCFG(block.children[j], depth + 1);
        j++;
      }
      nodes.push(node);
      i = j;
      continue;
    }
    if (kind === "catch" || kind === "finally") {
      i++;
      continue;
    }
    if (kind === "on-event") {
      nodes.push({
        type: "event",
        obj: child.owner.meta.obj,
        event: child.owner.meta.event,
        label: child.owner.label,
        body: buildCFG(child, depth + 1),
      });
      i++;
      continue;
    }
    if (["then", "promise-catch", "promise-finally"].includes(kind)) {
      nodes.push({
        type: "promise",
        label: child.owner.label,
        body: buildCFG(child, depth + 1),
      });
      i++;
      continue;
    }
    if (kind === "function" || kind === "method") {
      nodes.push({
        type: "function",
        label: child.owner.label,
        body: buildCFG(child, depth + 1),
      });
      i++;
      continue;
    }
    if (kind === "arrow") {
      const body = buildCFG(child, depth + 1);
      if (body.length > 0) nodes.push(...body);
      i++;
      continue;
    }
    nodes.push(...buildCFG(child, depth + 1));
    i++;
  }

  nodes.push(...trailingStmts);
  return nodes;
}

function extractJsStmtNodes(tokens) {
  const stmts = splitByPunct(tokens, ";");
  const nodes = [];
  const seen = new Set();

  for (const stmt of stmts) {
    const compact = stmt
      .filter((t) => t.type !== "NEWLINE")
      .map((t) => (t.type === "STRING" ? `'${t.value}'` : t.value))
      .join("");
    if (!compact) continue;
    if (/\.\w*on\w*\('/.test(compact) && /function|=>/.test(compact)) continue;

    for (const { re, skip, type, label } of JS_STMT_PATTERNS) {
      const m = compact.match(re);
      if (!m) continue;
      if (skip) break;
      const text = label(m).substring(0, 50);
      if (text && !seen.has(text)) {
        seen.add(text);
        nodes.push({ type, label: text });
      }
      break;
    }
  }
  return nodes;
}

function splitByPunct(tokens, char) {
  const stmts = [];
  let current = [];
  for (const tok of tokens) {
    current.push(tok);
    if (tok.type === "PUNCT" && tok.value === char) {
      stmts.push(current);
      current = [];
    } else if (
      tok.type === "NEWLINE" &&
      current.filter((t) => t.type !== "NEWLINE").length > 0
    ) {
      stmts.push(current);
      current = [];
    }
  }
  if (current.filter((t) => t.type !== "NEWLINE").length > 0)
    stmts.push(current);
  return stmts;
}

function extractJsSwitchCases(switchBlock) {
  const cases = [];
  const tokens = switchBlock.tokens;
  let i = 0,
    cur = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (
      tok.type === "KEYWORD" &&
      (tok.value === "case" || tok.value === "default")
    ) {
      if (cur) cases.push(cur);
      let label = tok.value === "default" ? "default" : "";
      i++;
      while (
        i < tokens.length &&
        !(tokens[i].type === "OPERATOR" && tokens[i].value === ":")
      ) {
        if (tokens[i].type !== "NEWLINE")
          label +=
            " " +
            (tokens[i].type === "STRING"
              ? `'${tokens[i].value}'`
              : tokens[i].value);
        i++;
      }
      cur = { label: label.trim(), bodyTokens: [] };
      i++;
      continue;
    }
    if (cur) cur.bodyTokens.push(tok);
    i++;
  }
  if (cur) cases.push(cur);
  return cases.map((c) => ({
    label: c.label,
    body: extractJsStmtNodes(c.bodyTokens),
  }));
}

function getCfgTip(node) {
  let n = node;
  while (
    n.noBranch &&
    n.noBranch.length > 0 &&
    n.noBranch[n.noBranch.length - 1].type === "decision"
  )
    n = n.noBranch[n.noBranch.length - 1];
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — SUMMARY GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function generateJsSummary(cfgNodes, language) {
  const lines = [
    "=== PRE-ANALYZED CODE STRUCTURE ===",
    `Language: ${language}\n`,
  ];
  const meta = {
    hasEvents: false,
    hasDecisions: false,
    hasLoops: false,
    hasTryCatch: false,
    hasSwitch: false,
    eventHandlers: [],
  };

  const sequential = cfgNodes.filter((n) =>
    ["process", "io", "output", "return", "throw"].includes(n.type)
  );
  const structural = cfgNodes.filter(
    (n) => !["process", "io", "output", "return", "throw"].includes(n.type)
  );

  lines.push("[SEQUENTIAL STEPS - execute in this exact order]:");
  if (sequential.length === 0 && structural.length === 0)
    lines.push("  (none detected)");
  else {
    sequential.forEach((n, i) =>
      lines.push(`  Step ${i + 1}: [${n.type.toUpperCase()}] ${n.label}`)
    );
    if (sequential.length === 0)
      lines.push("  (no top-level sequential steps)");
  }

  for (const node of structural) serializeJsNode(node, lines, meta, "");

  lines.push("\n[FLOWCHART STRUCTURE HINT]:");
  if (meta.hasEvents) {
    const seqIds = sequential.map((_, i) => `Step${i + 1}`).join(" → ");
    lines.push(
      `  Main path: Start → ${seqIds}${seqIds ? " → EventWait" : "EventWait"}`
    );
    lines.push(
      `  EventWait branches to: ${meta.eventHandlers
        .map((e) => `${e.obj}.on('${e.event}')`)
        .join(", ")}`
    );
    lines.push("  Each handler branch ends at: End");
    lines.push(
      "  !! CRITICAL: each handler = its own unique node. NEVER merge same-event handlers."
    );
  } else if (meta.hasTryCatch) {
    lines.push("  Main path: try steps → success → End");
    lines.push("  Error path: catch steps → End");
  } else if (meta.hasDecisions) {
    lines.push(
      "  Use diamond nodes for all conditions. Both YES and NO branches must reach End."
    );
  } else if (meta.hasLoops) {
    lines.push(
      "  Loop: Enter → [body] → condition check → (loop back or exit) → End"
    );
  } else {
    lines.push("  Linear flow: Start → each step in order → End");
  }
  lines.push("\n=== END PRE-ANALYSIS ===");
  return { text: lines.join("\n"), ...meta };
}

function serializeJsNode(node, lines, meta, indent) {
  const ind = indent,
    ind2 = indent + "  ";
  switch (node.type) {
    case "decision":
      meta.hasDecisions = true;
      lines.push(`\n${ind}[DECISION - if (${node.label})]:`);
      lines.push(`${ind}  YES branch:`);
      serializeJsBody(node.yesBranch, lines, meta, ind2 + "  ");
      if (node.noBranch && node.noBranch.length > 0) {
        lines.push(`${ind}  NO branch:`);
        serializeJsBody(node.noBranch, lines, meta, ind2 + "  ");
      } else lines.push(`${ind}  NO branch: (continue)`);
      break;
    case "loop":
      meta.hasLoops = true;
      lines.push(`\n${ind}[LOOP - ${node.label}]:`);
      serializeJsBody(node.body, lines, meta, ind2);
      lines.push(`${ind}  (loops back to condition check)`);
      break;
    case "tryCatch":
      meta.hasTryCatch = true;
      lines.push(`\n${ind}[TRY/CATCH BLOCK]:`);
      lines.push(`${ind}  TRY:`);
      serializeJsBody(node.tryBody, lines, meta, ind2 + "  ");
      lines.push(`${ind}  CATCH (${node.catchParam}):`);
      serializeJsBody(node.catchBody, lines, meta, ind2 + "  ");
      if (node.finallyBody?.length > 0) {
        lines.push(`${ind}  FINALLY:`);
        serializeJsBody(node.finallyBody, lines, meta, ind2 + "  ");
      }
      break;
    case "switch":
      meta.hasSwitch = true;
      lines.push(`\n${ind}[SWITCH: ${node.label}]:`);
      (node.cases || []).forEach((c) => {
        lines.push(`${ind}  CASE [${c.label}]:`);
        serializeJsBody(c.body, lines, meta, ind2 + "  ");
      });
      break;
    case "event":
      meta.hasEvents = true;
      meta.eventHandlers.push({ obj: node.obj, event: node.event });
      lines.push(`\n${ind}[EVENT HANDLER: ${node.label}]:`);
      lines.push(
        `${ind}  !! ASYNC BRANCH — separate path. ID: ${node.obj}_${node.event}`
      );
      serializeJsBody(node.body, lines, meta, ind2);
      break;
    case "function":
      lines.push(`\n${ind}[FUNCTION: ${node.label}]:`);
      serializeJsBody(node.body, lines, meta, ind2);
      break;
    default:
      if (node.label)
        lines.push(
          `${ind}  → [${(node.type || "process").toUpperCase()}] ${node.label}`
        );
  }
}

function serializeJsBody(nodes, lines, meta, indent) {
  if (!nodes || nodes.length === 0) {
    lines.push(`${indent}(empty)`);
    return;
  }
  for (const n of nodes) {
    if (["process", "io", "output", "return", "throw"].includes(n.type))
      lines.push(`${indent}→ [${n.type.toUpperCase()}] ${n.label}`);
    else serializeJsNode(n, lines, meta, indent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// C / C++ ANALYZER  (dedicated — printf, scanf, loops, switch, structs, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * sanitizeCLabel(text)
 * Converts C-specific syntax into Mermaid-safe text.
 *   a[j]   → a(j)      (square brackets break Mermaid node shape parsing)
 *   a[j+1] → a(j+1)
 *   "str"  → str       (no double quotes inside labels)
 */
function sanitizeCLabel(text) {
  return text
    .replace(/\[([^\]]+)\]/g, "($1)") // array subscripts: a[j] → a(j)
    .replace(/"/g, "'") // double → single quotes
    .trim()
    .substring(0, 45);
}

const C_PATTERNS = [
  // Skip directives
  { re: /^#include\s*[<"]/, skip: true },
  { re: /^#define\s+/, skip: true },
  { re: /^#pragma\s+/, skip: true },
  { re: /^#if|^#end|^#else|^#elif/, skip: true },

  // Variable declarations
  {
    re: /^(int|float|double|char|long|short|unsigned|bool)\s+(\w[\w\s,*]*)\s*;/,
    type: "process",
    label: (m) =>
      `Declare: ${m[1]} ${m[2].replace(/\s+/g, " ").trim().substring(0, 30)}`,
  },
  {
    re: /^struct\s+(\w+)\s+(\w+)/,
    type: "process",
    label: (m) => `Declare struct: ${m[2]}`,
  },

  // Console I/O — most important for C beginners
  {
    re: /printf\s*\(\s*"([^"]*)(?:"\s*,\s*([^)]{1,50}))?/,
    type: "output",
    label: (m) => {
      const fmt = m[1]
        .replace(/\\n|\\t/g, "")
        .replace(/%[diouxXeEfgGsc]/g, "")
        .trim();
      if (fmt.length >= 2) return `Print: ${fmt.substring(0, 45)}`;
      // Format string is just specifiers (e.g. "%d\t") — show the variable
      if (m[2]) {
        const varStr = sanitizeCLabel(m[2].trim());
        return `Print: ${varStr.substring(0, 35)}`;
      }
      return "Print output";
    },
  },
  { re: /printf\s*\(/, type: "output", label: () => "Print output" },
  {
    re: /scanf\s*\(\s*"[^"]*"\s*,\s*([^)]{1,60})/,
    type: "io",
    label: (m) => {
      const vars = sanitizeCLabel(
        m[1].replace(/&/g, "").replace(/\s+/g, " ").trim()
      );
      return `Input: read ${vars.substring(0, 35)}`;
    },
  },
  { re: /scanf\s*\(/, type: "io", label: () => "Read input (scanf)" },
  {
    re: /fgets\s*\(\s*(\w+)/,
    type: "io",
    label: (m) => `Input: fgets(${m[1]})`,
  },
  { re: /gets\s*\(\s*(\w+)/, type: "io", label: (m) => `Input: gets(${m[1]})` },
  { re: /getchar\s*\(\s*\)/, type: "io", label: () => "Input: getchar" },
  {
    re: /puts\s*\(\s*"([^"]{1,40})"/,
    type: "output",
    label: (m) => `Print: ${m[1].substring(0, 35)}`,
  },
  { re: /puts\s*\(/, type: "output", label: () => "Print output" },
  { re: /putchar\s*\(/, type: "output", label: () => "Print: putchar" },

  // Array element assignment (MUST come before generic assignment — regex priority)
  // e.g.  a[j] = a[j+1];   or   a[j+1] = temp;
  {
    re: /^(\w+)\[([^\]]+)\]\s*=\s*([^;]{1,40})\s*;/,
    type: "process",
    label: (m) =>
      `Assign: ${sanitizeCLabel(m[1] + "[" + m[2] + "]")} = ${sanitizeCLabel(
        m[3].trim()
      )}`,
  },

  // Arithmetic (very common in beginner C programs)
  {
    re: /^(\w+)\s*=\s*(\w+)\s*\+\s*(\w+)\s*;/,
    type: "process",
    label: (m) =>
      `Calculate: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(
        m[2]
      )} + ${sanitizeCLabel(m[3])}`,
  },
  {
    re: /^(\w+)\s*=\s*(\w+)\s*-\s*(\w+)\s*;/,
    type: "process",
    label: (m) =>
      `Calculate: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(
        m[2]
      )} - ${sanitizeCLabel(m[3])}`,
  },
  {
    re: /^(\w+)\s*=\s*(\w+)\s*\*\s*(\w+)\s*;/,
    type: "process",
    label: (m) =>
      `Calculate: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(
        m[2]
      )} * ${sanitizeCLabel(m[3])}`,
  },
  {
    re: /^(\w+)\s*=\s*(\w+)\s*\/\s*(\w+)\s*;/,
    type: "process",
    label: (m) =>
      `Calculate: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(
        m[2]
      )} / ${sanitizeCLabel(m[3])}`,
  },
  {
    re: /^(\w+)\s*=\s*(\w+)\s*%\s*(\w+)\s*;/,
    type: "process",
    label: (m) =>
      `Calculate: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(
        m[2]
      )} % ${sanitizeCLabel(m[3])}`,
  },
  {
    re: /^(\w+)\s*\+\+\s*;|^\+\+\s*(\w+)\s*;/,
    type: "process",
    label: (m) => `Increment: ${m[1] || m[2]}++`,
  },
  {
    re: /^(\w+)\s*--\s*;|^--\s*(\w+)\s*;/,
    type: "process",
    label: (m) => `Decrement: ${m[1] || m[2]}--`,
  },
  {
    re: /^(\w+)\s*\+=\s*(.{1,30})\s*;/,
    type: "process",
    label: (m) => `Update: ${m[1]} += ${sanitizeCLabel(m[2].trim())}`,
  },
  {
    re: /^(\w+)\s*-=\s*(.{1,30})\s*;/,
    type: "process",
    label: (m) => `Update: ${m[1]} -= ${sanitizeCLabel(m[2].trim())}`,
  },
  // Array element on left side of arithmetic assignment: a[i] = expr
  {
    re: /^(\w+)\s*=\s*([^;]{1,40})\s*;/,
    type: "process",
    label: (m) =>
      `Assign: ${sanitizeCLabel(m[1])} = ${sanitizeCLabel(m[2].trim())}`,
  },

  // File I/O
  {
    re: /fopen\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"/,
    type: "io",
    label: (m) => `Open file: ${m[1]} (${m[2]})`,
  },
  { re: /fopen\s*\(/, type: "io", label: () => "Open file (fopen)" },
  {
    re: /fclose\s*\(\s*(\w+)/,
    type: "io",
    label: (m) => `Close file: ${m[1]}`,
  },
  {
    re: /fprintf\s*\(/,
    type: "output",
    label: () => "Write to file (fprintf)",
  },
  { re: /fscanf\s*\(/, type: "io", label: () => "Read from file (fscanf)" },
  { re: /fread\s*\(/, type: "io", label: () => "Read binary (fread)" },
  { re: /fwrite\s*\(/, type: "io", label: () => "Write binary (fwrite)" },

  // Memory
  {
    re: /malloc\s*\((.{1,30})\)/,
    type: "process",
    label: (m) => `Allocate memory: malloc(${m[1].trim().substring(0, 20)})`,
  },
  {
    re: /calloc\s*\(/,
    type: "process",
    label: () => "Allocate memory: calloc",
  },
  {
    re: /realloc\s*\(/,
    type: "process",
    label: () => "Resize memory: realloc",
  },
  {
    re: /free\s*\(\s*(\w+)/,
    type: "process",
    label: (m) => `Free memory: ${m[1]}`,
  },

  // Math / string
  {
    re: /sqrt\s*\((.{1,20})\)/,
    type: "process",
    label: (m) => `Calculate: sqrt(${m[1].trim()})`,
  },
  {
    re: /pow\s*\((\w+),(\w+)\)/,
    type: "process",
    label: (m) => `Calculate: ${m[1].trim()} ^ ${m[2].trim()}`,
  },
  {
    re: /abs\s*\((.{1,20})\)/,
    type: "process",
    label: (m) => `Calculate: abs(${m[1].trim()})`,
  },
  { re: /strcpy\s*\(/, type: "process", label: () => "Copy string (strcpy)" },
  {
    re: /strcat\s*\(/,
    type: "process",
    label: () => "Concatenate strings (strcat)",
  },
  {
    re: /strlen\s*\(\s*(\w+)/,
    type: "process",
    label: (m) => `Get length: strlen(${m[1]})`,
  },
  {
    re: /strcmp\s*\(/,
    type: "process",
    label: () => "Compare strings (strcmp)",
  },
  {
    re: /sprintf\s*\(/,
    type: "process",
    label: () => "Format string (sprintf)",
  },
  {
    re: /rand\s*\(\s*\)/,
    type: "process",
    label: () => "Generate random number",
  },

  // Control flow
  {
    re: /exit\s*\(\s*(\d+)\)/,
    type: "return",
    label: (m) => `Exit program (${m[1]})`,
  },
  { re: /exit\s*\(\s*(\w+)\)/, type: "return", label: (m) => `Exit: ${m[1]}` },
  { re: /^return\s+(\d+)\s*;/, type: "return", label: (m) => `Return ${m[1]}` },
  {
    re: /^return\s+(\w+)\s*;/,
    type: "return",
    label: (m) => `Return: ${m[1]}`,
  },
  { re: /^return\s*;/, type: "return", label: () => "Return" },

  // Generic function call fallback
  {
    re: /^(\w+)\s*\(([^)]{0,40})\)\s*;/,
    type: "process",
    label: (m) => `Call: ${m[1]}(${m[2].trim().substring(0, 25)})`,
  },
];

function analyzeC(code) {
  // Strip C comments before analysis
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*/g, "");

  const cfgNodes = [];
  const lines = clean.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i++;

    if (!line) continue;

    // ── Detect C function definition  ─────────────────────────────────────
    const fnDef = line.match(
      /^(int|void|float|double|char|long|short|unsigned)\s+(\w+)\s*\([^)]*\)\s*\{?$/
    );
    if (
      fnDef &&
      fnDef[2] !== "if" &&
      fnDef[2] !== "while" &&
      fnDef[2] !== "for"
    ) {
      // Collect body until matching closing brace
      const bodyLines = [];
      let depth = line.endsWith("{") ? 1 : 0;
      if (depth === 0) {
        // opening brace on next line
        while (i < lines.length) {
          if (lines[i].trim() === "{") {
            i++;
            depth = 1;
            break;
          }
          i++;
        }
      }
      while (i < lines.length && depth > 0) {
        const bl = lines[i];
        i++;
        for (const ch of bl) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth > 0) bodyLines.push(bl);
      }
      const bodyNodes = analyzeCLines(bodyLines);
      cfgNodes.push({
        type: "function",
        label: `${fnDef[1]} ${fnDef[2]}()`,
        body: bodyNodes,
      });
      continue;
    }

    // ── Top-level statements ───────────────────────────────────────────────
    const node = matchCLine(line);
    if (node) cfgNodes.push(node);
  }

  // Build summary
  const summary = generateCSummary(cfgNodes);

  const sequential = flatSeq(cfgNodes);
  const conditionals = flatByType(cfgNodes, "decision");
  const loops = flatByType(cfgNodes, "loop");

  return {
    language: "c",
    sequential,
    events: [],
    tryCatch: [],
    conditionals,
    loops,
    cfgNodes,
    summary,
    hasStructure: cfgNodes.length > 0,
  };
}

/**
 * Analyze an array of C source lines into CFGNodes.
 * Handles if/else, for, while, do-while, switch/case.
 *
 * KEY FIX: C code commonly puts { on the same line as the keyword:
 *   for(i=0;i<9;i++) {   ← { on keyword line
 *   if(a[j]>a[j+1]) {    ← { on keyword line
 * We detect this and include the current line in collectCBlock, not the next line.
 */
function analyzeCLines(lines) {
  const nodes = [];
  let i = 0;

  /**
   * Determine where to start collecting a block.
   * If the current keyword line already contains {, pass it to collectCBlock.
   * Otherwise collectCBlock searches forward from the next line.
   */
  function getBlock(keywordLine, nextIdx) {
    if (keywordLine.includes("{")) {
      // { is on the same line as the keyword — include current line in collection
      const combined = [keywordLine, ...lines.slice(nextIdx)];
      const { body, consumed } = collectCBlock(combined, 0);
      // consumed counts from combined[0], so actual lines advanced = consumed - 1
      return { body, advance: Math.max(0, consumed - 1) };
    } else {
      // { is on a separate line — standard multi-line block
      const { body, consumed } = collectCBlock(lines, nextIdx);
      return { body, advance: consumed };
    }
  }

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i++;
    if (!line) continue;

    // ── if / else-if / else ──────────────────────────────────────────────
    const ifM = line.match(/^(?:else\s+)?if\s*\(([^)]{1,80})\)/);
    if (ifM) {
      const isElseIf = line.startsWith("else");
      const cond = sanitizeCLabel(ifM[1].trim().substring(0, 60));

      const { body: yesBody, advance: adv1 } = getBlock(line, i);
      i += adv1;

      // Peek for else / else-if
      let noBody = [],
        adv2 = 0;
      while (i < lines.length && lines[i].trim() === "") i++;

      if (i < lines.length) {
        const nextLine = lines[i].trim();
        if (nextLine.match(/^else\s+if\b/)) {
          // Recurse: consume all remaining else-if / else chains
          const remaining = analyzeCLines(lines.slice(i));
          noBody = remaining;
          adv2 = lines.length - i;
        } else if (
          nextLine === "else" ||
          nextLine.startsWith("else ") ||
          nextLine.startsWith("else{")
        ) {
          i++; // consume the else line
          const { body: eb, advance: ea } = getBlock(
            lines[i - 1] === raw ? line : lines[i - 1],
            i
          );
          // Re-do: we consumed the else line, now collect its block
          const elseLine = lines[i - 1];
          const { body: elseBody, advance: elseAdv } = getBlock(elseLine, i);
          noBody = analyzeCLines(elseBody);
          adv2 = elseAdv;
        }
        i += adv2;
      }

      nodes.push({
        type: "decision",
        label: cond,
        yesBranch: analyzeCLines(yesBody),
        noBranch: noBody,
      });
      continue;
    }

    // ── for loop ────────────────────────────────────────────────────────
    const forM = line.match(/^for\s*\(([^;]*);([^;]*);([^)]*)\)/);
    if (forM) {
      const cond =
        sanitizeCLabel(forM[2].trim().substring(0, 40)) || "condition";
      const { body, advance } = getBlock(line, i);
      i += advance;
      nodes.push({
        type: "loop",
        label: `For: ${cond}`,
        kind: "for",
        body: analyzeCLines(body),
      });
      continue;
    }

    // ── while loop ───────────────────────────────────────────────────────
    const whileM = line.match(/^while\s*\(([^)]{1,60})\)/);
    if (whileM && !line.startsWith("do")) {
      const cond = sanitizeCLabel(whileM[1].trim().substring(0, 40));
      const { body, advance } = getBlock(line, i);
      i += advance;
      nodes.push({
        type: "loop",
        label: `While: ${cond}`,
        kind: "while",
        body: analyzeCLines(body),
      });
      continue;
    }

    // ── do-while ────────────────────────────────────────────────────────
    if (line === "do" || line === "do {" || line.startsWith("do{")) {
      const { body, advance } = getBlock(line, i);
      i += advance;
      // Consume the while(...); line
      while (i < lines.length && !lines[i].includes("while")) i++;
      if (i < lines.length) i++;
      nodes.push({
        type: "loop",
        label: "do...while loop",
        kind: "do-while",
        body: analyzeCLines(body),
      });
      continue;
    }

    // ── switch ───────────────────────────────────────────────────────────
    const switchM = line.match(/^switch\s*\(([^)]{1,40})\)/);
    if (switchM) {
      const expr = sanitizeCLabel(switchM[1].trim().substring(0, 30));
      const { body, advance } = getBlock(line, i);
      i += advance;
      const cases = extractCSwitchCases(body);
      nodes.push({ type: "switch", label: `Switch on ${expr}`, cases });
      continue;
    }

    // Skip standalone braces
    if (line === "{" || line === "}" || line === "};") continue;

    // ── Statement node ───────────────────────────────────────────────────
    const node = matchCLine(line);
    if (node) nodes.push(node);
  }

  return nodes;
}

/** Match a single C line against C_PATTERNS. */
function matchCLine(line) {
  for (const { re, skip, type, label } of C_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    if (skip) return null;
    return { type, label: label(m).substring(0, 50) };
  }
  return null;
}

/** Collect the body of a { } block starting from lines[startIdx].
 *  Handles three forms:
 *    (A) Single-line:  {  stmt;  }
 *    (B) Brace on same line as keyword:  if(x) { stmt; }
 *    (C) Standard multi-line:  \n{\n  stmt;\n}
 */
function collectCBlock(lines, startIdx) {
  let i = startIdx;

  // Skip to line that contains the opening brace
  while (i < lines.length && !lines[i].includes("{")) i++;
  if (i >= lines.length) return { body: [], consumed: 0 };

  const openLine = lines[i].trim();

  // Count { and } on this line to detect single-line blocks
  let opens = 0,
    closes = 0;
  for (const ch of openLine) {
    if (ch === "{") opens++;
    else if (ch === "}") closes++;
  }

  if (opens > 0 && opens === closes) {
    // Form (A) or (B): entire block fits on one line — extract between { and }
    // Handle nested: find content between outermost braces
    let depth2 = 0,
      inner = "",
      inBlock = false;
    for (const ch of openLine) {
      if (ch === "{") {
        depth2++;
        if (depth2 === 1) {
          inBlock = true;
          continue;
        }
      } else if (ch === "}") {
        depth2--;
        if (depth2 === 0) break;
      }
      if (inBlock) inner += ch;
    }
    inner = inner.trim();
    return { body: inner ? [inner] : [], consumed: i + 1 - startIdx };
  }

  // Form (C): multi-line block
  // Grab any content that follows { on the opening line
  const afterBrace = openLine.replace(/^[^{]*\{/, "").trim();
  i++;

  const body = [];
  if (afterBrace && !afterBrace.startsWith("}")) body.push(afterBrace);

  let depth = 1;
  while (i < lines.length && depth > 0) {
    const l = lines[i];
    let newDepth = depth;
    for (const ch of l) {
      if (ch === "{") newDepth++;
      else if (ch === "}") newDepth--;
    }
    if (newDepth > 0) {
      body.push(l);
    } else {
      // Closing line — grab any content that precedes the }
      const beforeClose = l.replace(/\}[^}]*$/, "").trim();
      if (beforeClose) body.push(beforeClose);
    }
    depth = newDepth;
    i++;
  }

  return { body, consumed: i - startIdx };
}

/** Extract switch cases from body lines. */
function extractCSwitchCases(lines) {
  const cases = [];
  let currentCase = null;

  for (const line of lines) {
    const t = line.trim();
    const caseM = t.match(/^case\s+(.+?)\s*:/);
    const isDefault = /^default\s*:/.test(t);

    if (caseM || isDefault) {
      if (currentCase) cases.push(currentCase);
      currentCase = { label: caseM ? caseM[1] : "default", bodyLines: [] };
      // Content after the colon on same line
      const after = t.replace(/^(?:case\s+.+?|default)\s*:/, "").trim();
      if (after) currentCase.bodyLines.push(after);
      continue;
    }
    if (currentCase) currentCase.bodyLines.push(line);
  }
  if (currentCase) cases.push(currentCase);

  return cases.map((c) => ({
    label: c.label,
    body: analyzeCLines(c.bodyLines.filter((l) => !/^\s*break\s*;/.test(l))),
  }));
}

/** Generate structured text summary for C code. */
function generateCSummary(cfgNodes) {
  const lines = ["=== PRE-ANALYZED CODE STRUCTURE ===", "Language: c\n"];
  let hasDecision = false,
    hasLoop = false,
    hasSwitch = false;

  function serialize(node, depth) {
    const ind = "  ".repeat(depth);
    switch (node.type) {
      case "process":
      case "io":
      case "output":
        lines.push(`${ind}→ [${node.type.toUpperCase()}] ${node.label}`);
        break;
      case "return":
        lines.push(`${ind}→ [RETURN] ${node.label}`);
        break;
      case "function":
        lines.push(`\n${ind}[FUNCTION: ${node.label}]:`);
        (node.body || []).forEach((n) => serialize(n, depth + 1));
        break;
      case "decision":
        hasDecision = true;
        lines.push(`\n${ind}[IF (${node.label})]:`);
        lines.push(`${ind}  YES →`);
        if (node.yesBranch && node.yesBranch.length > 0)
          node.yesBranch.forEach((n) => serialize(n, depth + 2));
        else lines.push(`${ind}    (empty)`);
        if (node.noBranch && node.noBranch.length > 0) {
          lines.push(`${ind}  NO →`);
          node.noBranch.forEach((n) => serialize(n, depth + 2));
        } else lines.push(`${ind}  NO → (continue)`);
        break;
      case "loop":
        hasLoop = true;
        lines.push(`\n${ind}[LOOP - ${node.label}]:`);
        (node.body || []).forEach((n) => serialize(n, depth + 1));
        lines.push(`${ind}  (back to loop condition)`);
        break;
      case "switch":
        hasSwitch = true;
        lines.push(`\n${ind}[SWITCH: ${node.label}]:`);
        (node.cases || []).forEach((c) => {
          lines.push(`${ind}  CASE ${c.label}:`);
          (c.body || []).forEach((n) => serialize(n, depth + 2));
        });
        break;
    }
  }

  // Top-level sequential vs. structural
  const topSeq = cfgNodes.filter((n) =>
    ["process", "io", "output", "return"].includes(n.type)
  );
  const topStruct = cfgNodes.filter(
    (n) => !["process", "io", "output", "return"].includes(n.type)
  );

  if (topSeq.length > 0) {
    lines.push("[SEQUENTIAL STEPS]:");
    topSeq.forEach((s, i) =>
      lines.push(`  Step ${i + 1}: [${s.type.toUpperCase()}] ${s.label}`)
    );
  }
  topStruct.forEach((n) => serialize(n, 0));

  lines.push("\n[FLOWCHART STRUCTURE HINT]:");
  lines.push("  Flow: Start → steps in order → End");
  if (hasDecision)
    lines.push(
      "  Decisions: diamond shape; both YES and NO paths must reach End"
    );
  if (hasLoop)
    lines.push("  Loops: body executes, then arrow back to condition check");
  if (hasSwitch)
    lines.push("  Switch: fan out to each CASE, all paths converge at End");
  lines.push("\n=== END PRE-ANALYSIS ===");
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PYTHON ANALYZER  (regex-based — indentation-based language)
// ═══════════════════════════════════════════════════════════════════════════════

function analyzePython(code) {
  const PY = [
    { re: /^\s*import\s+|^\s*from\s+\w+\s+import/, skip: true },
    {
      re: /open\s*\(\s*['"]([^'"]+)['"],\s*['"]([wrba]+)['"]/,
      type: "io",
      label: (m) => `Open file: ${m[1]} (${m[2]})`,
    },
    {
      re: /print\s*\(\s*f?['"]([^'"]{1,50})/,
      type: "output",
      label: (m) => `Print: ${m[1].substring(0, 40)}`,
    },
    {
      re: /print\s*\((.{0,40})\)/,
      type: "output",
      label: (m) =>
        `Print: ${m[1].replace(/['"]/g, "").trim().substring(0, 35)}`,
    },
    {
      re: /input\s*\(\s*['"]([^'"]{0,40})['"]/,
      type: "io",
      label: (m) => `Input: ${m[1]}`,
    },
    {
      re: /raise\s+(\w+(?:Error|Exception))/,
      type: "throw",
      label: (m) => `Raise ${m[1]}`,
    },
    {
      re: /requests\.(get|post|put|delete)\s*\(\s*['"]([^'"]{0,40})['"]/,
      type: "io",
      label: (m) => `${m[1].toUpperCase()} ${m[2].substring(0, 30)}`,
    },
    {
      re: /return\s+(.{1,40})/,
      type: "return",
      label: (m) => `Return ${m[1].trim().substring(0, 30)}`,
    },
  ];
  const sequential = [];
  const conditionals = [];
  const loops = [];
  const tryCatch = [];
  let lastLabel = null;
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const ifM = t.match(/^if\s+(.{1,60}):/);
    if (ifM) {
      conditionals.push({ condition: ifM[1].substring(0, 50) });
      continue;
    }
    const forM = t.match(/^for\s+(\w+)\s+in\s+(.{1,40}):/);
    if (forM) {
      loops.push({ label: `For ${forM[1]} in ${forM[2].substring(0, 30)}` });
      continue;
    }
    const whileM = t.match(/^while\s+(.{1,40}):/);
    if (whileM) {
      loops.push({ label: `While: ${whileM[1].substring(0, 40)}` });
      continue;
    }
    if (/^try:/.test(t)) {
      tryCatch.push({ has: true });
      continue;
    }
    for (const { re, skip, type, label } of PY) {
      const m = t.match(re);
      if (!m) continue;
      if (skip) break;
      const text = label(m).substring(0, 48);
      if (text && text !== lastLabel) {
        sequential.push({ type, label: text });
        lastLabel = text;
      }
      break;
    }
  }
  const lines2 = ["=== PRE-ANALYZED CODE STRUCTURE ===", "Language: python\n"];
  lines2.push("[SEQUENTIAL STEPS]:");
  sequential.forEach((s, i) =>
    lines2.push(`  Step ${i + 1}: [${s.type.toUpperCase()}] ${s.label}`)
  );
  if (conditionals.length > 0) {
    lines2.push("\n[CONDITIONALS]:");
    conditionals.forEach((c) =>
      lines2.push(`  if (${c.condition}): YES → ... NO → ...`)
    );
  }
  if (loops.length > 0) {
    lines2.push("\n[LOOPS]:");
    loops.forEach((l) => lines2.push(`  ${l.label}: body → check → exit`));
  }
  if (tryCatch.length > 0)
    lines2.push("\n[TRY/EXCEPT]: try body → except → End");
  lines2.push("\n=== END PRE-ANALYSIS ===");
  return {
    language: "python",
    sequential,
    events: [],
    tryCatch: [],
    conditionals,
    summary: lines2.join("\n"),
    hasStructure:
      sequential.length > 0 || conditionals.length > 0 || loops.length > 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function flatSeq(nodes) {
  const result = [];
  for (const n of nodes) {
    if (["process", "io", "output"].includes(n.type)) result.push(n);
    if (n.body) result.push(...flatSeq(n.body));
    if (n.yesBranch) result.push(...flatSeq(n.yesBranch));
    if (n.noBranch && Array.isArray(n.noBranch))
      result.push(...flatSeq(n.noBranch));
  }
  return result;
}

function flatByType(nodes, type) {
  const result = [];
  for (const n of nodes) {
    if (n.type === type) result.push(n);
    if (n.body) result.push(...flatByType(n.body, type));
    if (n.yesBranch) result.push(...flatByType(n.yesBranch, type));
    if (n.noBranch && Array.isArray(n.noBranch))
      result.push(...flatByType(n.noBranch, type));
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectLanguage(filePath = "", code = "") {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  const extMap = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    java: "java",
    rs: "rust",
    cs: "csharp",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
  };
  if (extMap[ext]) return extMap[ext];

  // Content heuristics — C before JS to avoid false positives
  if (/#include\s*[<"]/.test(code) || /^\s*int\s+main\s*\(/.test(code))
    return "c";
  if (/cout\s*<<|cin\s*>>|std::/.test(code)) return "cpp";
  if (/^public\s+class\s+\w+/m.test(code)) return "java";
  if (/^\s*def\s+\w+\s*\(/.test(code)) return "python";
  if (/require\s*\(|import\s+\w+\s+from/.test(code)) return "javascript";
  return "javascript";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * preAnalyzeCode(code, filePath?, languageHint?)
 *
 * Returns { language, sequential, events, tryCatch, conditionals, summary, hasStructure }
 *
 * Drop-in replacement for the old regex-only version.
 * Zero external dependencies — this file is entirely self-contained.
 */
function preAnalyzeCode(code, filePath = "", languageHint = "") {
  // Determine language:
  // If hint provided, use it — BUT let content heuristics win for C/C++ and Python
  // since those have very clear markers and a wrong hint causes total failure.
  let language = languageHint || detectLanguage(filePath, code);
  if (
    languageHint &&
    languageHint !== "c" &&
    languageHint !== "cpp" &&
    languageHint !== "python"
  ) {
    // Hint was given (e.g. 'javascript'), but check if content is clearly C/C++
    const contentLang = detectLanguage(filePath, code);
    if (
      contentLang === "c" ||
      contentLang === "cpp" ||
      contentLang === "python"
    ) {
      language = contentLang; // content wins — #include / int main() / def are unmistakable
    }
  }

  // ── C / C++ ──────────────────────────────────────────────────────────────
  if (language === "c" || language === "cpp") {
    try {
      return analyzeC(code);
    } catch (e) {
      console.warn("[codeAnalyzer] C analyzer error:", e.message);
      return {
        language,
        sequential: [],
        events: [],
        tryCatch: [],
        conditionals: [],
        summary: `=== PRE-ANALYZED CODE STRUCTURE ===\nLanguage: ${language}\n(analysis failed — sending raw code)\n=== END PRE-ANALYSIS ===`,
        hasStructure: false,
      };
    }
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (language === "python") {
    return analyzePython(code);
  }

  // ── JavaScript / TypeScript (full AST pipeline) ──────────────────────────
  try {
    const tokens = tokenize(code);
    const tree = parseBlocks(tokens);
    const cfgNodes = buildCFG(tree);
    const summary = generateJsSummary(cfgNodes, language);

    const sequential = cfgNodes.filter((n) =>
      ["process", "io", "output"].includes(n.type)
    );
    const events = cfgNodes
      .filter((n) => n.type === "event")
      .map((n) => ({
        obj: n.obj,
        event: n.event,
        steps: (n.body || []).filter((b) =>
          ["process", "io", "output"].includes(b.type)
        ),
      }));
    const tryCatch = cfgNodes
      .filter((n) => n.type === "tryCatch")
      .map((n) => ({
        trySteps: (n.tryBody || []).filter((b) =>
          ["process", "io", "output"].includes(b.type)
        ),
        catchParam: n.catchParam || "e",
        catchSteps: (n.catchBody || []).filter((b) =>
          ["process", "io", "output"].includes(b.type)
        ),
      }));
    const conditionals = cfgNodes
      .filter((n) => n.type === "decision")
      .map((n) => ({
        condition: n.label,
        trueSteps: (n.yesBranch || []).filter((b) =>
          ["process", "io", "output"].includes(b.type)
        ),
        falseSteps: (n.noBranch || []).filter((b) =>
          ["process", "io", "output"].includes(b.type)
        ),
      }));

    return {
      language,
      sequential,
      events,
      tryCatch,
      conditionals,
      cfgNodes,
      summary: summary.text,
      hasStructure:
        sequential.length > 0 || events.length > 0 || cfgNodes.length > 0,
    };
  } catch (e) {
    console.warn(
      "[codeAnalyzer] JS pipeline error:",
      e.message,
      "— using regex fallback"
    );
    return jsRegexFallback(code, language);
  }
}

/** Regex fallback for JS if the AST pipeline fails on malformed code. */
function jsRegexFallback(code, language) {
  const SIMPLE = [
    {
      re: /createReadStream\s*\(\s*['"`]([^'"`]+)['"`]/,
      type: "io",
      label: (m) => `Create read stream: ${m[1]}`,
    },
    {
      re: /createWriteStream\s*\(\s*['"`]([^'"`]+)['"`]/,
      type: "io",
      label: (m) => `Create write stream: ${m[1]}`,
    },
    {
      re: /(\w+)\.pipe\s*\(\s*(\w+)/,
      type: "process",
      label: (m) => `Pipe ${m[1]} to ${m[2]}`,
    },
    {
      re: /console\.\w+\s*\(\s*['"`]([^'"`]{1,60})['"`]/,
      type: "output",
      label: (m) => `Log: ${m[1].substring(0, 45)}`,
    },
    {
      re: /fetch\s*\(\s*['"`]([^'"`]{1,50})['"`]/,
      type: "io",
      label: (m) =>
        `Fetch ${m[1].replace(/^https?:\/\//, "").substring(0, 35)}`,
    },
  ];
  const sequential = [];
  let last = null;
  for (const line of code.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//") || /\.\s*on\s*\(/.test(t)) continue;
    for (const { re, type, label } of SIMPLE) {
      const m = t.match(re);
      if (!m) continue;
      const text = label(m).substring(0, 48);
      if (text && text !== last) {
        sequential.push({ type, label: text });
        last = text;
      }
      break;
    }
  }
  const summary = `=== PRE-ANALYZED CODE STRUCTURE ===\nLanguage: ${language}\n\n[SEQUENTIAL STEPS]:\n${
    sequential
      .map((s, i) => `  Step ${i + 1}: [${s.type.toUpperCase()}] ${s.label}`)
      .join("\n") || "  (none detected)"
  }\n\n=== END PRE-ANALYSIS ===`;
  return {
    language,
    sequential,
    events: [],
    tryCatch: [],
    conditionals: [],
    summary,
    hasStructure: sequential.length > 0,
  };
}

module.exports = { preAnalyzeCode, detectLanguage };
