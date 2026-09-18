#!/usr/bin/env bash
set -euo pipefail

# scripts/bootstrap-gcp.sh — 사용자가 Cloud Shell에서 Owner로 1회 실행하는 부트스트랩
# (D-02). 멱등이다 — 여러 번 실행해도 같은 결과.
#
# 단일 파일이다: infra/ 아래 이름 규칙 파일을 source하지 않는다. 비공개 리포는
# Cloud Shell에서 clone하려면 GitHub 토큰이 필요한데, 파일 하나만 붙여넣어 실행할
# 수 있으면 비개발자 사용자의 마찰이 없다(CEO OV-9). 아래 상수는 그 이름 규칙
# 파일의 값과 반드시 같아야 한다(bootstrap-sh.test.ts가 두 파일을 읽어 단언한다)
# — DRY 원칙의 예외로, 배포 파이프라인(scripts/deploy.sh)이 쓰는 이름 규칙과 이
# 스크립트가 만드는 identity 리소스가 어긋나지 않게 하기 위함이다.
REGION_DEFAULT=asia-northeast3
NETWORK=default
VPC_RANGE=google-managed-services-default
WIF_POOL=github
WIF_PROVIDER=erp-repo
DEPLOYER_SA=gha-deployer

PROJECT=""
GITHUB_REPO=""
REGION=""

usage() {
  cat >&2 <<'USAGE'
Usage: bootstrap-gcp.sh --project ID --github-repo owner/name [--region R]
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    --github-repo)
      GITHUB_REPO="${2:-}"
      shift 2
      ;;
    --region)
      REGION="${2:-}"
      shift 2
      ;;
    *)
      echo "bootstrap-gcp.sh: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [ -z "$PROJECT" ] || [ -z "$GITHUB_REPO" ]; then
  echo "bootstrap-gcp.sh: --project and --github-repo are required" >&2
  usage
  exit 2
fi
REGION="${REGION:-$REGION_DEFAULT}"

# (0) 사전 검사 — fail fast(D-03): 프로젝트는 사용자가 콘솔에서 만든다, 이 스크립트는
# 프로젝트를 만들지 않는다. 어떤 리소스 생성보다 앞에 둔다.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null)" || {
  echo "project $PROJECT not found or no access — create it in the console under the company organization and link billing first (D-03); this script does not create projects" >&2
  exit 1
}

BILLING_ENABLED="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null)"
BILLING_ENABLED_LOWER="$(printf '%s' "$BILLING_ENABLED" | tr '[:upper:]' '[:lower:]')"
if [ "$BILLING_ENABLED_LOWER" != "true" ]; then
  echo "billing is not enabled on $PROJECT — link the company billing account in the console (D-03)" >&2
  exit 1
fi

# (a) API 활성화
gcloud services enable \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com orgpolicy.googleapis.com compute.googleapis.com \
  servicenetworking.googleapis.com run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com monitoring.googleapis.com \
  logging.googleapis.com \
  --project="$PROJECT"

# WIF 프로바이더 생성 전에 조직 정책이 외부 IdP를 막는지 확인한다 — 막혀 있으면
# 어떤 identity 리소스도 만들지 않고 즉시 멈춘다.
WIF_POLICY_OUTPUT="$(gcloud org-policies describe iam.workloadIdentityPoolProviders --project="$PROJECT" --effective 2>/dev/null || true)"
if printf '%s' "$WIF_POLICY_OUTPUT" | grep -q 'deniedValues'; then
  echo "org policy iam.workloadIdentityPoolProviders blocks GitHub OIDC — ask the GCP org admin (예외 요청 목록에 추가)" >&2
  exit 1
fi

# (b) WIF: 풀·프로바이더
if ! gcloud iam workload-identity-pools describe "$WIF_POOL" --location=global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$WIF_POOL" --location=global --project="$PROJECT" --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" --workload-identity-pool="$WIF_POOL" --location=global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --location=global --workload-identity-pool="$WIF_POOL" --project="$PROJECT" \
    --display-name="PLANT8 ERP repo" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

# (c) SA 셋
if ! gcloud iam service-accounts describe "${DEPLOYER_SA}@${PROJECT}.iam.gserviceaccount.com" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$DEPLOYER_SA" --project="$PROJECT" --display-name="GitHub Actions deployer"
fi

