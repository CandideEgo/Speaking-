#!/usr/bin/env bash
# Release helper: bumps version, archives the [Unreleased] changelog section,
# commits, and tags. No push - review the commit then `git push --tags`.
#
# Usage:
#   scripts/release.sh patch    # 0.1.0 -> 0.1.1
#   scripts/release.sh minor    # 0.1.0 -> 0.2.0
#   scripts/release.sh major    # 0.1.0 -> 1.0.0
#   scripts/release.sh 1.2.3    # explicit version
#
# Requires: bash 4+, git, python3 (for version arithmetic). Run from repo root.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "Usage: $0 {patch|minor|major|<version>}" >&2
  exit 1
fi
BUMP="$1"

# Read current version from frontend/package.json.
CUR=$(python -c "import json;print(json.load(open('frontend/package.json'))['version'])")
echo "Current version: $CUR"

# Compute next version.
if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEXT="$BUMP"
else
  NEXT=$(python -c "
v='$CUR'.split('.'); b='$BUMP'
if b=='patch': v[2]=str(int(v[2])+1)
elif b=='minor': v[1]=str(int(v[1])+1); v[2]='0'
elif b=='major': v[0]=str(int(v[0])+1); v[1]='0'; v[2]='0'
else: raise SystemExit('bad bump: '+b)
print('.'.join(v))
")
fi
echo "Next version:     $NEXT"
[ "$CUR" = "$NEXT" ] && { echo "No version change."; exit 1; }

# Bump frontend/package.json.
python -c "
import json
p='frontend/package.json'
d=json.load(open(p))
d['version']='$NEXT'
json.dump(d,open(p,'w'),indent=2,ensure_ascii=False)
open(p,'a').write('\n')
print('bumped frontend/package.json -> $NEXT')
"

# Archive the [Unreleased] section in CHANGELOG.md -> [NEXT] (today's date).
TODAY=$(python -c "from datetime import date;print(date.today().isoformat())")
python -c "
p='CHANGELOG.md'
s=open(p,encoding='utf-8').read()
header='## [Unreleased]'
if header not in s:
    raise SystemExit('CHANGELOG.md has no ## [Unreleased] section')
# Replace the Unreleased header with the new version, then add a fresh empty
# Unreleased section above it so the next cycle has a home.
new_section='## [Unreleased]\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n## [$NEXT] - $TODAY'
s=s.replace(header, new_section, 1)
open(p,'w',encoding='utf-8').write(s)
print('archived CHANGELOG -> [$NEXT] ($TODAY)')
"

git add frontend/package.json CHANGELOG.md
git commit -m "chore(release): v$NEXT

Version bump $CUR -> $NEXT. CHANGELOG [Unreleased] archived to [$NEXT]."

echo ""
echo "Done. Review the commit, then:"
echo "  git push && git tag v$NEXT && git push --tags"
