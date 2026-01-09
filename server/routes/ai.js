// server/routes/aiRouter.js
// Updated router: local Qwen 2.5 Coder 3B (Ollama) with Groq fallback (llama-3.1-8b then 70b)
// Requires: npm install ollama node-fetch dotenv

const express = require('express');
const router = express.Router();
const { Ollama } = require('ollama');
const fetch = require('node-fetch'); // for Groq fallback
require('dotenv').config(); // ensure .env is loaded

// Initialize Ollama client
const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  requestTimeout: 60000 // 60s default request timeout for Ollama SDK
});

// Groq configuration (fallback)
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
//const GROQ_ENDPOINT = 'https://api.groq.com/v1/chat/completions'; // generic path; adjust if Groq provides different endpoint in future
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
//const GROQ_ENDPOINT = 'https://api.groq.com/v1';

// Small utility constants
const DEFAULT_LOCAL_PRIMARY = 'qwen2.5-coder:3b';
const DEFAULT_LOCAL_FALLBACK = 'qwen2.5-coder:1.5b';
const GROQ_PRIMARY = 'llama-3.1-8b-instant';
const GROQ_SECONDARY = 'llama-3.1-70b-versatile';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds for higher-level requests

// Basic fallback suggestions if everything fails
const FALLBACK_RESPONSES = [
  "// Suggestion: break function into smaller functions for clarity.",
  "// Suggestion: add basic input validation for this function.",
  "// Suggestion: consider early returns to reduce nesting.",
  "// Suggestion: add try/catch to improve error handling.",
  "// Suggestion: improve naming for readability."
];

function getFallbackResponse() {
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

/**
 * Utility: sleep for ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Utility: run a Promise with a timeout
 */
function withTimeout(promise, ms, timeoutMessage = 'Request timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms))
  ]);
}

/**
 * Utility: Fix common Mermaid mindmap syntax issues
 * - Quotes node labels with special characters
 * - Fixes improper node formatting
 * - Removes duplicate hyphens or invalid patterns
 * - Splits multiple nodes on the same line (e.g. "- A()   \"B()\"")
 */
/**
 * Enhanced mindmap syntax fixer
 * Removes parentheses, periods, and special chars from all node labels
 * Ensures one node per line, proper indentation
 */
function fixMindmapSyntax(mermaidCode) {
  if (!mermaidCode || typeof mermaidCode !== 'string') return mermaidCode;
  
  const lines = mermaidCode.split('\n');
  const fixed = [];
  let rootFound = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (!line) continue;
    
    // Keep mindmap declaration
    if (line.toLowerCase() === 'mindmap') {
      fixed.push('mindmap');
      continue;
    }
    
    // Handle root node
    if (!rootFound && line.match(/root\(\([^)]+\)\)/i)) {
      // Extract root label
      const rootMatch = line.match(/root\(\(([^)]+)\)\)/i);
      if (rootMatch && rootMatch[1]) {
        let rootLabel = rootMatch[1]
          .replace(/[()[\]{}|;:.<>\/\\'"`,!@#$%^&*+=?]/g, '') // Remove ALL special chars
          .replace(/\s+/g, ' ')
          .trim();
        
        // Take max 2 words
        const words = rootLabel.split(' ').filter(w => w.length > 0);
        rootLabel = words.slice(0, 2).join(' ');
        
        // Default if empty
        if (!rootLabel || rootLabel.length < 2) {
          rootLabel = 'Code Structure';
        }
        
        fixed.push(`  root((${rootLabel}))`);
        rootFound = true;
      }
      continue;
    }
    
    // Split multiple nodes on same line
    const nodes = line.split(/\s{3,}/);
    
    for (const node of nodes) {
      let cleaned = node
        .replace(/^[-*•:>\s]+/, '') // Remove leading symbols
        .replace(/[()[\]{}|;:.<>\/\\'"`,!@#$%^&*+=?]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleaned) {
        // Determine indentation (default 4 spaces for children)
        const indent = '    ';
        fixed.push(`${indent}${cleaned}`);
      }
    }
  }
  
  // Ensure root exists
  if (!rootFound) {
    fixed.splice(1, 0, '  root((Code))');
  }
  
  // Ensure at least one child
  if (fixed.length < 3) {
    fixed.push('    Empty');
  }
  
  return fixed.join('\n');
}

/**
 * Helper: Quote a label if it contains special characters
 */
