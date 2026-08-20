/**
 * Multi-frame zstd reader.
 *
 * The Lichess dump is not a single zstd stream: it is 68 data frames with 34
 * skippable frames interleaved. Node's decoder stops at the end of the first
 * frame and returns nothing at all when a skippable frame comes first, so both
 * the streaming and one-shot APIs silently give you a fraction of the file.
 *
 * This walks the container and decompresses one data frame at a time, which
 * also keeps peak memory to a single frame rather than the whole ~1 GB.
 */
import fs from "fs";
import zlib from "zlib";

const DATA_MAGIC = 0xfd2fb528;
const SKIP_MASK = 0xfffffff0;
const SKIP_MAGIC = 0x184d2a50;

const isSkip = (m) => (m >>> 0 & SKIP_MASK) >>> 0 === SKIP_MAGIC;
const isData = (m) => (m >>> 0) === DATA_MAGIC;

function magicAt(fd, off, size) {
  if (off + 4 > size) return null;
  const b = Buffer.alloc(8);
  const n = fs.readSync(fd, b, 0, Math.min(8, size - off), off);
  if (n < 4) return null;
  return { magic: b.readUInt32LE(0), len: n >= 8 ? b.readUInt32LE(4) : 0 };
}

/** A skippable frame header is only real if what follows it is also a frame. */
function validSkip(fd, off, size) {
  const h = magicAt(fd, off, size);
  if (!h || !isSkip(h.magic)) return false;
  const next = off + 8 + h.len;
  if (next === size) return true;
  if (next > size) return false;
  const n = magicAt(fd, next, size);
  return !!n && (isData(n.magic) || isSkip(n.magic));
}

/** Find where the data frame starting at `from` ends. */
function findFrameEnd(fd, from, size) {
  const CHUNK = 1 << 20;
  const needle = Buffer.from([0x50, 0x2a, 0x4d, 0x18]); // 0x184D2A50 little-endian
  let pos = from;
  const buf = Buffer.alloc(CHUNK + 8);

  while (pos < size) {
    const want = Math.min(CHUNK + 8, size - pos);
    const got = fs.readSync(fd, buf, 0, want, pos);
    if (got <= 0) break;
    let idx = 0;
    for (;;) {
      // Match only on a 4-byte boundary-agnostic scan; validate every hit.
      const at = buf.indexOf(needle, idx);
      if (at === -1 || at >= got) break;
      const abs = pos + at;
      // The low nibble of the magic varies, so re-check the real value.
      const h = magicAt(fd, abs, size);
      if (h && isSkip(h.magic) && validSkip(fd, abs, size)) return abs;
      idx = at + 1;
    }
    pos += Math.max(1, got - 8); // overlap so a split needle is not missed
  }
  return size;
}

/** Yield decompressed Buffers, one per data frame, in order. */
export function* zstdFrames(file) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, "r");
  try {
    let off = 0;
    while (off < size) {
      const h = magicAt(fd, off, size);
      if (!h) break;

      if (isSkip(h.magic)) {
        off += 8 + h.len;
        continue;
      }
      if (!isData(h.magic)) {
        throw new Error(`unexpected bytes at offset ${off}: magic 0x${h.magic.toString(16)}`);
      }

      const end = findFrameEnd(fd, off + 4, size);
      const raw = Buffer.alloc(end - off);
      fs.readSync(fd, raw, 0, raw.length, off);
      yield zlib.zstdDecompressSync(raw, {
        maxOutputLength: 1 << 30,
        params: { [zlib.constants.ZSTD_d_windowLogMax]: 31 },
      });
      off = end;
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Yield complete text lines across every frame. */
export function* zstdLines(file) {
  let tail = "";
  for (const chunk of zstdFrames(file)) {
    const text = tail + chunk.toString("utf8");
    const parts = text.split("\n");
    tail = parts.pop();
    for (const l of parts) yield l;
  }
  if (tail) yield tail;
}
