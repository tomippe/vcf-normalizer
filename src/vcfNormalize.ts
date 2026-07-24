/**
 * 各種 vCard（2.1 / 3.0、QP・CHARSET・文字コード不整合）→ UTF-8 プレーン vCard 3.0
 */

import {
  charsetToDecoderLabel,
  decodeByteCarrierString,
  detectAndDecodeVcfBytes,
  isUtf8CharsetDecl,
} from "./vcfEncoding";

/** 処理順の修正ログ（件数 0 は含めない） */
export interface FixLogEntry {
  label: string;
  count: number;
}

export interface NormalizeResult {
  output: string;
  cardCount: number;
  warnings: string[];
  fixLog: FixLogEntry[];
}

/** 文字列（貼り付け等）またはファイルのバイト列 */
export function normalizeVcfInput(input: string | Uint8Array): NormalizeResult {
  const fixLog: FixLogEntry[] = [];
  let text: string;
  if (input instanceof Uint8Array) {
    const { text: t, detectedLabel } = detectAndDecodeVcfBytes(input);
    text = t;
    if (detectedLabel) {
      fixLog.push({
        label: `ファイル全体の文字コード（${detectedLabel}）`,
        count: 1,
      });
    }
  } else {
    text = input;
  }
  return normalizeVcfText(text, fixLog);
}

/** 既に UTF-8 テキストとみなす場合（後方互換・テスト用） */
export function normalizeVcfFile(text: string): NormalizeResult {
  return normalizeVcfInput(text);
}

interface PropDecodeStats {
  qpDecode: number;
  charsetPlain: number;
}

function normalizeVcfText(text: string, fixLog: FixLogEntry[]): NormalizeResult {
  const warnings: string[] = [];
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const { lines: qpMerged, qpJoinCount } = mergeQpSoftBreakLines(rawLines);
  const { lines: merged, unfoldCount } = unfoldVcardLines(qpMerged);

  if (qpJoinCount > 0) {
    fixLog.push({ label: "Quoted-Printable の改行不備", count: qpJoinCount });
  }
  if (unfoldCount > 0) {
    fixLog.push({ label: "vCard の折り返し行", count: unfoldCount });
  }

  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of merged) {
    const u = line.trim().toUpperCase();
    if (u === "BEGIN:VCARD") {
      cur = [];
      continue;
    }
    if (u === "END:VCARD") {
      blocks.push(cur);
      cur = [];
      continue;
    }
    cur.push(line);
  }
  if (cur.length) {
    blocks.push(cur);
    warnings.push("ファイル末尾に閉じていない VCARD ブロックがありました。");
  }

  const propStats: PropDecodeStats = { qpDecode: 0, charsetPlain: 0 };
  const allOut: string[] = [];
  let cardCount = 0;
  let rebuiltCards = 0;
  for (const block of blocks) {
    if (!block.length) continue;
    if (blockIsV30(block) && !v30BlockNeedsFullNormalize(block)) {
      allOut.push(...passThroughV30(block));
    } else {
      allOut.push(...convertCard(block, propStats));
      rebuiltCards += 1;
    }
    allOut.push("");
    cardCount += 1;
  }
  while (allOut.length && allOut[allOut.length - 1] === "") {
    allOut.pop();
  }

  if (propStats.qpDecode > 0) {
    fixLog.push({ label: "Quoted-Printable 付きプロパティ", count: propStats.qpDecode });
  }
  if (propStats.charsetPlain > 0) {
    fixLog.push({ label: "CHARSET 付き非 UTF-8 テキスト", count: propStats.charsetPlain });
  }
  if (rebuiltCards > 0) {
    fixLog.push({ label: "UTF-8 プレーン vCard 3.0 への再構成", count: rebuiltCards });
  }

  const body = allOut.join("\r\n") + "\r\n";
  return { output: body, cardCount, warnings, fixLog };
}

function blockIsV30(lines: string[]): boolean {
  return lines.some((l) => /^\s*VERSION\s*:\s*3\.0\s*$/i.test(l));
}

/** v3.0 のまま通す用（バイナリ PHOTO 等、ENCODING=b を壊さない） */
function passThroughV30(lines: string[]): string[] {
  const inner = lines.filter((l) => {
    const t = l.trim().toUpperCase();
    return t !== "BEGIN:VCARD" && t !== "END:VCARD";
  });
  return ["BEGIN:VCARD", ...inner, "END:VCARD"];
}

function v30BlockNeedsFullNormalize(lines: string[]): boolean {
  return v30BlockHasQuotedPrintableProperty(lines) || v30BlockHasNonUtfCharsetProperty(lines);
}

