/**
 * VCF バイト列の文字コード推定（UTF-8 / Shift_JIS 系 / 欧米系シングルバイトなど）
 * 端末・OS・メーラー由来の非 UTF-8 実ファイルを想定。
 */

const DECODER_TRY_ORDER = [
  "utf-8",
  "shift_jis",
  "windows-31j",
  "euc-jp",
  "iso-8859-1",
  "windows-1252",
] as const;

function stripUtf8Bom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

/** VCARD らしさと置換文字・制御文字をスコア化 */
function scoreVcfDecodedText(s: string): number {
  const vc = (s.match(/\bBEGIN:VCARD\b/gi) || []).length;
  if (vc === 0) return Number.NEGATIVE_INFINITY;
  const fffd = (s.match(/\uFFFD/g) || []).length;
  let badCtrl = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) badCtrl++;
  }
  return vc * 10000 - fffd * 500 - badCtrl * 80;
}

export interface DetectDecodeResult {
  text: string;
  /** UTF-8 以外を採用したときの TextDecoder ラベル（注意表示用） */
  detectedLabel: string | null;
}

/**
 * バイト列を複数エンコーディングで試し、vCard として最も妥当な文字列を返す。
 */
export function detectAndDecodeVcfBytes(src: Uint8Array): DetectDecodeResult {
  const bytes = stripUtf8Bom(src);
  let bestText = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLabel: string | null = "utf-8";

  for (const label of DECODER_TRY_ORDER) {
    let dec: string;
    try {
      dec = new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      continue;
    }
    const sc = scoreVcfDecodedText(dec);
    const better = sc > bestScore || (sc === bestScore && label === "utf-8");
    if (better) {
      bestScore = sc;
      bestText = dec;
      bestLabel = label;
    }
  }

  if (bestScore === Number.NEGATIVE_INFINITY) {
    const fallback = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { text: fallback, detectedLabel: null };
  }

  const detectedLabel = bestLabel && bestLabel !== "utf-8" ? bestLabel : null;
  return { text: bestText, detectedLabel };
}

/** CHARSET 名を TextDecoder に渡せるラベルへ */
export function charsetToDecoderLabel(charset: string): string {
  const u = charset.trim().replace(/_/g, "-").toLowerCase();
  const map: Record<string, string> = {
    "shift-jis": "shift_jis",
    shift_jis: "shift_jis",
    sjis: "shift_jis",
    "x-sjis": "shift_jis",
    cp932: "windows-31j",
    "windows-31j": "windows-31j",
    ms932: "windows-31j",
    "iso-2022-jp": "iso-2022-jp",
    "euc-jp": "euc-jp",
    "utf-8": "utf-8",
    utf8: "utf-8",
    "iso-8859-1": "iso-8859-1",
    iso88591: "iso-8859-1",
    latin1: "iso-8859-1",
    "windows-1252": "windows-1252",
    cp1252: "windows-1252",
  };
  return map[u] || u;
}

export function isUtf8CharsetDecl(charsetUpper: string): boolean {
  const c = charsetUpper.replace(/_/g, "-").toUpperCase();
  return c === "UTF-8" || c === "UTF8" || c === "";
}

/**
 * 1 バイト＝1 コードユニットとして運ばれてきた値を、指定 charset のバイト列として UTF-16 文字列化。
 * （ファイル全体が誤デコードされている場合は detectAndDecodeVcfBytes が主対策）
 */
export function decodeByteCarrierString(raw: string, charset: string): string {
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i) & 0xff;
  const label = charsetToDecoderLabel(charset);
  try {
    return new TextDecoder(label, { fatal: false }).decode(u8);
  } catch {
    return raw;
  }
}