function quoteIfNeeded(label) {
  if (!label) return label;
  
  // If already quoted, return as is
  if (/^["'].*["']$/.test(label)) {
    return label;
  }
  
  // If label contains special characters that need quoting
  // Special characters: ()[]{}.,:;!?@#$%^&*+-=<>/|\`
  if (/[()\[\]{}.,:;!?@#$%^&*+\-=<>/|\\`]/.test(label)) {
    // Escape any quotes in the label
    label = label.replace(/"/g, '\\"');
    return `"${label}"`;
  }
  
  return label;
}

/**
 * Utility: Fix common Mermaid flowchart syntax issues
 * - Removes forbidden characters from node labels
 * - Ensures node syntax is correct: id["label"] or id{"label"}
 * - Ensures each node/edge is on its own line
 * - Fixes common formatting errors that cause parse errors
 */
/**
/**
 * PRODUCTION-READY Flowchart Fixer
 * Handles: Duplicate IDs, Nested Quotes, Special Chars, Long Labels
 */
function fixFlowchartSyntax(mermaidCode) {
  if (!mermaidCode || typeof mermaidCode !== 'string') return mermaidCode;
  
  const lines = mermaidCode.split('\n');
  const fixed = [];
  let headerFound = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (!line) continue;
    
    if (!headerFound && /^flowchart\s+(TD|LR|TB|RL)/i.test(line)) {
      fixed.push('flowchart TD');
      headerFound = true;
      continue;
    }
    
    // Fix duplicate node IDs (ALL patterns)
    line = line.replace(/\b([A-Z][A-Z0-9_]*)(\[[^\]]*\])\1\b/gi, '$1$2');
    line = line.replace(/\b([A-Z][A-Z0-9_]*)(\([^\)]*\))\1\b/gi, '$1$2');
    line = line.replace(/\b([A-Z][A-Z0-9_]*)(\{[^}]*\})\1\b/gi, '$1$2');
    line = line.replace(/\b([A-Z][A-Z0-9_]*)(\(\[[^\]]*\]\))\1\b/gi, '$1$2');
    
    // Remove ALL quotes from inside labels
    line = line.replace(/\["([^"]*)"\]/g, (match, content) => {
      const clean = content
        .replace(/["'`]/g, '') // Remove quotes
        .replace(/[()[\]{}|;:.]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 40);
      return `["${clean}"]`;
    });
    
    line = line.replace(/\{([^}]+)\}/g, (match, content) => {
      const clean = content
        .replace(/["'`]/g, '')
        .replace(/[()[\]{}|;:.]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 30);
      return `{${clean}}`;
    });
    
    line = line.replace(/\(\["([^"]*)"\]\)/g, (match, content) => {
      const clean = content
        .replace(/["'`]/g, '')
        .replace(/[()[\]{}|;:.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return `(["${clean}"])`;
    });
    
    if (line.trim()) {
      fixed.push(line);
    }
  }
  
  if (!headerFound) {
    fixed.unshift('flowchart TD');
  }
  
  return fixed.join('\n');
}

/**
 * Validate and auto-fix flowchart before returning
 */
function validateAndFixFlowchart(mermaidCode) {
  let code = mermaidCode;
  let iterations = 0;
  const maxIterations = 3;
  
  while (iterations < maxIterations) {
    iterations++;
    
    // Check for duplicate IDs pattern
    const duplicatePattern = /\b([A-Za-z0-9_]+)(\[[^\]]+\])\1(?=\s|-->|$)/;
    if (duplicatePattern.test(code)) {
      console.warn(`[Validator] Found duplicate IDs, fixing... (iteration ${iterations})`);
      code = code.replace(duplicatePattern, '$1$2');
      continue;
    }
    
    // Check for quotes inside labels
    const quotesPattern = /\["[^"]*"[^"]*"[^"]*"\]/;
    if (quotesPattern.test(code)) {
      console.warn(`[Validator] Found nested quotes, fixing... (iteration ${iterations})`);
      code = code.replace(/\["([^"]*)"/g, (match, content) => {
        const cleaned = content.replace(/["']/g, '');
        return `["${cleaned}"`;
      });
      continue;
    }
    
    // No more issues found
    break;
  }
  
  return code;
}

/**
 * Utility: extract code-only content from AI message.
 * Preferred behavior:
 * 1. If there are triple-backtick code blocks, return their contents concatenated.
 * 2. Otherwise, remove lines starting with //, #, /*, or ``` and return what's left.
 * 3. If the result is empty, return the original content as fallback.
 */
function extractCodeOnly(aiText) {
  if (!aiText || typeof aiText !== 'string') return '';

  // Find all ``` blocks (support ```lang and ``` with no lang)
  const codeBlockRegex = /```(?:[\w-]+)?\n?([\s\S]*?)```/g;
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(aiText)) !== null) {
    codeBlocks.push(match[1].trim());
  }
  if (codeBlocks.length > 0) {
    return codeBlocks.join('\n\n');
  }

  // If no fences, remove explanation lines and keep likely code lines
  const lines = aiText.split('\n');
  const filtered = lines.filter(line => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('```')) return false;
    // we keep typical code lines, including lines ending with ; or { or }
    // keep lines with parentheses (function calls), "const" "let" "var" "function", "class", import/export, return
    const likelyCodeKeywords = ['const ', 'let ', 'var ', 'function ', 'class ', 'import ', 'export ', 'return ', '=>', ';', '{', '}', 'console.', 'if(', 'if (', 'for(', 'for (', 'while(', 'try{', 'try {'];
    return likelyCodeKeywords.some(k => t.includes(k)) || /[;{}()=<>]/.test(t);
  });

  const joined = filtered.join('\n').trim();
  if (joined.length > 0) return joined;

  // As last resort return original cleaned (but not comments)
  return lines.filter(l => l.trim() !== '' && !l.trim().startsWith('```')).join('\n').trim() || aiText.trim();
}

/**
 * Helper: Run a chat completion on local Ollama using provided model and messages.
 * Returns parsed response object or throws.
 */
async function callLocalOllama(model, messages = [], options = {}) {
  try {
    const fullOptions = {
      model,
      messages,
      stream: false,
      options: options
    };

    // Some Ollama SDKs accept `options` at top-level; adapt if needed.
    const resp = await ollama.chat(fullOptions);
    return resp;
  } catch (err) {
    throw err;
  }
}

/**
 * Helper: Call Groq Chat Completion API as fallback.
 * Note: We assume the Groq endpoint accepts similar chat schema. Adjust if Groq changes API.
 */
