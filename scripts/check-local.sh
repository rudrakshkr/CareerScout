#!/usr/bin/env bash
set -Eeuo pipefail

printf '\nNode: '
node --version
printf 'npm:  '
npm --version

printf '\nChecking workspace types...\n'
npm run typecheck

printf '\nBuilding workspaces...\n'
npm run build

printf '\nCareerScout local checks passed.\n'
