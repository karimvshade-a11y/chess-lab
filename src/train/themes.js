/**
 * What each tactical theme actually means.
 *
 * The puzzle database tags positions but explains nothing, so solving it teaches
 * pattern recognition by brute repetition alone. These are the explanations a
 * coach would give: what the pattern is, and the habit that makes you spot it
 * next time. `look` is deliberately phrased as something to do before you move.
 */

export const THEMES = {
  fork: {
    name: "Fork",
    what: "One piece attacks two or more enemy pieces at once. They cannot both move, so one of them falls.",
    look: "Knights fork best. Before you move, check every square a knight can reach that touches two loose pieces — especially king and queen, or king and rook.",
  },
  pin: {
    name: "Pin",
    what: "A piece cannot move because something more valuable sits behind it. A pin against the king is absolute: moving is illegal, not merely bad.",
    look: "Line up your bishops, rooks and queen with the enemy king or queen. A pinned piece stops defending anything — treat it as if it were not on the board.",
  },
  skewer: {
    name: "Skewer",
    what: "A pin the other way round: the valuable piece is in front and must move, so the one behind it is lost.",
    look: "Look for enemy king and queen, or queen and rook, on the same line with nothing between them. Then check whether you can attack along that line.",
  },
  discoveredAttack: {
    name: "Discovered attack",
    what: "Moving one piece uncovers an attack from another behind it. Two threats appear from one move.",
    look: "When your own piece blocks your bishop, rook or queen, ask what would happen if it simply stepped aside — and whether it can leave with a threat of its own.",
  },
  doubleCheck: {
    name: "Double check",
    what: "Two pieces give check at once. Blocking and capturing both is impossible, so the king must move.",
    look: "It arrives through a discovered check where the moving piece also gives check. Devastating because no defence except a king move exists.",
  },
  hangingPiece: {
    name: "Hanging piece",
    what: "A piece is simply undefended and can be taken for free.",
    look: "After every opponent move, scan for what is now undefended — theirs and yours. Most club games are decided by pieces left en prise, not by deep combinations.",
  },
  deflection: {
    name: "Deflection",
    what: "A defending piece is dragged away from the job it was doing, usually by an offer it cannot refuse.",
    look: "Find the piece holding their position together, then look for a check or capture that forces it to move somewhere else.",
  },
  attraction: {
    name: "Attraction",
    what: "A piece — often the king — is lured onto a square where a tactic works, usually by a sacrifice.",
    look: "If a fork or skewer would win but for the king standing on the wrong square, see whether a check or capture can drag it onto the right one.",
  },
  clearance: {
    name: "Clearance",
    what: "Your own piece is in the way. It moves, often with a threat or a sacrifice, so the line opens for the piece behind it.",
    look: "When a line would be winning if only your own man were not on it, look for a way to move him with tempo.",
  },
  interference: {
    name: "Interference",
    what: "A piece is dropped between two enemy pieces, cutting the defender off from what it protects.",
    look: "Rare and beautiful. Look for a defender guarding along a line, then for a square in between where you can plant something.",
  },
  xRayAttack: {
    name: "X-ray",
    what: "A piece attacks through another piece, so the attack matters the moment the blocker leaves.",
    look: "Count attackers and defenders including the ones behind. A rook behind a rook is still doing work.",
  },
  backRankMate: {
    name: "Back rank mate",
    what: "The king is trapped on its own back rank by its own pawns, and a rook or queen arriving there is mate.",
    look: "Count the escape squares of both kings. If your own back rank is loose, spend the move on a luft (h3 or g3) before you need it.",
  },
  smotheredMate: {
    name: "Smothered mate",
    what: "The king is boxed in entirely by its own pieces and a knight delivers mate. Nothing can capture, nothing can block.",
    look: "The classic pattern is queen sacrifice on g8 followed by Nf7. Learn it once and you will see it forever.",
  },
  doubleBishopMate: {
    name: "Two bishops mate",
    what: "Two bishops on adjacent diagonals cover every escape square around the king.",
    look: "Bishops mate on the edges once the king has no flight squares. Ask what the king's own pieces are blocking.",
  },
  hookMate: {
    name: "Hook mate",
    what: "Rook, knight and a pawn combine: the rook checks, the knight guards the rook, and the pawn takes the last flight square.",
    look: "A common finish after a kingside attack with a pawn on h6 or g6.",
  },
  anastasiaMate: {
    name: "Anastasia's mate",
    what: "A knight takes the escape squares while a rook mates along the file beside the king.",
    look: "Needs the knight on e7 (or the mirror) and a rook able to reach the h-file.",
  },
  arabianMate: {
    name: "Arabian mate",
    what: "Rook and knight together mate a king in the corner — the knight guards the rook and covers the flight square.",
    look: "Knight on f6 with rook on h7 against a king on h8 is the picture to remember.",
  },
  bodenMate: {
    name: "Boden's mate",
    what: "Two bishops on crossing diagonals mate a castled king, usually after the queenside file is opened.",
    look: "Arises after a sacrifice that strips the king's cover on c-file castling.",
  },
  sacrifice: {
    name: "Sacrifice",
    what: "Material is given up for something worth more: mate, a decisive attack, or a piece back with interest.",
    look: "Before rejecting a capture as 'losing material', check every forcing follow-up. Sacrifices are found by looking at checks first.",
  },
  promotion: {
    name: "Promotion",
    what: "A pawn reaches the eighth rank and becomes a queen — or, when a queen would stalemate or a knight forks, something else.",
    look: "Count the race. Whoever queens first with check usually wins the endgame.",
  },
  underPromotion: {
    name: "Underpromotion",
    what: "Promoting to knight, rook or bishop instead of queen, because the queen would be worse.",
    look: "Almost always either a knight arriving with a fork, or a rook avoiding stalemate.",
  },
  trappedPiece: {
    name: "Trapped piece",
    what: "A piece has no safe squares. It is lost even though nothing is attacking it yet.",
    look: "Bishops that grab a wing pawn and knights on the rim are the usual victims. Count a piece's escape squares before you send it in.",
  },
  defensiveMove: {
    name: "Defensive move",
    what: "The position needs holding, not winning. One move keeps you alive; everything else loses.",
    look: "When you are worse, look for your opponent's threat first and ask what single move stops it.",
  },
  quietMove: {
    name: "Quiet move",
    what: "No check, no capture, no threat — yet it is the only move that works, usually because it creates an unstoppable threat.",
    look: "The hardest thing to find. When all the forcing tries fall short, look for the move that simply improves your worst piece.",
  },
  zugzwang: {
    name: "Zugzwang",
    what: "Every legal move makes the position worse. The obligation to move is itself the losing factor.",
    look: "Mostly an endgame idea. If your opponent has no useful move, look for a waiting move rather than forcing matters.",
  },
  intermezzo: {
    name: "In-between move",
    what: "Instead of recapturing straight away, a stronger threat is inserted first. The recapture waits.",
    look: "Whenever a trade seems automatic, ask whether a check or bigger threat comes first. Also called zwischenzug.",
  },
  exposedKing: {
    name: "Exposed king",
    what: "The king has lost its cover and is open to checks along the newly opened lines.",
    look: "Bring more attackers than they have defenders and open lines toward the king, even at the cost of a pawn.",
  },
  attackingF2F7: {
    name: "The f7 square",
    what: "f7 (and f2) is defended only by the king at the start, which makes it the natural target of every early attack.",
    look: "Watch for two pieces converging on it — the bishop on c4 with a knight on g5 is the classic pairing.",
  },
  kingsideAttack: {
    name: "Kingside attack",
    what: "A direct assault on the castled king, usually with pieces and pawns aimed at h7, g7 and f7.",
    look: "Count attackers versus defenders. If you have more pieces pointing at their king, open a line and go.",
  },
  queensideAttack: {
    name: "Queenside attack",
    what: "The same idea aimed at a king that castled long, or a pawn storm to win material there.",
    look: "Slower than a kingside attack and usually about creating a passed pawn or opening the c-file.",
  },
  advancedPawn: {
    name: "Advanced pawn",
    what: "A pawn deep in enemy territory that is about to promote or ties down pieces to stop it.",
    look: "A passed pawn on the sixth is worth a piece surprisingly often. Push it and count the tempi.",
  },
  capturingDefender: {
    name: "Remove the defender",
    what: "Take the piece that was doing the defending, so what it protected falls next.",
    look: "When a target is defended exactly once, ask what happens if that defender simply disappears.",
  },
  mateIn1: { name: "Mate in one", what: "One move ends it.", look: "Check every check. There are rarely more than a handful, and one of them mates." },
  mateIn2: { name: "Mate in two", what: "A forcing first move, then mate whatever the reply.", look: "Start with checks and captures. The first move is usually the one that takes away flight squares, not the loudest one." },
  mateIn3: { name: "Mate in three", what: "Three forcing moves, no escape.", look: "Work backwards: picture the mating position first, then find the moves that force the king into it." },
  crushing: { name: "Crushing", what: "The winning move leaves you completely on top, not merely a little better.", look: "Look for the most forcing option — the win is usually decisive rather than subtle." },
  advantage: { name: "Advantage", what: "The best move wins a clear edge without ending the game.", look: "Not everything is mate. Winning a piece cleanly is a fine result." },
  endgame: { name: "Endgame", what: "Few pieces left, where king activity and pawns decide things.", look: "Activate the king. In the endgame it is a strong piece, not a liability." },
  middlegame: { name: "Middlegame", what: "The phase where tactics live: pieces developed, plans clashing.", look: "Check every check, capture and threat before choosing a quiet move." },
  opening: { name: "Opening", what: "An early-game tactic, usually punishing a developing mistake.", look: "Most opening tactics punish a neglected king or an undefended f7/f2." },
};

/** Themes that describe the puzzle's shape rather than a pattern to learn. */
const NOT_TEACHABLE = new Set([
  "short", "long", "veryLong", "oneMove", "master", "masterVsMaster", "superGM",
  "equality", "mate", "healthyMix",
]);

/** The most instructive theme on a puzzle, or null if it only has filler tags. */
export function primaryTheme(tags = []) {
  const useful = tags.filter((t) => !NOT_TEACHABLE.has(t) && THEMES[t]);
  if (!useful.length) return null;
  // Named mating patterns and concrete tactics teach more than phase tags.
  const rank = (t) =>
    /Mate$/.test(t) ? 0 :
    ["fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "deflection",
     "attraction", "clearance", "interference", "trappedPiece", "sacrifice",
     "capturingDefender", "intermezzo", "quietMove", "zugzwang"].includes(t) ? 1 :
    /^mateIn/.test(t) ? 2 :
    ["crushing", "advantage", "endgame", "middlegame", "opening"].includes(t) ? 4 : 3;
  return useful.sort((a, b) => rank(a) - rank(b))[0];
}

export const prettyTheme = (t) =>
  (THEMES[t] && THEMES[t].name) ||
  t.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
