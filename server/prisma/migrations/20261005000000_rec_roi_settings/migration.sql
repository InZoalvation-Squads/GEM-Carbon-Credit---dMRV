-- CreateTable
CREATE TABLE "rec_roi_settings" (
    "organization_id" TEXT NOT NULL,
    "price_low_thb" DOUBLE PRECISION,
    "price_mid_thb" DOUBLE PRECISION,
    "price_high_thb" DOUBLE PRECISION,
    "price_source" TEXT NOT NULL DEFAULT '',
    "platform_fee_pct" DOUBLE PRECISION,
    "eur_thb" DOUBLE PRECISION,
    "eur_thb_source" TEXT NOT NULL DEFAULT '',
    "horizon_years" INTEGER NOT NULL DEFAULT 5,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rec_roi_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "rec_roi_project_settings" (
    "project_id" TEXT NOT NULL,
    "issuance_type" TEXT NOT NULL DEFAULT 'Normal',
    "digital_meter_exempt" BOOLEAN NOT NULL DEFAULT false,
    "investment_mthb" DOUBLE PRECISION,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rec_roi_project_settings_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "rec_roi_settings" ADD CONSTRAINT "rec_roi_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rec_roi_project_settings" ADD CONSTRAINT "rec_roi_project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

