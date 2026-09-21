#!/usr/bin/env bash
# E2E용 erp_test를 비운다. test/e2e/global-setup.ts는 마이그레이션만 돌리고
# truncate를 하지 않아, 고정 라벨 픽스처가 실행마다 누적된다(CI는 컨테이너가
# 매번 새로 떠서 드러나지 않는다). 리셋과 실행을 한 명령으로 묶기 위한 스크립트다.
set -euo pipefail

PGPASSWORD=erp psql -h 127.0.0.1 -p 5432 -U erp -d postgres \
  -c 'DROP DATABASE IF EXISTS erp_test WITH (FORCE)' \
  -c 'CREATE DATABASE erp_test OWNER erp'
