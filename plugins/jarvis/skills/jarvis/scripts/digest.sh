#!/usr/bin/env bash
# Gather raw material for summarizing BB threads: purpose, status, pending
# approvals/questions, and each thread's latest agent output.
#
# Usage: digest.sh [pinned|active|all] [--project <name-or-id>] [--max <chars>] [thread-id ...]
#   pinned (default)  pinned threads
#   active            threads currently running or in error
#   all               every visible, unarchived thread
#   thread ids        exactly these threads (overrides the selector)
# The current thread (BB_THREAD_ID) is always skipped.
set -euo pipefail

sel=pinned project="" max=2500 ids=()
while [ $# -gt 0 ]; do
  case "$1" in
    pinned|active|all) sel=$1 ;;
    --project) project=$2; shift ;;
    --max) max=$2; shift ;;
    thr_*) ids+=("$1") ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

threads=$(bb thread list --json)
projects=$(bb project list --json | jq '{"proj_personal": "Personal"} + (map({(.id): .name}) | add // {})')

if [ -n "$project" ]; then
  pid=$(jq -r --arg p "$project" 'to_entries[] | select(.key == $p or (.value | ascii_downcase) == ($p | ascii_downcase)) | .key' <<<"$projects" | head -1)
  [ -n "$pid" ] || { echo "no project matches: $project" >&2; exit 2; }
  threads=$(jq --arg p "$pid" 'map(select(.projectId == $p))' <<<"$threads")
fi

if [ ${#ids[@]} -gt 0 ]; then
  filter='map(select(.id as $i | $ids | index($i)))'
else
  case $sel in
    pinned) filter='map(select(.pinnedAt != null)) | sort_by(.pinnedAt)' ;;
    active) filter='map(select(.status != "idle")) | sort_by(-.updatedAt)' ;;
    all)    filter='sort_by(-.updatedAt)' ;;
  esac
fi
selected=$(jq -c --argjson ids "$(printf '%s\n' "${ids[@]}" | jq -R . | jq -s 'map(select(length > 0))')" \
  --arg self "${BB_THREAD_ID:-}" "$filter | map(select(.id != \$self)) | .[]" <<<"$threads")

[ -n "$selected" ] || { echo "(no matching threads)"; exit 0; }

now=$(date +%s)
while IFS= read -r t; do
  id=$(jq -r .id <<<"$t")
  title=$(jq -r '.title // "(untitled)"' <<<"$t")
  status=$(jq -r .status <<<"$t")
  proj=$(jq -r --argjson p "$projects" '$p[.projectId] // .projectId' <<<"$t")
  age=$(( (now - $(jq -r '.updatedAt / 1000 | floor' <<<"$t")) / 60 ))
  if [ $age -lt 60 ]; then ago="${age}m"; elif [ $age -lt 2880 ]; then ago="$((age / 60))h"; else ago="$((age / 1440))d"; fi
  pending=$(bb thread interactions list "$id" --json 2>/dev/null \
    | jq '[.[] | select((.status // .state // "") | test("pending|open|awaiting"; "i"))] | length' 2>/dev/null || echo "?")
  purpose=$(bb thread log "$id" --format json --limit 5 2>/dev/null \
    | jq -r '[.[] | select(.type == "client/turn/requested")][0].data.input // [] | map(.text // empty) | join(" ")' 2>/dev/null \
    | tr '\n' ' ' | cut -c1-400)
  output=$(bb thread output "$id" --json 2>/dev/null | jq -r '.output // ""' 2>/dev/null)
  [ ${#output} -gt "$max" ] && output="…${output: -$max}"

  echo "=== $title"
  echo "id: $id | project: $proj | status: $status | updated: $ago ago | pending interactions: $pending"
  echo "first prompt: ${purpose:-(none)}"
  echo "latest output:"
  echo "${output:-(none)}"
  echo
done <<<"$selected"