function v30BlockHasQuotedPrintableProperty(lines: string[]): boolean {
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const prop = line.slice(0, idx);
    if (/ENCODING\s*=\s*QUOTED-PRINTABLE/i.test(prop) || /\bENCODING\s*=\s*QP\b/i.test(prop)) {
      return true;
    }
  }
  return false;
}

/** CHARSET が UTF-8 以外だけ付いている 3.0 もプレーン UTF-8 に組み替える */
function v30BlockHasNonUtfCharsetProperty(lines: string[]): boolean {
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const prop = line.slice(0, idx);
    const m = /CHARSET\s*=\s*([^;:]+)/i.exec(prop);
    if (!m) continue;
    const raw = m[1].trim().replace(/^["']|["']$/g, "");
    if (raw && !isUtf8CharsetDecl(raw.toUpperCase())) return true;
  }
  return false;
}

function mergeQpSoftBreakLines(lines: string[]): { lines: string[]; qpJoinCount: number } {
  const out: string[] = [];
  let qpJoinCount = 0;
  let i = 0;
  const n = lines.length;
  while (i < n) {
    let line = lines[i];
    i += 1;
    while (i < n && line.replace(/\s+$/, "").endsWith("=") && lines[i].startsWith("=")) {
      line = line.replace(/\s+$/, "").slice(0, -1) + lines[i];
      i += 1;
      qpJoinCount += 1;
    }
    out.push(line);
  }
  return { lines: out, qpJoinCount };
}

function unfoldVcardLines(lines: string[]): { lines: string[]; unfoldCount: number } {
  const merged: string[] = [];
  let buf: string | null = null;
  let unfoldCount = 0;
  for (let line of lines) {
    line = line.replace(/\r?\n?$/, "");
    if (buf !== null) {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        buf += line.slice(1);
        unfoldCount += 1;
        continue;
      }
      merged.push(buf);
    }
    buf = line;
  }
  if (buf !== null) merged.push(buf);
  return { lines: merged, unfoldCount };
}

function parseParams(paramStr: string): { types: string[]; dict: Record<string, string> } {
  const types: string[] = [];
  const dict: Record<string, string> = {};
  if (!paramStr) return { types, dict };
  for (const p of paramStr.split(";")) {
    const s = p.trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    if (eq >= 0) {
      dict[s.slice(0, eq).toUpperCase()] = s.slice(eq + 1);
    } else {
      types.push(s);
    }
  }
  return { types, dict };
}

function parsePropertyLine(
  line: string
): { name: string; types: string[]; dict: Record<string, string>; value: string } | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const semi = left.indexOf(";");
  const name = (semi < 0 ? left : left.slice(0, semi)).trim();
  const rest = semi < 0 ? "" : left.slice(semi + 1);
  const { types, dict } = parseParams(rest);
  return { name, types, dict, value };
}

