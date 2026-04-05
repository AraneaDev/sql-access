#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/bump-version.sh <major|minor|patch|x.y.z>
# Bumps version in all files, commits, and tags.
#
# Files updated:
#   - package.json + package-lock.json (via npm version)
#   - src/types/index.ts (SERVER_VERSION constant)
#   - README.md (title and description version references)
#   - docs/README.md (Version: x.y.z footer)

BUMP="${1:-}"

if [[ -z "$BUMP" ]]; then
  echo "Usage: $0 <major|minor|patch|x.y.z>"
  echo ""
  echo "Examples:"
  echo "  $0 patch       # 2.4.1 -> 2.4.2"
  echo "  $0 minor       # 2.4.1 -> 2.5.0"
  echo "  $0 major       # 2.4.1 -> 3.0.0"
  echo "  $0 2.5.0       # set explicit version"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

OLD_VERSION=$(node -p "require('./package.json').version")

# Calculate new version
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$OLD_VERSION"
  case "$BUMP" in
    major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
    minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    *) echo "Error: Invalid bump type '$BUMP'. Use major, minor, patch, or x.y.z"; exit 1 ;;
  esac
fi

echo "Bumping version: v${OLD_VERSION} -> v${NEW_VERSION}"
echo ""

# 1. package.json + package-lock.json
echo "  Updating package.json..."
npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null

# 2. src/types/index.ts — SERVER_VERSION
echo "  Updating src/types/index.ts..."
sed -i "s/export const SERVER_VERSION = '.*'/export const SERVER_VERSION = '${NEW_VERSION}'/" src/types/index.ts

# 3. README.md — replace old version with new (only vX.Y.Z patterns)
echo "  Updating README.md..."
sed -i "s/v${OLD_VERSION}/v${NEW_VERSION}/g" README.md

# 4. docs/README.md — replace version in footer
echo "  Updating docs/README.md..."
sed -i "s/\*\*Version:\*\* ${OLD_VERSION}/**Version:** ${NEW_VERSION}/" docs/README.md

# 5. Verify all files match
echo ""
echo "  Verifying..."

ERRORS=0

PKG_VERSION=$(node -p "require('./package.json').version")
if [[ "$PKG_VERSION" != "$NEW_VERSION" ]]; then
  echo "  FAIL: package.json = $PKG_VERSION (expected $NEW_VERSION)"
  ERRORS=$((ERRORS + 1))
fi

SOURCE_VERSION=$(grep -oP "SERVER_VERSION = '\K[^']+" src/types/index.ts)
if [[ "$SOURCE_VERSION" != "$NEW_VERSION" ]]; then
  echo "  FAIL: types/index.ts = $SOURCE_VERSION (expected $NEW_VERSION)"
  ERRORS=$((ERRORS + 1))
fi

README_COUNT=$(grep -c "v${NEW_VERSION}" README.md || true)
if [[ "$README_COUNT" -lt 1 ]]; then
  echo "  FAIL: README.md has no references to v${NEW_VERSION}"
  ERRORS=$((ERRORS + 1))
fi

DOCS_README_COUNT=$(grep -c "**Version:** ${NEW_VERSION}" docs/README.md || true)
if [[ "$DOCS_README_COUNT" -lt 1 ]]; then
  echo "  FAIL: docs/README.md has no references to ${NEW_VERSION}"
  ERRORS=$((ERRORS + 1))
fi

if [[ "$ERRORS" -gt 0 ]]; then
  echo ""
  echo "  ERROR: ${ERRORS} verification(s) failed. Aborting."
  echo "  Run 'git checkout -- .' to revert."
  exit 1
fi

echo "  OK: All files updated to v${NEW_VERSION}"

# 5. Commit and tag
echo ""
git add package.json package-lock.json src/types/index.ts README.md docs/README.md
git commit -m "chore: bump version to v${NEW_VERSION}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"

echo ""
echo "Done! Version bumped to v${NEW_VERSION}"
echo ""
echo "  package.json         ✓"
echo "  package-lock.json    ✓"
echo "  src/types/index.ts   ✓"
echo "  README.md            ✓"
echo "  docs/README.md       ✓"
echo "  git tag v${NEW_VERSION}   ✓"
echo ""
echo "To push: git push && git push --tags"
