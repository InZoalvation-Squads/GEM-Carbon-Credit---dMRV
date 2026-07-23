-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "emission_factors_country_source_version_key" ON "emission_factors"("country", "source", "version");