async function callGroq(model, messages = [], options = {}) {
  if (!GROQ_API_KEY) {
    throw new Error('No Groq API key configured (GROQ_API_KEY not set).');
  }

  // Create a Groq-style chat payload (approximate)
  const payload = {
    model,
    messages: messages.map(m => {
      // Groq expects roles too; keep same schema
      return { role: m.role, content: m.content };
    }),
    max_tokens: options.max_tokens || 512,
    temperature: options.temperature !== undefined ? options.temperature : 0.2,
    top_p: options.top_p !== undefined ? options.top_p : 0.95
  };

  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    timeout: options.requestTimeout || 30000
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error: ${res.status} ${res.statusText} - ${text}`);
  }

  const json = await res.json();
  // Normalize: many chat APIs return choices[0].message.content
  const content = json.choices && json.choices[0] && (json.choices[0].message?.content || json.choices[0].text) ?
    (json.choices[0].message?.content || json.choices[0].text) :
    (json.output?.[0]?.content?.[0]?.text || JSON.stringify(json));
  return { message: { content } , raw: json };
}

/**
 * Decide which local model to use based on installed models.
 * Priority:
 *  1) qwen2.5-coder:3b
 *  2) qwen2.5-coder:1.5b
 *  3) qwen2.5:3b
 *  4) fallback to model param
 */
async function selectLocalModel(preferred = DEFAULT_LOCAL_PRIMARY) {
  try {
    const listed = (await ollama.list()).models || [];
    const names = listed.map(m => m.name || m);
    if (names.includes('qwen2.5-coder:3b')) return 'qwen2.5-coder:3b';
    if (names.includes('qwen2.5-coder:1.5b')) return 'qwen2.5-coder:1.5b';
    if (names.includes('qwen2.5:3b')) return 'qwen2.5:3b';
    // If nothing found, just return preferred (attempt to run may trigger download)
    return preferred;
  } catch (err) {
    // If ollama.list fails, still return preferred to try
    return preferred;
  }
}

/**
 * High-level inference: Try local -> local fallback -> Groq 8b -> Groq 70b
 * messages: array of {role, content}
 * options: { timeoutMs, num_predict, temperature, top_p, max_tokens }
 */
async function generateWithFallback(messages = [], options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Prepare models to attempt in order
  const localPrimary = await selectLocalModel(DEFAULT_LOCAL_PRIMARY);
  const localFallback = DEFAULT_LOCAL_FALLBACK;

  const attemptLocal = async (modelToUse) => {
    try {
      const response = await callLocalOllama(modelToUse, messages, {
        num_predict: options.num_predict || 200,
        temperature: options.temperature !== undefined ? options.temperature : 0.2,
        top_p: options.top_p !== undefined ? options.top_p : 0.95,
        top_k: options.top_k !== undefined ? options.top_k : 40
      });
      // Standardize return
      return { source: 'local', model: modelToUse, response };
    } catch (e) {
      // bubble up to the caller; they will try next fallback
      throw e;
    }
  };

  // Try primary local model
  try {
    const resp = await withTimeout(attemptLocal(localPrimary), timeoutMs, `Local model ${localPrimary} timed out after ${timeoutMs}ms`);
    return resp;
  } catch (localPrimaryErr) {
    // try local fallback
    try {
      const resp = await withTimeout(attemptLocal(localFallback), timeoutMs, `Local fallback ${localFallback} timed out`);
      return resp;
    } catch (localFallbackErr) {
      // local failed; try Groq fallback chain
      // If no Groq key, fail here
      if (!GROQ_API_KEY) {
        throw new Error(`Local models failed: ${localPrimaryErr.message}; ${localFallbackErr.message}. No Groq API key configured for cloud fallback.`);
      }

      // Try Groq 8B then 70B
      try {
        const groqResp = await withTimeout(callGroq(GROQ_PRIMARY, messages, options), timeoutMs, `Groq ${GROQ_PRIMARY} timed out`);
        return { source: 'groq', model: GROQ_PRIMARY, response: groqResp };
      } catch (g8Err) {
        try {
          const groqResp2 = await withTimeout(callGroq(GROQ_SECONDARY, messages, options), timeoutMs * 2, `Groq ${GROQ_SECONDARY} timed out`);
          return { source: 'groq', model: GROQ_SECONDARY, response: groqResp2 };
        } catch (g70Err) {
          // All fail
          throw new Error(`All model attempts failed. Local errors: ${localPrimaryErr.message}; ${localFallbackErr.message}. Groq errors: ${g8Err?.message || '8B unknown'}; ${g70Err?.message || '70B unknown'}`);
        }
      }
    }
  }
}

/**
 * Enhanced Mermaid syntax validator for flowcharts and mind maps
 * Checks for forbidden characters, correct header, and node/edge syntax
 */
/**
 * Enhanced Mermaid syntax validator for flowcharts and mind maps
 * NOW CORRECTLY validates only label content, not syntax characters
 */
function validateMermaid(mermaidCode, diagramType) {
  if (!mermaidCode || typeof mermaidCode !== 'string') {
    return { valid: false, error: 'No Mermaid code provided.' };
  }
  
  const lines = mermaidCode.split('\n').map(l => l.trim()).filter(Boolean);
  
  if (diagramType === 'flowchart') {
    // Check header
    if (!lines[0] || !lines[0].toLowerCase().startsWith('flowchart')) {
      return { valid: false, error: 'Flowchart must start with "flowchart TD" or "flowchart LR".' };
    }
    
    // Validate each line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract labels from node syntax: ["label"] or {"label"}
      const nodeLabels = line.match(/\["([^"]*)"\]|\{"([^"]*)"\}/g);
      
      if (nodeLabels) {
        for (const labelMatch of nodeLabels) {
          // Extract just the label content
          const label = labelMatch.replace(/[\[\]\{\}"]/g, '');
          
          // Check for forbidden characters ONLY in label content
          if (/[()[\]{}|]/.test(label)) {
            return { 
              valid: false, 
              error: `Forbidden characters in label "${label}". Remove: ( ) [ ] { } |` 
            };
          }
          
          // Check label length
          if (label.split(' ').length > 8) {
            return { 
              valid: false, 
              error: `Label too long: "${label.substring(0, 30)}..."` 
            };
          }
        }
      }
      
      // Check for common syntax errors
      // Unmatched brackets
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        return { valid: false, error: `Unmatched brackets in line: ${line}` };
      }
    }
    
    return { valid: true };
    
  } else if (diagramType === 'mindmap') {
    // Check header
    if (!lines[0] || lines[0].toLowerCase() !== 'mindmap') {
      return { valid: false, error: 'Mindmap must start with "mindmap".' };
    }
    
    // Check for root node
    let hasRoot = false;
    let rootLine = -1;
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].match(/root\(\([^)]+\)\)/i)) {
        hasRoot = true;
        rootLine = i;
        break;
      }
    }
    
    if (!hasRoot) {
      return { valid: false, error: 'Mindmap missing root node. Format: root((Name))' };
    }
    
    // Validate root node
    const rootMatch = lines[rootLine].match(/root\(\(([^)]+)\)\)/i);
    if (rootMatch && rootMatch[1]) {
      const rootLabel = rootMatch[1];
      
      // Check for forbidden characters in root label
      if (/[()[\]{}|;:.<>]/.test(rootLabel)) {
        return { 
          valid: false, 
          error: `Root label contains forbidden characters: "${rootLabel}"` 
        };
      }
      
      // Check if root looks like a filename
      if (/\.[a-z]{2,4}$/i.test(rootLabel) || /[\/\\]/.test(rootLabel)) {
        return { 
          valid: false, 
          error: `Root should not be a filename: "${rootLabel}". Use simple name like "Code Structure"` 
        };
      }
    }
    
    // Validate child nodes
    for (let i = rootLine + 1; i < lines.length; i++) {
      const line = lines[i];
      const content = line.trim();
      
      // Skip if empty
      if (!content) continue;
      
      // Check for multiple nodes on same line (3+ spaces between words)
      if (/\w+\s{3,}\w+/.test(content)) {
        return { 
          valid: false, 
          error: `Multiple nodes on same line ${i + 1}: "${line}". Put each on separate line.` 
        };
      }
      
      // Check for parentheses in child nodes (function syntax)
      if (!content.includes('root((') && content.includes('(')) {
        return { 
          valid: false, 
          error: `Parentheses in child node line ${i + 1}: "${content}". Remove () from names.` 
        };
      }
      
      // Check indentation (must be even number of spaces)
      const leadingSpaces = line.length - line.trimLeft().length;
      if (leadingSpaces > 0 && leadingSpaces % 2 !== 0) {
        return { 
          valid: false, 
          error: `Invalid indentation on line ${i + 1}. Use 2 spaces per level.` 
        };
      }
    }
    
    // Must have at least one child
    if (lines.length < 3) {
      return { valid: false, error: 'Mindmap has no children. Add at least one child node.' };
    }
    
    return { valid: true };
  }
  
  return { valid: false, error: 'Unknown diagram type.' };
}

/**
 * Fallback: minimal valid Mermaid diagram for flowchart or mindmap
 */
/**
 * Fallback: minimal valid Mermaid diagram
 */
function getFallbackMermaid(diagramType, errorMsg = 'Unknown error') {
  console.log(`[Fallback] Creating fallback ${diagramType}. Reason: ${errorMsg}`);
  
  if (diagramType === 'flowchart') {
    return `flowchart TD
    A(["Start"]) --> B["Analyze Code"]
    B --> C{"Valid Syntax?"}
    C -->|No| D["Use Fallback"]
    C -->|Yes| E["Render Diagram"]
    D --> F(["End"])
    E --> F`;
  } else {
    return `mindmap
  root((Code Analysis))
    Status
      Fallback Mode
    Components
      Functions
      Classes
      Variables
    Note
      Check console`;
  }
}

/* ---------------------------
   ROUTES
   ---------------------------*/

/**
 * POST /api/ai/complete
 * Expects: { code: string }
 * Returns: { suggestion: string }
 *
 * This endpoint will:
 * - create a short chat prompt telling the model to respond only with code
 * - call local Qwen model with fallback to Groq
 * - clean the response to return code-only text
 */
router.post('/complete', async (req, res) => {
  const { code } = req.body;
  console.log('[/complete] Request received. Code size:', code ? code.length : 0);

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No code provided in request body.' });
  }

  const systemPrompt = 'You are a helpful coding assistant. Respond only with the completed or improved code, no explanations.';
  const userPrompt = `Complete or improve the following code. Respond with code only (use code blocks if possible):\n\n${code}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const result = await generateWithFallback(messages, { timeoutMs: 120000, num_predict: 200, temperature: 0.2 });
    // Extract content text (different shapes for local/groq)
    let rawContent = '';
    if (result.source === 'local') {
      rawContent = result.response.message?.content || result.response.output?.[0]?.content?.[0]?.text || JSON.stringify(result.response);
    } else if (result.source === 'groq') {
      rawContent = result.response.message?.content || result.response.raw?.choices?.[0]?.text || JSON.stringify(result.response.raw);
    } else {
      rawContent = JSON.stringify(result.response);
    }

    const codeOnly = extractCodeOnly(rawContent);

    // If after extraction nothing useful, use fallback suggestion
    const suggestion = codeOnly && codeOnly.length > 5 ? codeOnly : getFallbackResponse();

    return res.json({ suggestion });
  } catch (err) {
    console.error('[complete] Error:', err);
    return res.status(500).json({
      error: 'Failed to get AI completion. Check Ollama and Groq configuration.',
      details: err.message,
      suggestion: getFallbackResponse()
    });
  }
});

