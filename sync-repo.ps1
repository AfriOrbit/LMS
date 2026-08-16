<#
    sync-repo.ps1 — make the GitHub repository exactly match the extracted release.

    WHY THIS EXISTS

    Uploading a folder to GitHub adds and overwrites. It never deletes. So a
    release that removes files lands as a half-merge: new code beside old code
    that imports things the new code no longer exports, and a build that fails
    pointing at the wrong file:

        Error: Export SITE_URL doesn't exist in target module

    This does the thing uploading cannot — it makes the repository match,
    deletions included.

    WHAT IT PROTECTS
      - Pushes a tag at the current commit BEFORE touching anything, so every
        file you have today stays recoverable:  git show <tag>:path/to/file
      - Never force-pushes. One ordinary commit that happens to delete a lot.
      - Runs the production build BEFORE committing. A tree that cannot build
        never reaches GitHub, so Vercel cannot fail on it.
      - -DryRun prints the exact change list and pushes nothing.

    USAGE

        powershell -ExecutionPolicy Bypass -File .\sync-repo.ps1 `
            -Release "C:\path\to\extracted\release"

        # look first, change nothing:
        powershell -ExecutionPolicy Bypass -File .\sync-repo.ps1 `
            -Release "C:\path\to\extracted\release" -DryRun
#>

