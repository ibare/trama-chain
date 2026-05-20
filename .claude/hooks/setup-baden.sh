#!/usr/bin/env bash
# SessionStart 훅. /tmp/baden-trama 클라이언트 스크립트를 (재)생성한다.
# rule-guard 서브에이전트는 MCP 도구에 접근할 수 없어 Bash로 직접 보고해야 하므로
# 매 세션 시작 시 이 클라이언트를 준비해 둔다.
set -euo pipefail

CLIENT=/tmp/baden-trama

cat > "$CLIENT" <<'CLIENT_EOF'
#!/usr/bin/env bash
# Baden 클라이언트 (Trama). projectName="Trama" 를 자동 주입한다.
#  - stdin 모드: JSON-lines 를 받아 배열로 묶어 1회 POST
#  - 단건 모드: 인자 JSON 한 건을 POST
set -euo pipefail
PROJECT="Trama"
URL="http://localhost:3800/api/query"

if [ ! -t 0 ]; then
  payload=$(jq -c --arg p "$PROJECT" '. + {projectName:$p}' \
    | jq -sc '.')
  [ "$payload" = "[]" ] && exit 0
  curl -sf -X POST "$URL" \
    -H 'Content-Type: application/json' \
    --data-binary "$payload" >/dev/null
  exit 0
fi

[ $# -eq 0 ] && {
  echo "usage: baden-trama '<json>' | echo '<json>\\n<json>' | baden-trama" >&2
  exit 1
}
curl -sf -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg p "$PROJECT" --argjson body "$1" '$body + {projectName:$p}')" \
  >/dev/null
CLIENT_EOF

chmod +x "$CLIENT"
