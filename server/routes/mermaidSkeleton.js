"use strict";
/**
 * mermaidSkeleton.js  v3  — clean recursive CFG → Mermaid converter
 *
 * One-pass recursive walk. Each node produces exactly one Mermaid node ID.
 * Returns "open exits" (IDs not yet connected) that the caller chains to next.
 *
 * Eliminates the LLM's need to:
 *   - Parse custom [PROCESS] / [IF] / [LOOP] tags
 *   - Decide which shape to use per type
 *   - Construct loop-back edges
 *   - Merge branches
 */

let _seq = 0;
const nid = (p) => `${p}${++_seq}`;

/** Strip chars that break Mermaid label syntax */
function safe(text = "") {
  return text
    .replace(/\[([^\]]+)\]/g, "($1)") // a[j] → a(j)
    .replace(/["\\`]/g, "")
    .replace(/[{}|;]/g, "")
    .trim()
    .substring(0, 48);
}

/** Emit one Mermaid node definition */
function def(id, type, label) {
  const l = safe(label);
  switch (type) {
    case "io":
    case "output":
      return `  ${id}[/"${l}"/]`;
    case "terminator":
      return `  ${id}(["${l}"])`;
    default:
      return `  ${id}["${l}"]`;
  }
}

/**
 * walk(nodes, lines, openExits, label)
 *
 * @param nodes      CFGNode[]  to process
 * @param lines      string[]   Mermaid lines accumulator
 * @param openExits  {id,label}[] — "dangling" exits that connect to the 1st node of this batch
 * @returns          {id,label}[] — dangling exits after processing all nodes
 */
function walk(nodes, lines, openExits) {
  let exits = openExits;

  for (const node of nodes) {
    // helper: connect current exits into a new node
    function enter(toId, edgeLabelOverride) {
      for (const { id, label } of exits) {
        const lbl = edgeLabelOverride !== undefined ? edgeLabelOverride : label;
        lines.push(lbl ? `  ${id} -->|${lbl}| ${toId}` : `  ${id} --> ${toId}`);
      }
    }

    // ── Inline body (function definition) ──────────────────────────────
    if (node.type === "function") {
      exits = walk(node.body || [], lines, exits);
      continue;
    }

    // ── Sequential node ────────────────────────────────────────────────
    if (["process", "io", "output", "return", "throw"].includes(node.type)) {
      const id = nid("N");
      lines.push(def(id, node.type, node.label));
      enter(id);
      exits = [{ id, label: "" }];
      if (node.type === "return" || node.type === "throw") {
        for (const { id: eid } of exits) lines.push(`  ${eid} --> Z`);
        exits = [];
      }
      continue;
    }

    // ── Decision ───────────────────────────────────────────────────────
    if (node.type === "decision") {
      const did = nid("D");
      lines.push(`  ${did}{"${safe(node.label)}?"}`);
      enter(did);

      const yesExits = walk(node.yesBranch || [], lines, [
        { id: did, label: "Yes" },
      ]);
      const noExits = walk(node.noBranch || [], lines, [
        { id: did, label: "No" },
      ]);

      exits = [...yesExits, ...noExits];
      continue;
    }

    // ── Loop ───────────────────────────────────────────────────────────
    if (node.type === "loop") {
      const lid = nid("L");
      lines.push(`  ${lid}{"${safe(node.label)}?"}`);
      enter(lid);

      // Body (Yes branch) — exits of body loop back to condition
      const bodyExits = walk(node.body || [], lines, [
        { id: lid, label: "Yes" },
      ]);
      for (const { id } of bodyExits) lines.push(`  ${id} --> ${lid}`);

      // After loop: No exits continue to next sibling
      exits = [{ id: lid, label: "No" }];
      continue;
    }

    // ── Try/Catch ──────────────────────────────────────────────────────
    if (node.type === "tryCatch") {
      const tid = nid("T");
      lines.push(`  ${tid}["Try block"]`);
      enter(tid);

      const tryExits = walk(node.tryBody || [], lines, [
        { id: tid, label: "" },
      ]);
      const catchId = nid("C");
      lines.push(`  ${catchId}["Catch: ${safe(node.catchParam || "error")}"]`);
      lines.push(`  ${tid} -->|Error| ${catchId}`);
      const catchExits = walk(node.catchBody || [], lines, [
        { id: catchId, label: "" },
      ]);

      exits = [...tryExits, ...catchExits];
      continue;
    }

    // ── Switch ─────────────────────────────────────────────────────────
    if (node.type === "switch") {
      const swid = nid("SW");
      lines.push(`  ${swid}{"${safe(node.label)}"}`);
      enter(swid);

      const allExits = [];
      for (const cas of node.cases || []) {
        const caseExits = walk(
          [
            { type: "process", label: `Case: ${safe(cas.label)}` },
            ...(cas.body || []),
          ],
          lines,
          [{ id: swid, label: safe(cas.label) }]
        );
        allExits.push(...caseExits);
      }
      exits = allExits;
      continue;
    }

    // ── Event handler ──────────────────────────────────────────────────
    if (node.type === "event") {
      const hid = nid("H");
      lines.push(`  ${hid}["${safe(node.obj)}.on('${safe(node.event)}')"]`);
      enter(hid);
      const bodyExits = walk(node.body || [], lines, [{ id: hid, label: "" }]);
      for (const { id } of bodyExits) lines.push(`  ${id} --> Z`);
      exits = [];
      continue;
    }
  }

  return exits;
}

/**
 * generateMermaidSkeleton(cfgNodes) → complete Mermaid string
 */
function generateMermaidSkeleton(cfgNodes) {
  _seq = 0;
  const lines = ["flowchart TD", '  S(["Start"])', '  Z(["End"])'];

  const finalExits = walk(cfgNodes || [], lines, [{ id: "S", label: "" }]);

  // Connect remaining open exits to End
  for (const { id, label } of finalExits) {
    if (id === "Z") continue;
    lines.push(label ? `  ${id} -->|${label}| Z` : `  ${id} --> Z`);
  }

  // Deduplicate
  const seen = new Set();
  return lines
    .filter((l) => {
      if (seen.has(l)) return false;
      seen.add(l);
      return true;
    })
    .join("\n");
}

module.exports = { generateMermaidSkeleton };