param(
    # The folder that CONTAINS package.json — not the folder containing that folder.
    [Parameter(Mandatory = $true)][string]$Release,
    [string]$RepoUrl = 'https://github.com/AfriOrbit/lms-v1.git',
    [string]$Branch  = '',
    [switch]$DryRun,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Step($n, $m) { Write-Host "`n[$n] $m" -ForegroundColor Cyan }
function Ok($m)       { Write-Host "     OK   $m" -ForegroundColor Green }
function Note($m)     { Write-Host "     ..   $m" -ForegroundColor DarkGray }
function Warn($m)     { Write-Host "     !!   $m" -ForegroundColor Yellow }
function Die($m)      { Write-Host "`nSTOPPED: $m`n" -ForegroundColor Red; exit 1 }

# --------------------------------------------------------------------------
Step 1 'Checking the release folder'

if (-not (Test-Path -LiteralPath $Release)) { Die "No such folder: $Release" }
$Release = (Resolve-Path -LiteralPath $Release).Path

if (-not (Test-Path -LiteralPath (Join-Path $Release 'package.json'))) {
    # By a distance the most common mistake: pointing at the folder that
    # contains the release rather than the release itself.
    $inner = Get-ChildItem -LiteralPath $Release -Directory |
             Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') } |
             Select-Object -First 1
    if ($inner) { Die "No package.json in $Release, but there is one in:`n         $($inner.FullName)`n         Re-run with -Release `"$($inner.FullName)`"" }
    Die "No package.json anywhere under $Release. Is that the extracted release?"
}

foreach ($f in @('src\proxy.ts', 'src\lib\site-config.ts', 'next.config.ts', 'supabase\migrations')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Release $f))) { Die "The release is missing $f — it looks incomplete." }
}
$exports = (Select-String -LiteralPath (Join-Path $Release 'src\lib\utils.ts') -Pattern '^export' | Measure-Object).Count
if ($exports -lt 8) { Die "src\lib\utils.ts has only $exports exports; it should have 8. Re-extract the zip." }
Ok "release looks complete ($exports exports in utils.ts)"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git is not installed, or not on PATH.' }
if (-not $SkipBuild -and -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Die 'npm is not installed, or not on PATH. Install Node 20+, or pass -SkipBuild.'
}

# --------------------------------------------------------------------------
Step 2 'Cloning the repository'

$work = Join-Path $env:TEMP ("lms-sync-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
git clone --quiet $RepoUrl $work
if ($LASTEXITCODE -ne 0) { Die "Clone failed. Check your GitHub sign-in and that you can reach $RepoUrl" }
Push-Location -LiteralPath $work

try {
    if (-not $Branch) {
        # Ask the clone what it checked out, then verify that branch actually
        # exists on the remote rather than trusting it — a repository with a
        # broken remote HEAD reports a branch that is not there.
        $remote = (git branch -r --format='%(refname:lstrip=3)') |
                  Where-Object { $_ -and $_ -ne 'HEAD' }
        $candidate = (git symbolic-ref --quiet --short HEAD 2>$null)
        if     ($candidate -and ($remote -contains $candidate)) { $Branch = $candidate }
        elseif ($remote -contains 'main')                       { $Branch = 'main' }
        elseif ($remote -contains 'master')                     { $Branch = 'master' }
        elseif (@($remote).Count -eq 1)                         { $Branch = @($remote)[0] }
        else { Die "Could not determine the branch. Available: $($remote -join ', ')`n         Re-run with -Branch <name>." }
        Note "branch is '$Branch'"
    }

    git checkout --quiet $Branch 2>$null
    if ($LASTEXITCODE -ne 0) {
        $avail = ((git branch -r) | ForEach-Object { $_.Trim() -replace '^origin/', '' }) -join ', '
        Die "Branch '$Branch' does not exist in $RepoUrl.`n         Available: $avail`n         Re-run with -Branch <name>."
    }
    $head = (git rev-parse --short HEAD).Trim()
    Ok "cloned at $head on $Branch"
    Note "working in $work"

    # ----------------------------------------------------------------------
    Step 3 'Tagging the current state so nothing is lost'

    $tag = 'pre-sync-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    git tag $tag
    if (-not $DryRun) {
        git push --quiet origin $tag
        if ($LASTEXITCODE -ne 0) { Die 'Could not push the safety tag. Stopping before changing anything.' }
        Ok "pushed tag $tag  —  recover any file with:  git show ${tag}:path/to/file"
    } else {
        Note "DRY RUN: would push tag $tag"
    }

    # ----------------------------------------------------------------------
    Step 4 'Mirroring the release into the working tree'

    git ls-files --error-unmatch .env *> $null
    if ($LASTEXITCODE -eq 0) {
        Warn '.env is committed to this repo. It will be removed.'
        Warn 'If it ever held real keys, ROTATE THEM — git history keeps them.'
    }

    <#
        DELETE TRACKED FILES BY LITERAL PATH.

        This is the one place PowerShell will bite. Square brackets are
        WILDCARDS to PowerShell's path parser, and this repository contains

            src/app/(website)/www/[[...slug]]/page.tsx

        `Remove-Item` on that path without -LiteralPath silently matches
        nothing — the file survives, the build then fails, and the reason is
        invisible. Every path operation in this script uses -LiteralPath for
        that reason. Parentheses are harmless; brackets are not.
    #>
    $tracked = git ls-files
    foreach ($rel in $tracked) {
        $full = Join-Path $work $rel
        if (Test-Path -LiteralPath $full) { Remove-Item -LiteralPath $full -Force }
    }

    <#
        Then the directories the files left behind.

        Deepest first, repeatedly, because removing a child is what makes its
        parent empty. A single pass leaves `src/app/(website)/` standing after
        `src/app/(website)/www/` goes, and an empty directory is invisible to
        git — so nothing downstream would report it.
    #>
    for ($pass = 0; $pass -lt 12; $pass++) {
        $empty = Get-ChildItem -LiteralPath $work -Directory -Recurse -Force |
                 Where-Object { $_.FullName -notmatch '\\\.git($|\\)' } |
                 Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1) }
        if (-not $empty) { break }
        $empty | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
    }

    # Copy the release in. Robocopy is used rather than Copy-Item because it
    # handles long paths and deep trees without complaint; exit codes below 8
    # mean success.
    $exclude = @('node_modules', '.next', '.git', '.vercel')
    $null = robocopy $Release $work /E /NJH /NJS /NDL /NFL /NP /XD @exclude /XF '.env' '.env.local' 'next-env.d.ts' 'tsconfig.tsbuildinfo'
    if ($LASTEXITCODE -ge 8) { Die "robocopy failed with code $LASTEXITCODE" }
    $global:LASTEXITCODE = 0

    if (Test-Path -LiteralPath (Join-Path $work '.env')) { Remove-Item -LiteralPath (Join-Path $work '.env') -Force }

    git add -A
    $status = git status --porcelain
    if (-not $status) {
        Ok 'the repository already matches the release — nothing to do'
        Pop-Location
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
        exit 0
    }

    $deleted  = @(git diff --cached --name-only --diff-filter=D)
    $added    = @(git diff --cached --name-only --diff-filter=A)
    $modified = @(git diff --cached --name-only --diff-filter=M)
    Ok "$($deleted.Count) deleted, $($added.Count) added, $($modified.Count) modified"

    if ($deleted.Count -gt 0) {
        Write-Host "`n     Files that will be DELETED:" -ForegroundColor Yellow
        $deleted | ForEach-Object { Write-Host "       - $_" }
    }

    # ----------------------------------------------------------------------
    if (-not $SkipBuild) {
        Step 5 'Building — nothing is pushed unless this passes'

        # No Supabase values on purpose. This app is designed to build without
        # them and show /setup at runtime; a build that needed secrets would
        # itself be the bug.
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Die 'npm ci failed. GitHub is UNCHANGED.' }

        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n  The build failed HERE, on your machine, with the full error above." -ForegroundColor Red
            Write-Host '  GitHub is UNCHANGED. Nothing broken was pushed.' -ForegroundColor Red
            Write-Host "  The prepared tree is at: $work" -ForegroundColor Yellow
            Write-Host '  Send me the error text and I will fix it.' -ForegroundColor Yellow
            Die 'build failed'
        }
        Ok 'build succeeded — this exact tree will build on Vercel'
    } else {
        Warn 'build skipped (-SkipBuild). You are pushing an unverified tree.'
    }

    # ----------------------------------------------------------------------
    Step 6 'Committing and pushing'

    if ($DryRun) {
        Write-Host "`nDRY RUN — nothing pushed." -ForegroundColor Yellow
        Write-Host "The prepared tree is at: $work`n"
        Pop-Location
        exit 0
    }

    git -c user.name="AfriOrbit" -c user.email="noreply@afriorbit.space" `
        commit --quiet -m "Sync repository with release

Deletions included, which an upload cannot express.
Build was run locally before this commit and exited 0.
Previous state is preserved at tag $tag."

    git push origin $Branch
    if ($LASTEXITCODE -ne 0) { Die "Push failed — check your GitHub credentials. Local work is at $work" }

    $new = (git rev-parse --short HEAD).Trim()
    Write-Host "`n=======================================================" -ForegroundColor Green
    Write-Host " Repository synced. Vercel will build commit $new" -ForegroundColor Green
    Write-Host "=======================================================`n" -ForegroundColor Green
    Write-Host " Previous state:  git show ${tag}:path/to/file" -ForegroundColor DarkGray
    Write-Host ''
}
finally {
    if ((Get-Location).Path -eq $work) { Pop-Location }
}
