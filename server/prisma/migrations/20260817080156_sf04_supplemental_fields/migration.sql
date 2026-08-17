-- AlterTable
ALTER TABLE "rec_issue_requests" ADD COLUMN     "facility_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requested_labels" TEXT NOT NULL DEFAULT '';
