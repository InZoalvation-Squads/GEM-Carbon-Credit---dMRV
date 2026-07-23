-- CreateIndex
CREATE INDEX "evidence_files_parent_id_idx" ON "evidence_files"("parent_id");

-- CreateIndex
CREATE INDEX "guardian_tokens_project_id_idx" ON "guardian_tokens"("project_id");

-- CreateIndex
CREATE INDEX "pdds_methodology_id_idx" ON "pdds"("methodology_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
