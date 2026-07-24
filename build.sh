#!/bin/bash
set -e

# ===== vcf-normalizer ビルドスクリプト (Vite + 静的 Web) =====

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="vcf-normalizer"
DEV_PORT=5180
DEPLOY_DIR="../apps.tomippe.jp/vcf-normalizer"

source "$SCRIPT_DIR/../build-common/version.sh"
source "$SCRIPT_DIR/../build-common/ftp-upload.sh"
source "$SCRIPT_DIR/../build-common/dev-server.sh"
source "$SCRIPT_DIR/../build-common/git-commit.sh"

COMMIT_MSG=""
NO_VERUP=false
while [ $# -gt 0 ]; do
  case "$1" in
    -cm) shift; COMMIT_MSG="$1" ;;
    -noverup) NO_VERUP=true ;;
  esac
  shift || true
done

VERSION=$(version_read)
if command -v jq >/dev/null 2>&1; then
  jq ".version = \"${VERSION}\"" package.json > package.json.tmp && mv package.json.tmp package.json
  if [ -f public/manifest.json ]; then
    jq ".version = \"${VERSION}\"" public/manifest.json > public/manifest.json.tmp && mv public/manifest.json.tmp public/manifest.json
    echo "  ✓ manifest.json → v${VERSION}"
  fi
else
  sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' package.json
fi
echo "  ✓ package.json → v${VERSION}"

echo "🔧 ${APP_NAME} v${VERSION} をビルド中..."

dev_server_stop "$DEV_PORT"

echo "🔨 ビルドを開始します..."
npm install
npm run build

if [ -d build ]; then
  mkdir -p "$DEPLOY_DIR"
  rsync -a --delete build/ "$DEPLOY_DIR/"
  if [ -f "$DEPLOY_DIR/index.html" ]; then
    mkdir -p "$DEPLOY_DIR/run"
    cp "$DEPLOY_DIR/index.html" "$DEPLOY_DIR/run/index.html"
    echo "  ✓ ${DEPLOY_DIR}/run/index.html を配置（PWA start_url 用）"
  fi
  echo "  ✓ ${DEPLOY_DIR}/ にデプロイしました"
  ftp_upload_dir "$DEPLOY_DIR" "vcf-normalizer"
fi

echo "✅ build/ に出力しました"

if ! $NO_VERUP; then
  echo ""
  echo "📝 次回用バージョンを更新しています..."
  version_save_next "$VERSION"
fi

git_commit_build "$VERSION" "$COMMIT_MSG"

dev_server_restart "$DEV_PORT" "npm run dev"

echo ""
echo "🎉 ${APP_NAME} v${VERSION} — 完了（開発: http://localhost:${DEV_PORT}/vcf-normalizer/）"
