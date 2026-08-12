#!/usr/bin/env bash
#
# Generate Markdown release notes for a tag from conventional commit subjects.
#
# Usage: bash .github/scripts/release-notes.sh v0.0.1-alpha.18
#
# Collects feat/fix/refactor commits since the previous tag and groups them into
# sections. Everything else (docs, chore, unparseable subjects) is dropped.

set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
	echo "usage: $0 <tag>" >&2
	exit 1
fi

SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
REPOSITORY="${GITHUB_REPOSITORY:-Mauznemo/CrypthoraChat}"
REPO_URL="${SERVER_URL}/${REPOSITORY}"

# Nearest tag reachable from the commit before this one. Empty for the first tag.
PREV="$(git describe --tags --abbrev=0 "${TAG}^" 2>/dev/null || true)"
if [ -n "$PREV" ]; then
	RANGE="${PREV}..${TAG}"
else
	RANGE="$TAG"
fi

features=""
fixes=""
refactors=""

while IFS=$'\t' read -r subject sha; do
	[ -z "$subject" ] && continue

	# `;` is accepted next to `:` because older history uses `feat; ...`
	if [[ "$subject" =~ ^(feat|fix|refactor)(\([^\)]*\))?(!)?[:\;][[:space:]]*(.+)$ ]]; then
		type="${BASH_REMATCH[1]}"
		scope="${BASH_REMATCH[2]}"
		breaking="${BASH_REMATCH[3]}"
		description="${BASH_REMATCH[4]}"

		line="- "
		[ -n "$breaking" ] && line+="**BREAKING** "
		[ -n "$scope" ] && line+="**${scope:1:${#scope}-2}:** "
		line+="${description} ([\`${sha}\`](${REPO_URL}/commit/${sha}))"

		case "$type" in
			feat) features+="${line}"$'\n' ;;
			fix) fixes+="${line}"$'\n' ;;
			refactor) refactors+="${line}"$'\n' ;;
		esac
	fi
# tformat (not format) terminates every entry with a newline, otherwise `read`
# hits EOF on the last commit and drops it
done < <(git log --no-merges --reverse --pretty=tformat:'%s%x09%h' "$RANGE")

[ -n "$features" ] && printf '### ✨ New Features\n\n%s\n' "$features"
[ -n "$fixes" ] && printf '### 🐛 Bug Fixes\n\n%s\n' "$fixes"
[ -n "$refactors" ] && printf '### ♻️ Refactoring\n\n%s\n' "$refactors"

if [ -z "${features}${fixes}${refactors}" ]; then
	printf '_No notable changes._\n\n'
fi

if [ -n "$PREV" ]; then
	printf '**Full Changelog**: %s/compare/%s...%s\n' "$REPO_URL" "$PREV" "$TAG"
else
	printf '**Full Changelog**: %s/commits/%s\n' "$REPO_URL" "$TAG"
fi