/**
 * POST /api/ai/analyze-repo
 * Expects: { files: [{ path, content, language, size, updated_at, created_at }], owner: string, repo: string }
 * Returns: { success, analysis, metadata }
 *
 * This endpoint builds a long analysis prompt and requests a repository analysis.
 * It attempts local model first, then Groq fallback. Because repo analysis can be large,
 * we use longer timeouts and max tokens.
 */
router.post('/analyze-repo', async (req, res) => {
  const { files = [], owner = 'unknown', repo = 'unknown' } = req.body;

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files provided for analysis' });
  }

  try {
    console.log(`[analyze-repo] Analyzing ${owner}/${repo}. Files: ${files.length}`);

    // Build fileStructure summary
    const fileStructure = files.map(f => ({ path: f.path, language: f.language || 'unknown', size: f.size || 0 }));
    const packageFiles = {
      'package.json': files.find(f => f.path.endsWith('package.json')),
      'requirements.txt': files.find(f => f.path.endsWith('requirements.txt')),
      'pom.xml': files.find(f => f.path.endsWith('pom.xml')),
      'build.gradle': files.find(f => f.path.endsWith('build.gradle')),
      'composer.json': files.find(f => f.path.endsWith('composer.json')),
      'Gemfile': files.find(f => f.path.endsWith('Gemfile')),
      'Cargo.toml': files.find(f => f.path.endsWith('Cargo.toml'))
    };

    const getDependencies = (file) => {
      if (!file || !file.content) return [];
      try {
        if (file.path.endsWith('package.json')) {
          const pkg = JSON.parse(file.content);
          return Object.entries({
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {})
          }).map(([name, version]) => ({ name, version }));
        }
      } catch (e) {
        console.warn(`[analyze-repo] Error parsing ${file.path}:`, e.message);
      }
      return [];
    };

    const allDependencies = [];
    Object.values(packageFiles).forEach(file => {
      if (file) allDependencies.push(...getDependencies(file));
    });

    const fileTypes = files.reduce((acc, file) => {
      const extParts = (file.path || '').split('.');
      const ext = extParts.length > 1 ? extParts.pop() : 'other';
      if (!acc[ext]) acc[ext] = [];
      acc[ext].push(file);
      return acc;
    }, {});

    // directory structure (shallow)
    const dirStructure = {};
    files.forEach(file => {
      const parts = (file.path || '').split('/');
      let current = dirStructure;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        if (!current[part]) {
          current[part] = isFile ? { _type: 'file', path: file.path, language: file.language, size: file.size } : { _type: 'dir' };
        }
        if (!isFile) {
          current = current[part];
        }
      }
    });

    // Entry points heuristic
    const entryPoints = files.filter(file => /(src\/index|app\/main|src\/main|src\/app)/.test(file.path) || ['main.js','app.js','index.js','server.js'].some(n => file.path.endsWith(n))).slice(0, 6);
    const testFiles = files.filter(file => file.path.includes('test/') || file.path.includes('__tests__') || file.path.endsWith('.test.js') || file.path.endsWith('.spec.js')).slice(0, 8);
    const configFiles = files.filter(file => file.path.match(/\.(json|yaml|yml|toml|env|config|conf|rc)$/) || file.path.match(/(package\.json|webpack\.config|babel\.config|tsconfig\.json|jest\.config)/)).slice(0, 8);
    const docFiles = files.filter(file => file.path.match(/(README|CONTRIBUTING|LICENSE|CHANGELOG|CODE_OF_CONDUCT)/i)).slice(0, 6);

    // Prepare a summary prompt (trim large fields)
    const totalSizeKb = (files.reduce((sum, f) => sum + (f.size || 0), 0) / 1024).toFixed(2);
    const typesSummary = Object.entries(fileTypes).sort((a,b) => b[1].length - a[1].length).map(([ext, arr]) => `${ext} (${arr.length})`).join(', ');

    const truncatedDir = JSON.stringify(dirStructure, null, 2).slice(0, 2000); // keep within prompt size

    const analysisPrompt = `# Repository analysis request: ${owner}/${repo}

Total files: ${files.length}
Total size: ${totalSizeKb} KB
File types: ${typesSummary}
Top-level directories: ${[...new Set(files.map(f => f.path.split('/')[0]))].slice(0,10).join(', ')}

Directory structure snapshot:
\`\`\`json
${truncatedDir}
\`\`\`

Dependencies (${allDependencies.length}):
${allDependencies.length > 0 ? allDependencies.map(d => `- ${d.name} ${d.version}`).join('\n') : 'No package files parsed.'}

Entry points:
${entryPoints.length > 0 ? entryPoints.map(e => `- ${e.path}`).join('\n') : 'None found'}

Tests: ${testFiles.length}
Config files: ${configFiles.length}
Docs: ${docFiles.length}

Please provide:
1) High-level summary of project purpose.
2) Architecture and main components.
3) Dependency risks and outdated packages.
4) Quick list of highest priority improvements (security, tests, CI).
5) Example small tasks for a new contributor (3 tasks).
6) Actionable next steps for production readiness.

Be concise but thorough. Use numbered lists and code examples when required.
`;

    const messages = [
      { role: 'system', content: 'You are an expert software architect analyzing code repositories. Provide clear, actionable recommendations.' },
      { role: 'user', content: analysisPrompt }
    ];

    // This can be heavy -> allow longer timeout and more tokens
    const result = await generateWithFallback(messages, { timeoutMs: 220000, num_predict: 1500, temperature: 0.2, max_tokens: 2000 });

    // Get text
    let rawContent = '';
    if (result.source === 'local') {
      rawContent = result.response.message?.content || result.response.output?.[0]?.content?.[0]?.text || JSON.stringify(result.response);
    } else if (result.source === 'groq') {
      rawContent = result.response.message?.content || result.response.raw?.choices?.[0]?.text || JSON.stringify(result.response.raw);
    } else {
      rawContent = JSON.stringify(result.response);
    }

    // We want the AI to respond normally (analysis, not code-only)
    const analysis = rawContent;

    console.log('[analyze-repo] Analysis complete. Source:', result.source, 'Model:', result.model);

    return res.json({
      success: true,
      analysis,
      metadata: {
        totalFiles: files.length,
        fileTypes: Object.keys(fileTypes).length,
        dependencies: allDependencies.length,
        usedModel: result.model,
        source: result.source,
        analyzedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[analyze-repo] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze repository',
      details: error.message
    });
  }
});

