#!/usr/bin/env bash
# verify.sh — verify lang-forge/SKILL.md integrity before installation
# Usage: bash verify.sh

set -euo pipefail

SKILL_FILE="lang-forge/SKILL.md"
CHECKSUM_FILE="checksums.sha256"

echo "lang-forge integrity verification"
echo "=================================="

if [[ ! -f "$SKILL_FILE" ]]; then
  echo "ERROR: $SKILL_FILE not found. Run this script from the repository root."
  exit 1
fi

if [[ ! -f "$CHECKSUM_FILE" ]]; then
  echo "ERROR: $CHECKSUM_FILE not found. Run this script from the repository root."
  exit 1
fi

EXPECTED=$(awk '{print $1}' "$CHECKSUM_FILE")
ACTUAL=$(sha256sum "$SKILL_FILE" | awk '{print $1}')

echo "File   : $SKILL_FILE"
echo "Expected: $EXPECTED"
echo "Actual  : $ACTUAL"
echo ""

if [[ "$EXPECTED" == "$ACTUAL" ]]; then
  echo "PASS — checksum verified. Safe to install."
  exit 0
else
  echo "FAIL — checksum mismatch. Do NOT install."
  echo "This file may have been tampered with."
  echo "Report via SECURITY.md instructions."
  exit 1
fi
