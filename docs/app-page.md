# VCF Normalizer 紹介ページ（WordPress）

## 実施済み

- 投稿タイプ `app`、投稿 ID **2193**、スラッグ `vcf-normalizer`
- 公開 URL: https://apps.tomippe.jp/vcf-normalizer/
- UI スクリーンショット: メディア ID **2199**（`app-ss01`、元画像 1994×1232、`app-ss01width` **1000**）
- アイコン: メディア ID **2195**（512×512 PNG、`CleanShot 2026-04-03 at 03.47.03.png` → `app-icon`）
- KV 背景: メディア ID **2196**（`dazzle-neon-futuristic-hexagonal-grid-background-in-abstract-3d-render-with-dazzling-glow_9836700.jpg` → `app-kvbg`）

## ACF メモ

| フィールド | 値 |
|---|---|
| app-cp | 連絡先VCFをブラウザ内で一括正規化 / UTF-8 の vCard 3.0 へ（詳細は本文） |
| platform | `["web"]` |
| app-weburl | （空欄 → テーマ既定で `…/run/`） |
| app-webdesc | HTML5, CSS3 Required<br>日本語（他 Web アプリに合わせる） |
| app-keycolor | #FF9E5E |
| app-kvbg | 2196 |
| app-kvbgaddcss | `html.apps main #kv` が `background-color: var(--keycolor)` あり特異性が高いため、オーバーレイは各プロパティ **`!important`**（`rgba(255,158,94,0.2)` + `screen`） |
| app-ss01 | 2199、`app-ss01width` 1000、角丸あり |

## 再アップロード手順（スクショ差し替え）

プロジェクトルートで:

```bash
source ~/.wp-env && source .env
curl -sS -u "$WP_USER:$WP_APP_PASSWORD" \
  -H "Content-Disposition: attachment; filename=\"vcf-normalizer-screenshot.png\"" \
  -F "file=@docs/vcf-normalizer-screenshot.png;type=image/png" \
  "$WP_SITE_URL/wp-json/wp/v2/media"
```

返却 JSON の `id` を `app-ss01` に設定して PATCH（KV は別画像）。

## プライバシーポリシー

未作成（ブラウザ内完結・サーバ非送信のため任意）。必要なら子ページ `policy/` を追加し `.env` に `WP_POLICY_POST_ID` 等を追記。
