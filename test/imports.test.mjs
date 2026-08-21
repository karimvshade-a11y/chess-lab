/**
 * Catches identifiers used from our own modules but never imported.
 *
 * Vite does not check this: an unimported name is simply a free variable, so
 * the bundle builds cleanly and throws ReferenceError the moment that line
 * runs. Two separate blank-screen bugs in this project were exactly that —
 * `nextHint` and `toSAN` — and neither was visible until the right tab, in the
 * right state, was open in front of real data.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src");

/** Every .js/.jsx under src. */
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.jsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/** Named exports declared by one of our modules. */
function exportsOf(file) {
  const s = fs.readFileSync(file, "utf8");
  const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

// Every name our own modules export, pooled.
const owned = new Set();
for (const f of files) for (const n of exportsOf(f)) owned.add(n);

/** Identifiers a file brings in, plus anything it declares itself. */
function available(src) {
  const have = new Set();

  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s*["'][^"']+["']/g)) {
    const clause = m[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) have.add(name);
      }
    }
    const dflt = clause.replace(/\{[^}]*\}/, "").replace(/^\s*,|,\s*$/g, "").trim();
    if (dflt && /^[A-Za-z_$][\w$]*$/.test(dflt)) have.add(dflt);
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) have.add(ns[1]);
  }

  // Locally declared things shadow the module names legitimately.
  for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) have.add(m[1]);
  // Destructured locals: const { a, b } = ...
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(":").pop().trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) have.add(name);
    }
  }
  // Array destructuring, which is how every useState setter is named.
  for (const m of src.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) have.add(name);
    }
  }
  // Array destructuring in a callback parameter: `([id, name]) => ...`.
  for (const m of src.matchAll(/\(\s*\[([^\]]*)\]\s*\)\s*=>/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split("=")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) have.add(name);
    }
  }
  // Method definitions on a class: `render() {`, `componentDidCatch(a, b) {`.
  for (const m of src.matchAll(/^\s*(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) {
    have.add(m[1]);
  }
  // Function parameters, roughly: anything inside a parameter list.
  for (const m of src.matchAll(/(?:function\s*[A-Za-z_$\w]*\s*|\)\s*=>|\(\s*)\(([^()]*)\)/g)) {
    for (const part of (m[1] || "").split(",")) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) have.add(name);
    }
  }
  for (const m of src.matchAll(/\(\{([^}]*)\}\)\s*(?:=>|\{)/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/[:=]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) have.add(name);
    }
  }
  return have;
}

/**
 * Strip comments, strings and JSX text, so their contents are never read as
 * code. JSX text matters: `>Stop ({progress}%)<` otherwise looks exactly like
 * a call to a function named Stop.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    /* Regex literals too: `.split(/\n(?=\[Event )/)` contains "n(", which
       otherwise reads as a call to a function named n. Only recognised where a
       regex can legally start, so division is not mistaken for one. */
    .replace(
      /(^|[=(,:[!&|?{;\s])\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g,
      "$1/RE/"
    )
    .replace(/>([^<>]*)</g, "><");
}

let problems = [];

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const src = code(raw);
  const have = available(raw);
  const rel = path.relative(path.join(HERE, ".."), file);

  for (const name of owned) {
    if (have.has(name)) continue;

    /* Only two shapes are checked, because only these are unambiguous:
         name(...)   a call
         <Name       a JSX element
       Anything looser also matches object keys ("play: 1") and destructured
       parameters ("{ isMate, inCheck }"), which are not references at all. */
    const call = new RegExp("(^|[^.\\w$])" + name + "\\s*\\(", "m");
    const jsx = /^[A-Z]/.test(name) ? new RegExp("<" + name + "[\\s/>]", "m") : null;

    if (call.test(src)) {
      problems.push(`${rel}: calls ${name}() but never imports or declares it`);
    } else if (jsx && jsx.test(src)) {
      problems.push(`${rel}: renders <${name}> but never imports it`);
    }
  }
}

/* Language keywords and platform globals. Anything called that is not one of
   these, not declared, and not imported, does not exist. */
const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "function",
  "await", "new", "delete", "void", "in", "of", "do", "else", "yield", "throw",
  "super", "import", "export", "case", "instanceof", "async", "constructor",
  "true", "false", "null", "undefined", "this", "NaN", "Infinity",
]);
const GLOBALS = new Set([
  "Object", "Array", "String", "Number", "Boolean", "Math", "JSON", "Date",
  "Promise", "Set", "Map", "WeakMap", "Error", "TypeError", "RangeError",
  "RegExp", "Symbol", "BigInt", "Intl", "Proxy", "Reflect",
  "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
  "decodeURIComponent", "structuredClone", "queueMicrotask",
  "console", "window", "document", "navigator", "localStorage", "sessionStorage",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "fetch", "alert", "confirm",
  "FileReader", "Blob", "URL", "URLSearchParams", "AbortController",
  "MouseEvent", "KeyboardEvent", "Event", "CustomEvent", "IntersectionObserver",
  "ResizeObserver", "MutationObserver", "AudioContext", "webkitAudioContext",
  "getComputedStyle", "matchMedia", "Chessground", "require",
]);

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const src = code(raw);
  const have = available(raw);
  const rel = path.relative(path.join(HERE, ".."), file);

  const seen = new Set();
  for (const m of src.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);
    if (KEYWORDS.has(name) || GLOBALS.has(name)) continue;
    if (have.has(name) || owned.has(name)) continue;
    problems.push(`${rel}: calls ${name}() which is neither declared, imported, nor a known global`);
  }

  /* A JSX attribute bound to a bare identifier — `onClick={nextHint}`. This is
     a reference rather than a call, so the check above cannot see it, and it is
     precisely how the first blank-screen bug reached the window. */
  for (const m of src.matchAll(/=\{([A-Za-z_$][\w$]*)\}/g)) {
    const name = m[1];
    if (seen.has("attr:" + name)) continue;
    seen.add("attr:" + name);
    if (KEYWORDS.has(name) || GLOBALS.has(name)) continue;
    if (have.has(name) || owned.has(name)) continue;
    problems.push(`${rel}: passes {${name}} but nothing of that name is declared or imported`);
  }
}

if (problems.length) {
  console.log("MISSING IMPORTS\n");
  for (const p of problems) console.log("  " + p);
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}

console.log(`imports: ${files.length} files, every used name is imported or declared`);
