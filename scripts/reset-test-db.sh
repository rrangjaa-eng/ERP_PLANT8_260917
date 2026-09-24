#!/usr/bin/env bash
# erp_test를 데이터베이스째 지우고 다시 만든다. E2E는 test/e2e/global-setup.ts가
# 시작할 때 스키마를 비우므로 이 스크립트 없이도 빈 DB에서 돈다 — 이 스크립트는
# 데이터베이스 자체를 새로 만들고 싶을 때(예: 통합 테스트 전) 쓴다.
set -euo pipefail

PGPASSWORD=erp psql -h 127.0.0.1 -p 5432 -U erp -d postgres \
  -c 'DROP DATABASE IF EXISTS erp_test WITH (FORCE)' \
  -c 'CREATE DATABASE erp_test OWNER erp'
