# syntax=docker/dockerfile:1
#
# 같은 이미지가 Next.js standalone 서버(node server.js)와 CLI 번들 셋
# (migrate-runner·account-cli·db-bootstrap, node dist/cli/<name>.mjs)을 모두
# 담는다(OPS-01, Issue 4, D-11). min-instances 0 전제(OPS-02), 비루트 실행.
#
# Node 24 배포판의 내장 pnpm 활성화 방식은 deprecated이고 Node 25부터는
# 아예 빠지므로 쓰지 않는다 — pnpm은 npm install -g로 고정 버전을 설치한다.

FROM node:24-slim AS base
RUN npm install -g pnpm@10.33.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# 이미지는 squawk를 실행하지 않는다 — squawk-cli의 postinstall이 네트워크로
# 바이너리를 내려받아 빌드가 그 다운로드에 묶이므로(프록시·GitHub 장애로 실패
# 가능), 공급망 면에서도 이미지 빌드에서 postinstall 스크립트를 전부 끈다
# (T-1-SC2). esbuild는 플랫폼 바이너리를 optionalDependencies로 받으므로
# 스크립트 없이도 동작한다.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GIT_SHA
# 빌드 전용 더미 환경 — lib/env.ts가 import 시점에 zod로 파싱하므로 `next build`에
# 값이 필요하다. 런타임 값은 Cloud Run 환경 변수가 덮어쓴다(01-06 deploy.sh).
ENV APP_ENV=local \
    DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-time-only-secret-not-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm build:cli

FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/dist/cli ./dist/cli
COPY --from=build /app/db/migrations ./db/migrations
USER app
EXPOSE 3000
CMD ["node", "server.js"]