/**
 * POST /api/ai/explain
 * Expects: { code: string }
 * Returns: { explanation: string }
 *
 * Uses local model for explanation; prefers a friendly, concise explanation
 */
router.post('/explain', async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'No code provided' });

  const messages = [
    { role: 'system', content: 'You are a helpful coding assistant. Explain the provided code in simple, clear steps.' },
    { role: 'user', content: `Explain what the following code does in simple steps. Be concise but thorough:\n\n${code}` }
  ];

  try {
    const result = await generateWithFallback(messages, { timeoutMs: 40000, num_predict: 400, temperature: 0.3 });

    let rawContent = '';
    if (result.source === 'local') {
      rawContent = result.response.message?.content || result.response.output?.[0]?.content?.[0]?.text || JSON.stringify(result.response);
    } else if (result.source === 'groq') {
      rawContent = result.response.message?.content || result.response.raw?.choices?.[0]?.text || JSON.stringify(result.response.raw);
    } else {
      rawContent = JSON.stringify(result.response);
    }

    const explanation = (rawContent && rawContent.trim()) ? rawContent.trim() : 'No explanation available.';
    return res.json({ explanation, usedModel: result.model, source: result.source });

  } catch (error) {
    console.error('[explain] Error:', error);
    return res.status(500).json({
      error: 'Failed to generate explanation',
      details: error.message,
      suggestion: 'Try a shorter code snippet or ensure local model is downloaded.'
    });
  }
});

