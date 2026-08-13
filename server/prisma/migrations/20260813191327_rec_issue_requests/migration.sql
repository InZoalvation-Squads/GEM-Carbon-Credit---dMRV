-- CreateEnum
CREATE TYPE "RecIssueState" AS ENUM ('draft', 'submitted', 'issued', 'rejected');

-- CreateTable
CREATE TABLE "rec_issue_requests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "assigned_reviewer_name" TEXT NOT NULL,
    "state" "RecIssueState" NOT NULL,
    "request_type" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "total_production_mwh" DOUBLE PRECISION NOT NULL,
    "applied_mwh" DOUBLE PRECISION,
    "facility_snapshot" JSONB NOT NULL,
    "receiving_org_name" TEXT NOT NULL,
    "receiving_account_id" TEXT NOT NULL,
    "evidence_ids" TEXT[],
    "submitted_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rec_issue_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rec_issue_requests_project_id_idx" ON "rec_issue_requests"("project_id");

-- AddForeignKey
ALTER TABLE "rec_issue_requests" ADD CONSTRAINT "rec_issue_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
