-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "anchor" JSONB;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "hcs_topic_id" TEXT;
