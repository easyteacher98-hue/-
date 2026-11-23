#!/usr/bin/env bash
# public/ 폴더 내용을 gh-pages 브랜치로 올려 GitHub Pages(정적 사이트)를 갱신합니다.
#
# 사용법:
#   bash scripts/deploy-pages.sh            # origin 저장소의 gh-pages 브랜치로 배포
#   PAGES_REMOTE=upstream bash scripts/deploy-pages.sh
#   bash scripts/deploy-pages.sh --dry-run  # 푸시 없이 임시 폴더에만 만들기
#
# GitHub Pages는 정적 파일만 제공하므로 이 사이트에서는 포털·AI 봇 연습·규칙 안내만 동작합니다.
# 모둠 실시간 대전은 Render(render.yaml) 서버가 필요합니다.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ ! -f public/index.html ]; then
  echo "public/index.html 을 찾을 수 없습니다. 저장소 루트에서 실행하세요." >&2
  exit 1
fi

remote="${PAGES_REMOTE:-origin}"
dry_run="no"
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run="yes" ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp -r public/. "$work/"
touch "$work/.nojekyll"
cat > "$work/README-PAGES.md" <<'EOF'
# GitHub Pages (정적 전용)

이 브랜치는 `main` 브랜치의 `public/` 폴더 내용을 그대로 올린 것입니다.
`scripts/deploy-pages.sh` 로 다시 만들 수 있습니다.

- 여기서 동작: 게임 포털, AI 봇 연습, 게임 규칙 안내
- 여기서 안 되는 것: 모둠 실시간 대전 · 교사 관전 (WebSocket 서버 필요 → Render 배포)
EOF

git -C "$work" init -q -b gh-pages
git -C "$work" add -A
git -C "$work" -c user.name="$(git config user.name || echo pages)" \
  -c user.email="$(git config user.email || echo pages@localhost)" \
  commit -q -m "GitHub Pages 배포: public 갱신 ($(date +%Y-%m-%d\ %H:%M))"

if [ "$dry_run" = "yes" ]; then
  echo "[dry-run] 임시 폴더에 배포본을 만들었습니다: $work (자동 삭제됩니다)"
  ls -A "$work" | grep -v '^\.git$' | sort
  exit 0
fi

git -C "$work" remote add origin "$(git remote get-url "$remote")"
git -C "$work" push --force origin gh-pages
echo "완료: gh-pages 브랜치를 갱신했습니다. 1~2분 뒤 https://easyteacher98-hue.github.io/-/ 에 반영됩니다."