ENVS="staging prod"
for env in $ENVS; do
  runtime_sa="plant8-${env}-runtime"
  if ! gcloud iam service-accounts describe "${runtime_sa}@${PROJECT}.iam.gserviceaccount.com" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$runtime_sa" --project="$PROJECT" --display-name="PLANT8 ERP ${env} runtime"
  fi
done

# (d) 배포자 프로젝트 역할(넓게 시작 — 01-08이 실사용 권한으로 좁히는 절차를 문서화한다)
DEPLOYER_EMAIL="${DEPLOYER_SA}@${PROJECT}.iam.gserviceaccount.com"
for role in run.admin cloudsql.admin secretmanager.admin artifactregistry.admin monitoring.editor logging.admin serviceusage.serviceUsageAdmin compute.networkAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${DEPLOYER_EMAIL}" --role="roles/${role}" >/dev/null
done

# 런타임 SA 둘에 iam.serviceAccountUser(배포자가 사용) + 운영 역할 5개
for env in $ENVS; do
  runtime_email="plant8-${env}-runtime@${PROJECT}.iam.gserviceaccount.com"
  gcloud iam service-accounts add-iam-policy-binding "$runtime_email" --project="$PROJECT" \
    --member="serviceAccount:${DEPLOYER_EMAIL}" --role=roles/iam.serviceAccountUser >/dev/null
  for role in cloudsql.client cloudsql.instanceUser cloudsql.viewer logging.logWriter monitoring.metricWriter; do
    gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${runtime_email}" --role="roles/${role}" >/dev/null
  done
done

# (e) WIF 바인딩: gha-deployer는 이 리포에서만 대신 사용할 수 있다(T-1-29)
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_EMAIL" --project="$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

# (f) VPC: 프라이빗 서비스 접근(Cloud SQL --no-assign-ip 전제)
if ! gcloud compute networks describe "$NETWORK" --project="$PROJECT" >/dev/null 2>&1; then
  echo "network '$NETWORK' not found — creating it (org policies permitting)" >&2
  gcloud compute networks create "$NETWORK" --project="$PROJECT" --subnet-mode=auto
fi

if ! gcloud compute addresses describe "$VPC_RANGE" --global --project="$PROJECT" >/dev/null 2>&1; then
  gcloud compute addresses create "$VPC_RANGE" --global --project="$PROJECT" \
    --purpose=VPC_PEERING --prefix-length=16 --network="$NETWORK"
fi

EXISTING_PEERING="$(gcloud services vpc-peerings list --network="$NETWORK" --service=servicenetworking.googleapis.com --project="$PROJECT" 2>/dev/null || true)"
if ! printf '%s\n' "$EXISTING_PEERING" | grep -qF "$VPC_RANGE"; then
  gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com \
    --ranges="$VPC_RANGE" --network="$NETWORK" --project="$PROJECT"
fi

# (g) 조직 정책 확인(실패해도 계속, 결과만 출력 — CEO 저확신 항목)
for constraint in iam.allowedPolicyMemberDomains run.allowedIngress compute.restrictVpcPeering iam.workloadIdentityPoolProviders; do
  echo "org policy ${constraint}:" >&2
  gcloud org-policies describe "$constraint" --project="$PROJECT" --effective 2>&1 >&2 || true
done

# 도메인 매핑 리전 확인(A1·D-15) — 결과를 그대로 출력한다(에러여도 계속)
gcloud beta run domain-mappings list --region="$REGION" --project="$PROJECT" 2>&1 >&2 || true

echo "GCP_PROJECT_ID=${PROJECT}"
echo "GCP_PROJECT_NUMBER=${PROJECT_NUMBER}"
echo "GCP_REGION=${REGION}"
cat >&2 <<EOF

다음을 GitHub 저장소(비공개, ${GITHUB_REPO}) Settings → Secrets and variables →
Actions → Variables 탭에 저장소 수준으로 추가하세요(Secrets 탭은 비워 둡니다 —
WIF라 키 파일이 없습니다; GitHub Environments는 만들지 않습니다, D-05):
  GCP_PROJECT_ID=${PROJECT}
  GCP_PROJECT_NUMBER=${PROJECT_NUMBER}
  GCP_REGION=${REGION}
  ALERT_EMAIL=<경보를 받을 이메일>
EOF