/**
 * POST /api/ai/chat
 * Expects: { message: string, conversationHistory: [{role, content}] }
 * Returns: { response: string }
 *
 * Uses local chat model with context, falls back to Groq.
 */
router.post('/chat', async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'No message provided' });

  try {
    console.log('[chat] Message length:', message.length);

    const systemMsg = {
      role: 'system',
      content: 'You are an expert AI coding assistant integrated into an IDE. Help with code analysis, debugging, refactoring, and programming questions. Provide clear, actionable answers; use code blocks when showing code.'
    };

    const messages = [systemMsg];
    if (Array.isArray(conversationHistory)) {
      // Only keep last N messages to avoid huge context
      const trimmed = conversationHistory.slice(-12);
      messages.push(...trimmed);
    }

    messages.push({ role: 'user', content: message });

    const result = await generateWithFallback(messages, { timeoutMs: 30000, num_predict: 600, temperature: 0.6 });

    let rawContent = '';
    if (result.source === 'local') {
      rawContent = result.response.message?.content || result.response.output?.[0]?.content?.[0]?.text || JSON.stringify(result.response);
    } else if (result.source === 'groq') {
      rawContent = result.response.message?.content || result.response.raw?.choices?.[0]?.text || JSON.stringify(result.response.raw);
    } else {
      rawContent = JSON.stringify(result.response);
    }

    const aiResponse = rawContent && rawContent.trim() ? rawContent.trim() : 'I could not generate a response. Please try again.';

    return res.json({ response: aiResponse, usedModel: result.model, source: result.source });

  } catch (error) {
    console.error('[chat] Error:', error);

    const fallback = error.message && error.message.includes('timed out')
      ? 'I apologize, the request took too long. Please try again or break your request into smaller parts.'
      : 'I encountered an error while processing your request. Please try again.';

    return res.status(500).json({
      error: 'Failed to generate chat response',
      response: fallback,
      details: error.message
    });
  }
});

/**
 * POST /api/ai/generate-diagram
 * Expects: { codeContent: string, diagramType: 'flowchart' | 'mindmap' }
 * Returns: { mermaidCode: string, success: boolean }
 *
 * Converts code to Mermaid diagram format (flowchart or mindmap).
 */
