/*
  Warnings:

  - Added the required column `project_id` to the `credentials` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "credentials" ADD COLUMN     "project_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "credentials_project_id_idx" ON "credentials"("project_id");

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
