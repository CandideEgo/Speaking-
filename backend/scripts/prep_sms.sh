#!/usr/bin/env bash
# Prep server .env for new SMS credentials (no secrets written yet)
# 1. backup current .env
# 2. fix template variable names (old ALIYUN_SMS_TEMPLATE_CODE -> 3 new vars)
# 3. tighten permissions on the leaked backup file
set -e
cd /home/admin/seeword

cp -p .env ".env.bak.$(date +%Y%m%d-%H%M%S)"
echo "backup created: $(ls -1 .env.bak.* | tail -1)"

# Replace the legacy single template var with the three per-purpose vars
# (values inherited from the old TEMPLATE_CODE=100001 as placeholders;
#  user should confirm actual template ids in Aliyun console)
if grep -q '^ALIYUN_SMS_TEMPLATE_CODE=' .env; then
  sed -i \
    -e 's/^ALIYUN_SMS_TEMPLATE_CODE=.*/ALIYUN_SMS_TEMPLATE_REGISTER=100001\nALIYUN_SMS_TEMPLATE_CHANGE_PHONE=100002\nALIYUN_SMS_TEMPLATE_RESET_PASSWORD=100003/' \
    .env
  echo "template vars replaced:"
  grep -E '^ALIYUN_SMS_TEMPLATE' .env | sed 's/=.*/=<set>/'
else
  echo "no legacy ALIYUN_SMS_TEMPLATE_CODE found (nothing to replace)"
fi

# The old backup still holds the leaked plaintext key - restrict it now
chmod 600 .env.bak.20260805 2>/dev/null && echo "chmod 600 .env.bak.20260805 (leaked backup locked down)"
chmod 600 .env
echo "chmod 600 .env"

echo ''
echo '=== SMS block in .env now (masked) ==='
grep -E '^SMS_|^ALIYUN_SMS_' .env | sed -E 's/=(.*)$/=<masked>/'
