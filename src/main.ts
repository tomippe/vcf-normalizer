import "./style.css";
import { normalizeVcfInput } from "./vcfNormalize";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="shell">
    <header class="page-header">
      <h1>VCF Normalizer</h1>
      <p class="tagline">LOCAL VCARD CONVERTER</p>
    </header>
    <main class="page-main">
      <p class="lead">
        端末・キャリア・メーラー由来の不完全な vCard（2.1 / 3.0）を、UTF-8 プレーンの vCard 3.0 にまとめて整えます。
        Shift_JIS 等のバイト列・<code>CHARSET</code> 付きプレーン値・QP 改行の不備などに対応。処理はブラウザ内のみです。
      </p>
      <div class="drop" id="drop" tabindex="0">
        <p><strong>.vcf / .vcard</strong> をドロップするか、ファイルを選択</p>
        <p class="hint"><code>VERSION:3.0</code> で写真など <code>ENCODING=b</code> の行はそのまま通します。QP や UTF-8 以外の <code>CHARSET</code> 付きは UTF-8 に直します。</p>
        <input type="file" id="file" accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory" />
      </div>
      <div class="actions">
        <button type="button" id="convert" disabled>変換してダウンロード</button>
        <button type="button" class="secondary" id="clear">クリア</button>
      </div>
      <div class="stats" id="stats" hidden></div>
      <div class="fix-log" id="fixlog" hidden></div>
      <div class="warnings" id="warnings" hidden></div>
    </main>
    <footer class="page-footer">
      <div class="apps-footer">
        <a
          class="apps-footer-link"
          href="https://apps.tomippe.jp/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src="https://tomippe.jp/img/apps-logo.svg"
            alt="StudioTomippe Apps"
            width="200"
            class="apps-footer-logo"
          />
        </a>
      </div>
    </footer>
  </div>
`;

const drop = app.querySelector<HTMLDivElement>("#drop")!;
const fileInput = app.querySelector<HTMLInputElement>("#file")!;
const convertBtn = app.querySelector<HTMLButtonElement>("#convert")!;
const clearBtn = app.querySelector<HTMLButtonElement>("#clear")!;
const statsEl = app.querySelector<HTMLDivElement>("#stats")!;
const warningsEl = app.querySelector<HTMLDivElement>("#warnings")!;

let loadedName = "";
let loadedData: string | Uint8Array = "";

function setLoaded(name: string, data: string | Uint8Array) {
  loadedName = name;
  loadedData = data;
  const empty =
    typeof data === "string" ? !data.trim() : data.byteLength === 0;
  convertBtn.disabled = empty;
  statsEl.hidden = true;
  app.querySelector<HTMLDivElement>("#fixlog")!.hidden = true;
  app.querySelector<HTMLDivElement>("#fixlog")!.innerHTML = "";
  warningsEl.hidden = true;
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (!f) {
    setLoaded("", "");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const ab = reader.result;
    setLoaded(f.name, ab instanceof ArrayBuffer ? new Uint8Array(ab) : new Uint8Array());
  };
  reader.readAsArrayBuffer(f);
});

["dragenter", "dragover"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});

drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  fileInput.value = "";
  const reader = new FileReader();
  reader.onload = () => {
    const ab = reader.result;
    setLoaded(f.name, ab instanceof ArrayBuffer ? new Uint8Array(ab) : new Uint8Array());
  };
  reader.readAsArrayBuffer(f);
});

convertBtn.addEventListener("click", () => {
  const empty =
    typeof loadedData === "string"
      ? !loadedData.trim()
      : loadedData.byteLength === 0;
  if (empty) return;
  const { output, cardCount, warnings, fixLog } = normalizeVcfInput(loadedData);
  const base = loadedName.replace(/\.[^.]+$/, "") || "contacts";
  const outName = `${base}_normalized.vcf`;
  const blob = new Blob([output], { type: "text/vcard;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = outName;
  a.click();
  URL.revokeObjectURL(a.href);

  const fixlogEl = app.querySelector<HTMLDivElement>("#fixlog")!;

  statsEl.hidden = false;
  statsEl.innerHTML = `変換済み: <strong>${cardCount}</strong> 件のカード → <code>${outName}</code>`;

  if (fixLog.length) {
    fixlogEl.hidden = false;
    fixlogEl.innerHTML =
      '<p class="fix-log-title">実行ログ</p><ul class="fix-log-list">' +
      fixLog
        .map(
          (e) =>
            `<li><span class="fix-log-msg">${escapeHtml(e.label)}を修正しました</span><span class="fix-log-count">(${e.count}件)</span></li>`
        )
        .join("") +
      "</ul>";
  } else {
    fixlogEl.hidden = true;
    fixlogEl.innerHTML = "";
  }

  if (warnings.length) {
    warningsEl.hidden = false;
    warningsEl.innerHTML =
      "<strong>注意</strong><ul>" + warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("") + "</ul>";
  } else {
    warningsEl.hidden = true;
  }
});

clearBtn.addEventListener("click", () => {
  fileInput.value = "";
  setLoaded("", "");
  statsEl.hidden = true;
  app.querySelector<HTMLDivElement>("#fixlog")!.hidden = true;
  app.querySelector<HTMLDivElement>("#fixlog")!.innerHTML = "";
  warningsEl.hidden = true;
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
