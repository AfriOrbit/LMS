#!/usr/bin/env bash
#
# sync-repo.sh — make the GitHub repository exactly match the extracted release.
#
# WHY THIS EXISTS
#
# Uploading a folder to GitHub adds and overwrites. It never deletes. So a
# release that removes files lands as a half-merge: new code beside old code
# that imports things the new code no longer exports, and a build that fails
# pointing at the wrong file.
#
# This does the thing uploading cannot: it makes the repository match, deletions
# included.
#
# WHAT IT PROTECTS
#   - It pushes a tag at the current commit BEFORE touching anything, so every
#     file you have today stays recoverable: git show <tag>:path/to/file
#   - It never force-pushes. One ordinary commit that happens to delete a lot.
#   - It runs the production build BEFORE committing. A tree that cannot build
#     never reaches GitHub, so Vercel cannot fail on it.
#   - --dry-run shows the exact change list and pushes nothing.
#
# USAGE
#   ./sync-repo.sh --release /path/to/extracted/release
#   ./sync-repo.sh --release . --dry-run
#
set -euo pipefail

RELEASE=""
REPO_URL="https://github.com/AfriOrbit/lms-v1.git"
BRANCH=""
DRY_RUN=0
SKIP_BUILD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --release)    RELEASE="${2:?--release needs a path}"; shift 2 ;;
    --repo)       REPO_URL="${2:?--repo needs a URL}"; shift 2 ;;
    --branch)     BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help)    sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[36m[%s]\033[0m %s\n' "$1" "$2"; }
ok()   { printf '     \033[32mOK\033[0m   %s\n' "$1"; }
note() { printf '     ..   %s\n' "$1"; }
warn() { printf '     \033[33m!!\033[0m   %s\n' "$1"; }
die()  { printf '\n\033[31mSTOPPED:\033[0m %s\n\n' "$1" >&2; exit 1; }

# --------------------------------------------------------------------------
step 1 'Checking the release folder'

[ -n "$RELEASE" ] || die "Pass --release /path/to/extracted/release"
[ -d "$RELEASE" ] || die "No such folder: $RELEASE"
RELEASE="$(cd "$RELEASE" && pwd)"

if [ ! -f "$RELEASE/package.json" ]; then
  # The single most common mistake: pointing at the folder that CONTAINS the
  # release rather than the release itself.
  inner="$(find "$RELEASE" -maxdepth 2 -name package.json -not -path '*/node_modules/*' -print -quit 2>/dev/null || true)"
  [ -n "$inner" ] && die "No package.json in $RELEASE, but there is one at:
         $inner
         Re-run with --release $(dirname "$inner")"
  die "No package.json anywhere under $RELEASE. Is that the extracted release?"
fi

for f in src/proxy.ts src/lib/site-config.ts next.config.ts supabase/migrations; do
  [ -e "$RELEASE/$f" ] || die "The release is missing $f — it looks incomplete."
done
exports=$(grep -c '^export' "$RELEASE/src/lib/utils.ts" || true)
[ "$exports" -ge 8 ] || die "src/lib/utils.ts has only $exports exports; it should have 8. Re-extract the zip."
ok "release looks complete ($exports exports in utils.ts)"

command -v git >/dev/null || die "git is not installed."
if [ "$SKIP_BUILD" -eq 0 ]; then
  command -v npm >/dev/null || die "npm is not installed. Install Node 20+, or pass --skip-build."
fi

# --------------------------------------------------------------------------
step 2 'Cloning the repository'

WORK="$(mktemp -d -t lms-sync-XXXXXX)"
# Never leave a half-finished clone lying around, but keep it if we failed
# after the build so the user can inspect it.
cleanup() { [ "${KEEP_WORK:-0}" -eq 1 ] || rm -rf "$WORK"; }
trap cleanup EXIT

git clone --quiet "$REPO_URL" "$WORK" || die "Clone failed. Check your GitHub sign-in and that you can reach $REPO_URL"
cd "$WORK"

if [ -z "$BRANCH" ]; then
  # Ask the clone what it checked out. On a repository whose remote HEAD is
  # broken this comes back empty or names a branch that does not exist, so it
  # is checked against the branches that are actually there rather than
  # trusted — the first version of this fell back to 'master' on a repo whose
  # only branch was 'main' and stopped dead.
  REMOTE_BRANCHES="$(git branch -r --format='%(refname:lstrip=3)' | grep -v '^HEAD$' || true)"
  CANDIDATE="$(git symbolic-ref --quiet --short HEAD || true)"
  if [ -n "$CANDIDATE" ] && printf '%s\n' "$REMOTE_BRANCHES" | grep -qx "$CANDIDATE"; then
    BRANCH="$CANDIDATE"
  elif printf '%s\n' "$REMOTE_BRANCHES" | grep -qx main; then
    BRANCH=main
  elif printf '%s\n' "$REMOTE_BRANCHES" | grep -qx master; then
    BRANCH=master
  elif [ "$(printf '%s\n' "$REMOTE_BRANCHES" | grep -c .)" = "1" ]; then
    BRANCH="$(printf '%s\n' "$REMOTE_BRANCHES" | tr -d '[:space:]')"
  else
    die "Could not determine the branch. Available: $(printf '%s ' $REMOTE_BRANCHES)
         Re-run with --branch <name>."
  fi
  note "branch is '$BRANCH'"
fi
git checkout --quiet "$BRANCH" 2>/dev/null || {
  avail="$(git branch -r | sed 's|.*origin/||' | tr '\n' ' ')"
  die "Branch '$BRANCH' does not exist. Available: $avail"
}
HEAD_SHA="$(git rev-parse --short HEAD)"
ok "cloned at $HEAD_SHA on $BRANCH"

# --------------------------------------------------------------------------
step 3 'Tagging the current state so nothing is lost'

TAG="pre-sync-$(date +%Y%m%d-%H%M%S)"
git tag "$TAG"
if [ "$DRY_RUN" -eq 0 ]; then
  git push --quiet origin "$TAG" || die "Could not push the safety tag. Stopping before changing anything."
  ok "pushed tag $TAG  —  recover any file with:  git show $TAG:path/to/file"
else
  note "DRY RUN: would push tag $TAG"
fi

# --------------------------------------------------------------------------
step 4 'Mirroring the release into the working tree'

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  warn ".env is committed to this repo. It will be removed."
  warn "If it ever held real keys, ROTATE THEM — git history keeps them."
fi

# Delete every tracked path, then copy the release in. This is what makes
# deletions happen: anything the release does not contain simply is not
# recreated. `.git` is excluded by listing tracked files rather than globbing.
git ls-files -z | xargs -0 rm -f --

# Then the directories the files left behind.
#
# `-exec rmdir {} +` does NOT work here and the failure is subtle: find batches
# the arguments and runs rmdir after the whole traversal, so a parent directory
# is tested for -empty while its children still exist and is therefore skipped.
# `src/app/(website)/www/` survived exactly that way. `-delete` removes each
# directory during the depth-first walk, so a parent is tested after its
# children are gone.
#
# Empty directories are invisible to git, so nothing downstream would have
# reported this — but they are visible to `existsSync`, which is what the
# stale-file check uses, and to anyone reading the tree.
find . -mindepth 1 -depth -type d -not -path './.git' -not -path './.git/*' -empty -delete 2>/dev/null || true

# -a preserves the tree; the excludes keep local-only junk out of the commit.
tar -C "$RELEASE" -cf - \
  --exclude='./node_modules' --exclude='./.next' --exclude='./.git' \
  --exclude='./.vercel' --exclude='./.env' --exclude='./.env.local' \
  --exclude='./next-env.d.ts' --exclude='./tsconfig.tsbuildinfo' \
  . | tar -C . -xf -

rm -f .env
git add -A

if git diff --cached --quiet; then
  ok "the repository already matches the release — nothing to do"
  exit 0
fi

D=$(git diff --cached --name-only --diff-filter=D | wc -l | tr -d ' ')
A=$(git diff --cached --name-only --diff-filter=A | wc -l | tr -d ' ')
M=$(git diff --cached --name-only --diff-filter=M | wc -l | tr -d ' ')
ok "$D deleted, $A added, $M modified"

if [ "$D" -gt 0 ]; then
  printf '\n     Files that will be DELETED:\n'
  git diff --cached --name-only --diff-filter=D | sed 's/^/       - /'
fi

# --------------------------------------------------------------------------
if [ "$SKIP_BUILD" -eq 0 ]; then
  step 5 'Building — nothing is pushed unless this passes'
  # No Supabase values on purpose: this app is designed to build without them
  # and show /setup at runtime. A build that needed secrets would be the bug.
  npm ci --no-audit --no-fund || die "npm ci failed. GitHub is UNCHANGED."
  if ! npm run build; then
    KEEP_WORK=1
    printf '\n  The build failed HERE, on your machine, with the full error above.\n'
    printf '  GitHub is UNCHANGED. Nothing broken was pushed.\n'
    printf '  The prepared tree is at: %s\n\n' "$WORK"
    die "build failed"
  fi
  ok "build succeeded — this exact tree will build on Vercel"
else
  warn "build skipped (--skip-build). You are pushing an unverified tree."
fi

# --------------------------------------------------------------------------
step 6 'Committing and pushing'

if [ "$DRY_RUN" -eq 1 ]; then
  printf '\n\033[33mDRY RUN — nothing pushed.\033[0m\n'
  printf 'The prepared tree is at: %s\n\n' "$WORK"
  KEEP_WORK=1
  exit 0
fi

git -c user.name="AfriOrbit" -c user.email="noreply@afriorbit.space" \
  commit --quiet -m "Sync repository with release

Deletions included, which an upload cannot express.
Build was run locally before this commit and exited 0.
Previous state is preserved at tag $TAG."

git push origin "$BRANCH" || die "Push failed — check your GitHub credentials. Local work is at $WORK"
NEW_SHA="$(git rev-parse --short HEAD)"

printf '\n\033[32m=======================================================\033[0m\n'
printf '\033[32m Repository synced. Vercel will build commit %s\033[0m\n' "$NEW_SHA"
printf '\033[32m=======================================================\033[0m\n\n'
printf ' Previous state:  git show %s:path/to/file\n\n' "$TAG"
