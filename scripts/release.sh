#!/usr/bin/env bash
#
# Cut a release from the version in package.json.
#
# Usage: npm run release
#
# Bump the version in package.json and commit it first. This script only tags
# and pushes; the Release workflow builds the changelog and creates the GitHub
# release, and the Docker workflow publishes the image.

set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
	echo "release: $1" >&2
	exit 1
}

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

echo "release: package.json is at ${VERSION}, fetching origin..."
git fetch --quiet --tags origin

# Forgot to bump: the tag for this version was already released
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
	fail "tag ${TAG} already exists locally. Bump the version in package.json first."
fi

if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
	fail "tag ${TAG} already exists on origin. Bump the version in package.json first."
fi

# The tag must point at a commit that already carries the bumped package.json,
# otherwise the workflow's version guard rejects it
if [ -n "$(git status --porcelain)" ]; then
	fail "working tree has uncommitted changes. Commit the version bump first."
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if ! git rev-parse -q --verify '@{u}' >/dev/null; then
	fail "branch ${BRANCH} has no upstream. Push it first."
fi

if [ -n "$(git log '@{u}..HEAD' --oneline)" ]; then
	fail "branch ${BRANCH} has commits that are not on origin. Push them first."
fi

echo "release: tagging ${TAG} on ${BRANCH} ($(git rev-parse --short HEAD))"
git tag "$TAG"
git push origin "$TAG"

REPO_PATH="$(git remote get-url origin | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##')"
echo
echo "release: pushed ${TAG}"
echo "release: ${REPO_PATH}/actions"
