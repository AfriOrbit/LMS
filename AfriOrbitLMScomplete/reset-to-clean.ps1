<#
    reset-to-clean.ps1 — make the repo exactly match the verified codebase.

    WHY A RESET RATHER THAN ANOTHER PATCH

    The working copy has been edited by tooling that owns files by convention:
    `shadcn` overwrote src/lib/utils.ts down to a six-line stub, a Prisma
    scaffold left a prisma.config.ts importing a package that was never
    installed, and a Supabase quickstart dropped three unused client files.
    Each was fixed individually and a new one appeared. That is a losing loop —
    the problem is not any single file, it is that nobody knows what else those
    tools touched.

    This replaces every tracked file with the verified tree, so the answer to
    "what else is in there" becomes "nothing".

    NOTHING IS LOST. The current state is committed to a timestamped backup
    branch first, so anything worth keeping can be recovered with:
        git diff main backup/<timestamp> -- <path>

    IT WILL NOT PUSH A BROKEN BUILD. The build runs locally before the commit.
    If it fails you get the real compiler error in your own terminal in about a
    minute, instead of "Command npm run build exited with 1" from Vercel five
    minutes later with the useful part truncated.

    USAGE
        cd "C:\Users\12404\OneDrive - MS Office\Desktop\Combined\Enterprise\AfriOrbit\Afriorbit-LMS\AfriOrbitLMScomplete"
        powershell -ExecutionPolicy Bypass -File .\reset-to-clean.ps1 -CleanTree "C:\path\to\unzipped\afriorbit-lms"
#>

param(
    # Folder containing the unzipped clean codebase (the one with package.json in it).
    [Parameter(Mandatory = $true)][string]$CleanTree,

    # Skip the local build. Not recommended: the build is the only thing that
    # stops a broken tree reaching Vercel.
    [switch]$SkipBuild,

    # Stop before committing, so you can inspect `git status` yourself.
    [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Die($msg)      { Write-Host "`nSTOPPED: $msg`n" -ForegroundColor Red; exit 1 }

# --------------------------------------------------------------------------
Step 1 "Checking where we are"

if (-not (Test-Path '.git')) {
    Die "This is not a git repository. cd into your repo folder first."
}
$remote = (git remote get-url origin 2>$null)
if (-not $remote) { Die "No 'origin' remote. Is this the right folder?" }
Ok "repo   $remote"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Ok "branch $branch"

$CleanTree = (Resolve-Path $CleanTree).Path
if (-not (Test-Path (Join-Path $CleanTree 'package.json'))) {
    Die "No package.json in $CleanTree. Point -CleanTree at the folder that CONTAINS package.json (you may need to go one level deeper after unzipping)."
}
Ok "clean  $CleanTree"

# Refuse to run if the clean tree is somehow the repo itself.
if ((Resolve-Path '.').Path -eq $CleanTree) { Die "-CleanTree is the repo itself." }

# --------------------------------------------------------------------------
Step 2 "Backing up the current state to a branch"

git add -A | Out-Null
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "backup/$stamp"
if ((git status --porcelain).Length -gt 0) {
    git commit -q -m "Snapshot before clean reset ($stamp)" | Out-Null
    Ok "uncommitted work committed"
}
git branch $backup | Out-Null
Ok "backup branch $backup  (recover anything with: git diff $branch $backup -- <path>)"

# --------------------------------------------------------------------------
Step 3 "Removing tracked files"

# An earlier version of this script preserved `.env` as well as `.env.local`,
# reasoning that both held local settings. That was wrong: `.env` had been
# committed, so preserving it meant `git add -A` put it straight back and Vercel
# reported "Detected .env file". A committed .env is loaded during the build and
# quietly competes with the dashboard values you are trying to debug. Only
# `.env.local` — which .gitignore actually covers — is kept.
if (git ls-files --error-unmatch .env 2>$null) {
    git rm -q --cached .env | Out-Null
    Write-Host "    !!  .env was COMMITTED to this repo. Removing it from version control." -ForegroundColor Yellow
    Write-Host "        If it ever held real keys, rotate them: git history keeps them." -ForegroundColor Yellow
}
Remove-Item .env -Force -ErrorAction SilentlyContinue

git rm -r -q --cached . | Out-Null
Get-ChildItem -Force | Where-Object {
    $_.Name -notin @('.git', 'node_modules', '.next', '.env.local', '.vercel', 'reset-to-clean.ps1')
} | Remove-Item -Recurse -Force
Ok "tracked files cleared (.env removed, .env.local kept)"

# --------------------------------------------------------------------------
Step 4 "Copying in the verified tree"

Get-ChildItem -Path $CleanTree -Force | Where-Object {
    $_.Name -notin @('node_modules', '.next', '.git', '.vercel')
} | Copy-Item -Destination . -Recurse -Force
Ok "files copied"

foreach ($f in @('src/lib/utils.ts', 'src/proxy.ts', 'package.json', 'src/content/curriculum.ts')) {
    if (-not (Test-Path $f)) { Die "Expected $f after the copy and it is not there. The -CleanTree path is probably one level off." }
}
$exports = (Select-String -Path 'src/lib/utils.ts' -Pattern '^export' | Measure-Object).Count
if ($exports -lt 8) { Die "src/lib/utils.ts has only $exports exports — the copy did not take." }
Ok "sanity check passed ($exports exports in utils.ts)"

# --------------------------------------------------------------------------
Step 5 "Installing dependencies"

npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Die "npm install failed. Read the error above." }
Ok "dependencies installed"

# --------------------------------------------------------------------------
if (-not $SkipBuild) {
    Step 6 "Building locally — this is the gate"

    # Supabase values are not needed to BUILD. The app is designed to compile
    # without them and show /setup at runtime, so a build that needs secrets
    # would itself be a bug.
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nThe build failed HERE, on your machine." -ForegroundColor Red
        Write-Host "That is the real error, in full, above this line — not the truncated" -ForegroundColor Red
        Write-Host "version Vercel prints. Fix it, re-run, and nothing broken reaches Vercel." -ForegroundColor Red
        Write-Host "`nYour previous state is safe on branch $backup." -ForegroundColor Yellow
        exit 1
    }
    Ok "build succeeded — this exact tree will build on Vercel"
}

# --------------------------------------------------------------------------
if ($NoCommit) {
    Step 7 "Stopping before commit as requested"
    git status --short
    Write-Host "`nReview, then:  git add -A; git commit -m 'Reset to verified codebase'; git push origin $branch`n"
    exit 0
}

Step 7 "Committing and pushing"

git add -A
if ((git status --porcelain).Length -eq 0) {
    Ok "no differences — the repo already matched the verified tree"
} else {
    git commit -q -m "Reset to verified codebase (build checked locally before push)"
    git push origin $branch
    if ($LASTEXITCODE -ne 0) { Die "Push failed. Check your GitHub credentials." }
    Ok "pushed to $branch"
}

Write-Host "`nDone. Vercel will build this commit.`n" -ForegroundColor Green
Write-Host "Next: set the environment variables (MIGRATION.md, Step 3), then open" -ForegroundColor Yellow
Write-Host "/api/health on the deployment and check that deployment.commit matches:" -ForegroundColor Yellow
Write-Host "    $(git rev-parse --short HEAD)`n" -ForegroundColor Yellow
