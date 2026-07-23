-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'project_owner', 'esg_manager', 'verifier');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "ProjectLifecycle" AS ENUM ('unregistered', 'pdd_draft', 'under_validation', 'registered', 'rejected');

-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('meter_reading', 'utility_bill', 'commissioning_report', 'site_photo', 'maintenance_report', 'supporting_evidence', 'verification_report');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('active', 'superseded', 'archived');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('pdf', 'image', 'xlsx');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('draft', 'submitted', 'under_review', 'revision_required', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PddState" AS ENUM ('draft', 'submitted', 'under_validation', 'revision_required', 'registered', 'rejected');

-- CreateEnum
CREATE TYPE "MethodologyStatus" AS ENUM ('active', 'deprecated');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "refresh_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "capacity_kwp" DOUBLE PRECISION NOT NULL,
    "commission_date" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "lifecycle_stage" "ProjectLifecycle" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_records" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "record_date" TEXT NOT NULL,
    "generation_kwh" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "param_key" TEXT,
    "unit" TEXT,

    CONSTRAINT "monitoring_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emission_factors" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "factor_kgco2e_per_kwh" DOUBLE PRECISION NOT NULL,
    "effective_date" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_current" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emission_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_files" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "category" "EvidenceCategory" NOT NULL,
    "file_name" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "file_size" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "description" TEXT,
    "content_hash" TEXT NOT NULL,
    "storage_path" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "uploaded_by_name" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "assigned_verifier_name" TEXT NOT NULL,
    "state" "VerificationState" NOT NULL,
    "monitoring_period_start" TEXT NOT NULL,
    "monitoring_period_end" TEXT NOT NULL,
    "reduction_kgco2e" DOUBLE PRECISION NOT NULL,
    "factors_snapshot" TEXT NOT NULL,
    "evidence_ids" TEXT[],
    "required_categories" "EvidenceCategory"[],
    "submitted_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "sla_target_days" INTEGER NOT NULL,
    "rejection_reason" TEXT,
    "hash_value" TEXT,
    "credential_id" TEXT,
    "anchored_at" TIMESTAMP(3),
    "hcs_topic_id" TEXT,
    "hcs_sequence_number" INTEGER,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_comments" (
    "id" TEXT NOT NULL,
    "verification_id" TEXT NOT NULL,
    "evidence_id" TEXT,
    "evidence_name" TEXT,
    "section_key" TEXT,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_role" "UserRole" NOT NULL,
    "body" TEXT NOT NULL,
    "reply_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "methodologies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "MethodologyStatus" NOT NULL,
    "document" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "methodologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdds" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "methodology_id" TEXT NOT NULL,
    "methodology_snapshot" TEXT NOT NULL,
    "state" "PddState" NOT NULL,
    "section_data" JSONB NOT NULL,
    "disclosure_salts" JSONB,
    "evidence_ids" TEXT[],
    "assigned_validator_name" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "content_hash" TEXT,
    "ipfs_cid" TEXT,
    "credential_id" TEXT,
    "rejection_reason" TEXT,

    CONSTRAINT "pdds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "schema_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_tokens" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "serial_number" INTEGER NOT NULL,
    "project_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "amount_tco2e" DOUBLE PRECISION NOT NULL,
    "monitoring_period_start" TEXT NOT NULL,
    "monitoring_period_end" TEXT NOT NULL,
    "minted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minted_by_role" "UserRole" NOT NULL,
    "hcs" JSONB NOT NULL,

    CONSTRAINT "guardian_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_role" "UserRole",
    "ip_address" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB,
    "row_hash" TEXT NOT NULL,
    "prev_row_hash" TEXT,
    "hcs_topic_id" TEXT,
    "hcs_sequence_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "monitoring_records_project_id_record_date_idx" ON "monitoring_records"("project_id", "record_date");

-- CreateIndex
CREATE INDEX "evidence_files_project_id_idx" ON "evidence_files"("project_id");

-- CreateIndex
CREATE INDEX "verification_requests_project_id_idx" ON "verification_requests"("project_id");

-- CreateIndex
CREATE INDEX "verification_comments_verification_id_idx" ON "verification_comments"("verification_id");

-- CreateIndex
CREATE UNIQUE INDEX "methodologies_code_version_key" ON "methodologies"("code", "version");

-- CreateIndex
CREATE INDEX "pdds_project_id_idx" ON "pdds"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_tokens_credential_id_key" ON "guardian_tokens"("credential_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "evidence_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_comments" ADD CONSTRAINT "verification_comments_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verification_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdds" ADD CONSTRAINT "pdds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdds" ADD CONSTRAINT "pdds_methodology_id_fkey" FOREIGN KEY ("methodology_id") REFERENCES "methodologies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_tokens" ADD CONSTRAINT "guardian_tokens_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
