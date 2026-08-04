-- CreateTable
CREATE TABLE "iot_device_maps" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iot_device_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iot_device_maps_device_id_key" ON "iot_device_maps"("device_id");

-- CreateIndex
CREATE INDEX "iot_device_maps_project_id_idx" ON "iot_device_maps"("project_id");

-- AddForeignKey
ALTER TABLE "iot_device_maps" ADD CONSTRAINT "iot_device_maps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