router.post("/generate-diagram", async (req, res) => {
  const { codeContent, diagramType } = req.body;

  if (!codeContent || typeof codeContent !== "string") {
    return res.status(400).json({ error: "No code content provided" });
  }

  if (!diagramType || !["flowchart", "mindmap"].includes(diagramType)) {
    return res
      .status(400)
      .json({ error: 'diagramType must be "flowchart" or "mindmap"' });
  }

  try {
    console.log(
      `[generate-diagram] Generating ${diagramType} for code (${codeContent.length} chars)`
    );

    // Build prompt based on diagram type
    let systemPrompt, userPrompt;

    if (diagramType === "flowchart") {
      systemPrompt =
        "Generate Mermaid flowchart. Output ONLY flowchart code with no explanations. CRITICAL: Each node ID must appear ONCE before its label.";

      userPrompt = `Create flowchart from code.
    
    CRITICAL SYNTAX RULES:
    
    1. Start with: flowchart TD
    
    2. Node format (EXACTLY like this):
       ✅ CORRECT: A["Action"]
       ❌ WRONG: A["Action"]A
       ❌ WRONG: A[Label]A
       
    3. NO quotes inside labels:
       ✅ CORRECT: A["Process file"]
       ❌ WRONG: A["Process "file""]
       ❌ WRONG: A[Process 'file']
    
    4. Connection format:
       ✅ CORRECT: A["Start"] --> B["Process"]
       ❌ WRONG: A["Start"]A --> B["Process"]B
       
    5. Decision format:
       ✅ CORRECT: C{"Is valid?"}
       ❌ WRONG: C{"Is valid?"}C
    
    6. NO special chars in labels:
       Remove: ( ) [ ] { } | ; : . ' "
       
    7. Keep labels SHORT (max 4 words)
    
    EXAMPLE CORRECT FLOWCHART:
    flowchart TD
        A(["Start"]) --> B["Read file"]
        B --> C{"File exists?"}
        C -->|Yes| D["Process data"]
        C -->|No| E["Show error"]
        D --> F(["End"])
        E --> F
    
    COMMON MISTAKES TO AVOID:
    ❌ A[Label]A --> B[Label]  (duplicate IDs)
    ❌ A["Text with "quotes""] (quotes inside)
    ❌ A[Very long label that goes on and on] (too long)
    
    Code:
    \`\`\`
    ${codeContent.substring(0, 3000)}
    \`\`\`
    
    Output ONLY the flowchart. Each node ID appears ONCE.`;
    } else {
      systemPrompt =
        "You are an expert code analyst creating Mermaid mindmaps for developers. Your mindmaps must be clear, accurate, and helpful for understanding code structure. Output ONLY valid Mermaid mindmap syntax with NO explanations, markdown, or extra text.";

      userPrompt = `Analyze this code and create a developer-focused Mermaid mindmap showing its structure.
    
    ═══════════════════════════════════════════════════════════════
    📋 MINDMAP STRUCTURE RULES (FOLLOW EXACTLY)
    ═══════════════════════════════════════════════════════════════
    
    1️⃣ LINE 1: mindmap
    
    2️⃣ LINE 2: root((SimpleName))
       - Use 1-2 words describing the code's PURPOSE
       - NO file extensions, NO paths, NO code syntax
       - ✅ GOOD: root((User Service)), root((Data Parser)), root((API Handler))
       - ❌ WRONG: root((userService.js)), root((parse())), root((src/utils))
    
    3️⃣ FIRST LEVEL (2 spaces indent):
       Main categories that make sense for code:
       - Functions (if code has functions)
       - Classes (if code has classes)
       - Methods (for class methods)
       - Components (for React/Vue)
       - Endpoints (for API routes)
       - Modules (for imports/exports)
       - Variables (for important state/config)
       - Types (for TypeScript interfaces/types)
       - Hooks (for React hooks)
       - Utilities (for helper functions)
       - Main Flow (for procedural code)
    
    4️⃣ SECOND LEVEL (4 spaces indent):
       Actual names from code:
       - Function names WITHOUT ()
       - Class names
       - Component names
       - Variable names
       - ONE name per line
    
    5️⃣ THIRD LEVEL (6 spaces indent) - OPTIONAL:
       Brief descriptions in 2-3 words:
       - What it does, NOT how
       - Plain English only
       - Examples: "Validates input", "Fetches data", "Handles errors"
    
    ═══════════════════════════════════════════════════════════════
    🚫 FORBIDDEN (WILL CAUSE ERRORS)
    ═══════════════════════════════════════════════════════════════
    
    ❌ NO parentheses: readFile() → readFile
    ❌ NO dots: fs.readFile → readFile
    ❌ NO special chars: @, #, $, %, ^, &, *, =, +, -, <, >, /, \\, |, ;, :
    ❌ NO multiple nodes on same line
    ❌ NO quotes around node names
    ❌ NO code syntax or literals
    ❌ NO file paths or extensions
    
    ═══════════════════════════════════════════════════════════════
    📚 EXAMPLES FOR DIFFERENT CODE TYPES
    ═══════════════════════════════════════════════════════════════
    
    Example 1: Express API Server
    mindmap
      root((API Server))
        Routes
          userRoutes
          authRoutes
          dataRoutes
        Middleware
          authenticate
          validateInput
          errorHandler
        Controllers
          UserController
          AuthController
        Database
          connectDB
          UserModel
    
    Example 2: React Component
    mindmap
      root((Todo App))
        Components
          TodoList
          TodoItem
          AddTodo
        Hooks
          useTodos
          useLocalStorage
        Functions
          addTodo
          deleteTodo
          toggleComplete
        State
          todos
          filter
    
    Example 3: Python Data Processing
    mindmap
      root((Data Processor))
        Classes
          DataLoader
          DataCleaner
          DataAnalyzer
        Functions
          loadCSV
          cleanData
          analyze
          exportResults
        Variables
          CONFIG
          COLUMNS
    
    Example 4: Utility Module
    mindmap
      root((String Utils))
        Functions
          capitalize
          slugify
          truncate
          sanitize
        Helpers
          isString
          isEmpty
        Constants
          MAX_LENGTH
          SPECIAL_CHARS
    
    ═══════════════════════════════════════════════════════════════
    🎯 WHAT TO INCLUDE (Priority Order)
    ═══════════════════════════════════════════════════════════════
    
    1. **Exported items** (public API) - MOST IMPORTANT
    2. **Main functions/classes** that define the module's purpose
    3. **Important state/configuration** variables
    4. **Key imports** (if they define functionality)
    5. **Significant helper functions**
    
    What to SKIP:
    - Private/internal functions starting with _ or #
    - Simple getters/setters
    - Trivial one-liners
    - Console.logs, comments
    - Implementation details
    
    ═══════════════════════════════════════════════════════════════
    💡 ANALYSIS HINTS BY LANGUAGE
    ═══════════════════════════════════════════════════════════════
    
    JavaScript/TypeScript:
    - Look for: function, const, class, export, interface, type
    - Group: React components, hooks, utilities separately
    
    Python:
    - Look for: def, class, @decorator
    - Group: classes, functions, variables
    
    Java:
    - Look for: class, public/private methods, interfaces
    - Group: classes, methods, fields
    
    Go:
    - Look for: func, struct, interface
    - Group: functions, structs, methods
    
    ═══════════════════════════════════════════════════════════════
    📝 CODE TO ANALYZE
    ═══════════════════════════════════════════════════════════════
    
    \`\`\`
    ${codeContent.substring(0, 3000)}
    \`\`\`
    
    ═══════════════════════════════════════════════════════════════
    🎬 YOUR TASK
    ═══════════════════════════════════════════════════════════════
    
    1. Identify the code's main purpose
    2. Find key functions, classes, components
    3. Organize into logical categories
    4. Create mindmap following EXACT format above
    5. Output ONLY the mindmap code
    
    ⚠️ CRITICAL: Output format must be EXACTLY:
    mindmap
      root((TwoWords))
        Category
          item1
          item2
    
    NO explanations. NO markdown. NO extra text. ONLY the mindmap.`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    // ============================================
    // LAYER 1: AI - Get raw output
    // ============================================
    console.log("[Layer 1: AI] Generating diagram...");
    const result = await generateWithFallback(messages, {
      timeoutMs: 120000,
      num_predict: 1000,
      temperature: 0.3,
      max_tokens: 2000,
    });

    // Extract content
    let rawContent = "";
    if (result.source === "local") {
      rawContent =
        result.response.message?.content ||
        result.response.output?.[0]?.content?.[0]?.text ||
        JSON.stringify(result.response);
    } else if (result.source === "groq") {
      rawContent =
        result.response.message?.content ||
        result.response.raw?.choices?.[0]?.text ||
        JSON.stringify(result.response.raw);
    } else {
      rawContent = JSON.stringify(result.response);
    }

    console.log(
      "[Layer 1: AI] Raw output received:",
      rawContent.substring(0, 100) + "..."
    );

    // ============================================
    // LAYER 2: CLEANER - Fix syntax
    // ============================================
    console.log("[Layer 2: Cleaner] Cleaning code...");

    // Remove markdown blocks
    let mermaidCode = rawContent
      .trim()
      .replace(/```mermaid\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Ensure proper start
    const mermaidMatch = mermaidCode.match(/(flowchart|mindmap|graph)[\s\S]*/i);
    if (mermaidMatch) {
      mermaidCode = mermaidMatch[0].trim();
    } else {
      mermaidCode =
        (diagramType === "flowchart" ? "flowchart TD\n" : "mindmap\n") +
        mermaidCode;
    }

    // Apply specialized cleaning
    if (diagramType === "mindmap") {
      mermaidCode = fixMindmapSyntax(mermaidCode);
    } else if (diagramType === "flowchart") {
      mermaidCode = fixFlowchartSyntax(mermaidCode);
      mermaidCode = validateAndFixFlowchart(mermaidCode);
    }

    console.log("[Layer 2: Cleaner] Code cleaned");

    // ============================================
    // LAYER 3: VALIDATOR - Check syntax
    // ============================================
    console.log("[Layer 3: Validator] Validating...");
    const validation = validateMermaid(mermaidCode, diagramType);

    if (!validation.valid) {
      console.warn(
        "[Layer 3: Validator] ❌ Validation failed:",
        validation.error
      );

      // Use fallback
      const fallback = getFallbackMermaid(diagramType, validation.error);

      return res.json({
        success: true, // Still return success with fallback
        mermaidCode: fallback,
        diagramType,
        isFallback: true,
        validationError: validation.error,
        metadata: {
          usedModel: result.model,
          source: result.source,
          generatedAt: new Date().toISOString(),
          wasFixed: true,
        },
      });
    }

    console.log("[Layer 3: Validator] ✅ Validation passed");

    // ============================================
    // SUCCESS - Return to frontend
    // ============================================
    return res.json({
      success: true,
      mermaidCode,
      diagramType,
      isFallback: false,
      validationError: null,
      metadata: {
        usedModel: result.model,
        source: result.source,
        generatedAt: new Date().toISOString(),
        wasFixed: false,
      },
    });
  } catch (error) {
    console.error("[generate-diagram] ❌ Error:", error);

    // Return fallback on any error
    const fallback = getFallbackMermaid(diagramType, error.message);

    return res.json({
      success: true,
      mermaidCode: fallback,
      diagramType,
      isFallback: true,
      validationError: error.message,
      metadata: {
        usedModel: "error-fallback",
        source: "error-handler",
        generatedAt: new Date().toISOString(),
        wasFixed: true,
      },
    });
  }
});

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * POST /api/ai/export-diagram
 * Expects: { mermaidCode: string, format: 'png' | 'svg' | 'pdf', diagramType: 'flowchart' | 'mindmap' }
 * Returns: { url, success }
 *
 * Uses mermaid-cli to export diagrams as PNG, SVG, or PDF
 */
router.post('/export-diagram', async (req, res) => {
  const { mermaidCode, format = 'png', diagramType = 'flowchart' } = req.body;
  if (!mermaidCode || typeof mermaidCode !== 'string') {
    return res.status(400).json({ error: 'No mermaidCode provided' });
  }
  if (!['png', 'svg', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'Format must be png, svg, or pdf' });
  }
  if (!['flowchart', 'mindmap'].includes(diagramType)) {
    return res.status(400).json({ error: 'diagramType must be flowchart or mindmap' });
  }
  try {
    // Ensure tempDir exists (recursive for nested dirs)
    const tempDir = path.join(__dirname, '../../tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const fileId = 'diagram_' + Date.now();
    const mmdPath = path.join(tempDir, `${fileId}.mmd`);
    // Write Mermaid code with explicit font-family for PNG/PDF export
    // This ensures text is visible in exported images
    const fontStyle = '%%{init: {"themeVariables": {"fontFamily": "Arial, Helvetica, sans-serif", "fontSize": "18px", "fontWeight": "bold", "textColor": "#222"}}}%%\n';
    const codeWithFont = (mermaidCode.startsWith('%%{init:') ? '' : fontStyle) + mermaidCode;
    fs.writeFileSync(mmdPath, codeWithFont, 'utf8');
    const outPath = path.join(tempDir, `${fileId}.${format}`);
    // Run mermaid-cli (mmdc)
    const cmd = `mmdc -i "${mmdPath}" -o "${outPath}" -t default`;
    exec(cmd, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Export failed', details: err.message });
      }
      // Serve file URL (ensure /tmp is exposed statically in Express for download)
      return res.json({ success: true, url: `/tmp/${fileId}.${format}` });
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Export error', details: error.message });
  }
});


/* ---------------------------
   Utility endpoints (optional)
   - /models -> lists installed models via Ollama
   - /health  -> simple health check
   ---------------------------*/

/**
 * GET /api/ai/models
 * Returns: { installed: [names], defaultLocalPrimary, defaultLocalFallback }
 */
router.get('/models', async (req, res) => {
  try {
    const listed = (await ollama.list()).models || [];
    const names = listed.map(m => m.name || m);
    return res.json({
      installed: names,
      defaultLocalPrimary: DEFAULT_LOCAL_PRIMARY,
      defaultLocalFallback: DEFAULT_LOCAL_FALLBACK
    });
  } catch (err) {
    console.warn('[models] Could not list models:', err.message);
    // Return empty but still informative
    return res.status(200).json({
      installed: [],
      note: 'Could not fetch model list; is Ollama running?',
      defaultLocalPrimary: DEFAULT_LOCAL_PRIMARY,
      defaultLocalFallback: DEFAULT_LOCAL_FALLBACK
    });
  }
});

/**
 * GET /api/ai/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    localHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    groqConfigured: !!GROQ_API_KEY
  });
});

/* ---------------------------
   Export router
   ---------------------------*/
module.exports = router;
