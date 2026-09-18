#!/bin/bash
# 로컬 Postgres 16 준비 (D-01). Docker(PC)가 있으면 컨테이너, 없으면(클라우드
# 세션) apt로 설치한 Postgres. 실패해도 세션을 막지 않되, DB가 끝내 안 뜨면
# pg_isready 대기가 타임아웃되어 비-zero로 끝난다(호출자가 판단).

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

DB_USER="erp"
DB_PASSWORD="erp"
DB_NAME="erp"
DB_TEST_NAME="erp_test"

use_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

start_docker_postgres() {
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "erp-dev-db"; then
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "erp-dev-db"; then
      docker start erp-dev-db >/dev/null 2>&1 || true
    fi
  else
    docker run -d --name erp-dev-db \
      -e "POSTGRES_USER=${DB_USER}" \
      -e "POSTGRES_PASSWORD=${DB_PASSWORD}" \
      -p 5432:5432 \
      postgres:16-alpine >/dev/null 2>&1 || true
  fi
}

start_apt_postgres() {
  if ! command -v pg_lsclusters >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql >/dev/null 2>&1 || true
  fi

  if ! pg_lsclusters 2>/dev/null | grep -qE '^16[[:space:]]+main[[:space:]]'; then
    pg_createcluster 16 main >/dev/null 2>&1 || true
  fi

  pg_ctlcluster 16 main start >/dev/null 2>&1 || true

  run_as_postgres() {
    if [ "$(id -u)" = "0" ]; then
      su postgres -c "$1" 2>/dev/null
    else
      sudo -u postgres bash -c "$1" 2>/dev/null
    fi
  }

  ROLE_EXISTS=$(run_as_postgres "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"")
  if [ "$ROLE_EXISTS" != "1" ]; then
    run_as_postgres "psql -c \"CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}' SUPERUSER\"" || true
  fi
}

if use_docker; then
  start_docker_postgres
else
  start_apt_postgres
fi

# 두 경로 공통: 최대 30초 대기
READY=0
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "dev-db: Postgres did not become ready within 30s" >&2
  exit 0
fi

create_db_if_missing() {
  local dbname="$1"
  PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -p 5432 -U "${DB_USER}" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${dbname}'" 2>/dev/null | grep -q 1 || \
  PGPASSWORD="${DB_PASSWORD}" psql -h 127.0.0.1 -p 5432 -U "${DB_USER}" -d postgres -c \
    "CREATE DATABASE ${dbname} OWNER ${DB_USER}" >/dev/null 2>&1 || true
}

create_db_if_missing "${DB_NAME}"
create_db_if_missing "${DB_TEST_NAME}"

ENV_LOCAL="${ROOT}/.env.local"
if [ ! -f "$ENV_LOCAL" ]; then
  SECRET="$(openssl rand -hex 32)"
  {
    echo "DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"
    echo "BETTER_AUTH_URL=http://localhost:3000"
    echo "BETTER_AUTH_SECRET=${SECRET}"
    echo "APP_ENV=local"
  } > "$ENV_LOCAL"
fi

echo "dev-db: ready at postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME} (+ ${DB_TEST_NAME})"
exit 0