function decodeQuotedPrintableToString(raw: string, charset: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "=" && i + 2 < raw.length) {
      const h = raw.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(h)) {
        bytes.push(parseInt(h, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(raw.charCodeAt(i) & 0xff);
  }
  const u8 = new Uint8Array(bytes);
  const label = charsetToDecoderLabel(charset || "UTF-8");
  try {
    return new TextDecoder(label, { fatal: false }).decode(u8);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(u8);
  }
}

function decodePropertyValue(
  rawValue: string,
  paramsDict: Record<string, string>,
  stats?: PropDecodeStats
): string {
  const enc = (paramsDict.ENCODING || "").toUpperCase();
  if (enc === "B" || enc === "BASE64") {
    return rawValue;
  }

  const charsetDecl = (paramsDict.CHARSET || "").trim();
  const charsetUpper = charsetDecl.toUpperCase();

  if (enc === "QUOTED-PRINTABLE" || enc === "QP") {
    if (stats) stats.qpDecode += 1;
    return decodeQuotedPrintableToString(rawValue, charsetDecl || "UTF-8");
  }

  if (charsetDecl && !isUtf8CharsetDecl(charsetUpper)) {
    const out = decodeByteCarrierString(rawValue, charsetDecl);
    if (stats && out !== rawValue) stats.charsetPlain += 1;
    return out;
  }

  return rawValue;
}

function escapeV3Text(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function telTypeParam(typesList: string[]): string {
  let pref = false;
  const parts: string[] = [];
  for (const t of typesList) {
    const u = t.toUpperCase();
    if (u === "PREF") pref = true;
    else parts.push(u);
  }
  if (!parts.length) parts.push("VOICE");
  if (pref) parts.push("PREF");
  return "TYPE=" + parts.join(",");
}

function emailTypeParam(typesList: string[]): string {
  const parts = typesList.filter(Boolean).map((t) => t.toUpperCase());
  if (!parts.length) return "TYPE=INTERNET";
  return "TYPE=" + parts.join(",");
}

function adrTypeParam(typesList: string[]): string {
  const parts = typesList.filter(Boolean).map((t) => t.toUpperCase());
  return parts.length ? "TYPE=" + parts.join(",") : "";
}

const STD_PROPS = new Set([
  "FN",
  "N",
  "TEL",
  "EMAIL",
  "ADR",
  "BDAY",
  "NOTE",
  "ORG",
  "TITLE",
  "URL",
  "CATEGORIES",
  "VERSION",
  "UID",
  "NICKNAME",
  "ROLE",
]);

function canonProp(name: string): string {
  const u = name.toUpperCase();
  return STD_PROPS.has(u) ? u : name;
}

function buildV3Line(
  name: string,
  typesList: string[],
  paramsDict: Record<string, string>,
  dec: string
): string {
  const n = canonProp(name);

  if (n === "VERSION") return "VERSION:3.0";

  if (n === "N") {
    const parts = dec.split(";");
    while (parts.length < 5) parts.push("");
    const body = parts
      .slice(0, 5)
      .map((p) => escapeV3Text(p))
      .join(";");
    return "N:" + body;
  }
  if (n === "FN") return "FN:" + escapeV3Text(dec);
  if (n === "TEL") return "TEL;" + telTypeParam(typesList) + ":" + escapeV3Text(dec);
  if (n === "EMAIL") return "EMAIL;" + emailTypeParam(typesList) + ":" + escapeV3Text(dec);
  if (n === "ADR") {
    const tp = adrTypeParam(typesList);
    const parts = dec.split(";");
    while (parts.length < 7) parts.push("");
    const body = parts
      .slice(0, 7)
      .map((p) => escapeV3Text(p))
      .join(";");
    return tp ? "ADR;" + tp + ":" + body : "ADR:" + body;
  }
  if (n === "BDAY") {
    let dv = dec.trim();
    const m = dv.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) dv = m[1] + m[2] + m[3];
    return "BDAY:" + dv;
  }
  if (["NOTE", "ORG", "TITLE", "CATEGORIES", "NICKNAME", "ROLE"].includes(n)) {
    return n + ":" + escapeV3Text(dec);
  }
  if (n === "URL") return "URL:" + dec;
  if (n === "UID") return "UID:" + escapeV3Text(dec);

  const extraParams: string[] = [];
  for (const [k, v] of Object.entries(paramsDict)) {
    if (k === "ENCODING" || k === "CHARSET") continue;
    if (k === "TYPE") extraParams.push("TYPE=" + v);
  }
  const mid = [...typesList, ...extraParams].join(";");
  const ev = escapeV3Text(dec);
  return mid ? `${name};${mid}:${ev}` : `${name}:${ev}`;
}

type ParsedRow = [string, string[], Record<string, string>, string, string];

function convertCard(lines: string[], stats?: PropDecodeStats): string[] {
  const parsed: ParsedRow[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const p = parsePropertyLine(line);
    if (!p) continue;
    const nu = p.name.toUpperCase();
    if (nu === "BEGIN" || nu === "END") continue;
    const dec = decodePropertyValue(p.value, p.dict, stats);
    parsed.push([p.name, p.types, p.dict, p.value, dec]);
  }

  let fnDec: string | null = null;
  let nDec: string | null = null;
  for (const [name, , , , dec] of parsed) {
    const u = name.toUpperCase();
    if (u === "FN") fnDec = dec;
    if (u === "N") nDec = dec;
  }

  if (!fnDec || !String(fnDec).trim()) {
    if (nDec) {
      const parts = nDec.split(";");
      const fam = parts[0] ?? "";
      const giv = parts[1] ?? "";
      fnDec = (fam + " " + giv).trim() || fam || " ";
    } else {
      fnDec = " ";
    }
  }

  const out = ["BEGIN:VCARD", "VERSION:3.0"];
  for (const [name, types, dict, , dec0] of parsed) {
    const u = name.toUpperCase();
    if (u === "VERSION") continue;
    const dec = u === "FN" ? fnDec! : dec0;
    out.push(buildV3Line(name, types, dict, dec));
  }
  out.push("END:VCARD");
  return out;
}
