/* PGN reader: headers, nested variations, {comments}, NAGs.
   Produces a move tree so a lesson can branch on what the user plays. */
import { parseFEN, makeMove, toSAN, uciOf, START_FEN } from "./core.js";
import { parseSAN } from "./san.js";

function tokenize(body) {
  const out = [];
  const re = /\{([^}]*)\}|\(|\)|(\$\d+)|(\d+)\.(\.\.)?|(1-0|0-1|1\/2-1\/2|\*)|([A-Za-z][A-Za-z0-9=\-+#!?]*)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) out.push({ k: "comment", v: m[1].trim() });
    else if (m[0] === "(") out.push({ k: "(" });
    else if (m[0] === ")") out.push({ k: ")" });
    else if (m[2]) out.push({ k: "nag", v: m[2] });
    else if (m[3]) continue;                       // move number
    else if (m[5]) out.push({ k: "result", v: m[5] });
    else if (m[6]) out.push({ k: "san", v: m[6] });
  }
  return out;
}

export function parsePGN(text) {
  const headers = {};
  const hre = /\[(\w+)\s+"([^"]*)"\]/g;
  let h;
  while ((h = hre.exec(text))) headers[h[1]] = h[2];

  const body = text.replace(/\[(\w+)\s+"([^"]*)"\]/g, "").trim();
  const start = headers.FEN || START_FEN;
  const root = { children: [] };
  const errors = [];

  const walk = (toks, i, pos, node) => {
    let cur = node;
    let curPos = pos;
    let prev = null;               // node the last move produced, for variations
    let prevPos = pos;

    while (i < toks.length) {
      const t = toks[i];
      if (t.k === ")") return i + 1;
      if (t.k === "(") {
        if (!prev) { i = walk(toks, i + 1, curPos, { children: [] }); continue; }
        i = walk(toks, i + 1, prevPos, prev.parentRef);
        continue;
      }
      if (t.k === "comment") { if (cur.last) cur.last.comment = t.v; else cur.pre = t.v; i++; continue; }
      if (t.k === "nag") { if (cur.last) cur.last.nag = t.v; i++; continue; }
      if (t.k === "result") { i++; continue; }
      if (t.k === "san") {
        const mv = parseSAN(curPos, t.v);
        if (!mv) { errors.push(`illegal SAN "${t.v}" at ${curPos.turn === "w" ? "white" : "black"} move ${curPos.full}`); return toks.length; }
        const child = {
          san: toSAN(curPos, mv), uci: uciOf(mv), move: mv,
          before: curPos, children: [], parentRef: cur,
        };
        cur.children.push(child);
        prev = child; prevPos = curPos;
        curPos = makeMove(curPos, mv);
        child.after = curPos;
        cur = child; cur.last = child;
        i++; continue;
      }
      i++;
    }
    return i;
  };

  walk(tokenize(body), 0, parseFEN(start), root);
  return { headers, start, root, errors };
}

/* Flatten the main line (first child at each step). */
export function mainline(tree) {
  const out = [];
  let n = tree.root;
  while (n.children.length) { n = n.children[0]; out.push(n); }
  return out;
}
