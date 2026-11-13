-- CreateEnum
CREATE TYPE "CarRevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "car_documents" ADD COLUMN     "revision_id" UUID;

-- CreateTable
CREATE TABLE "car_revisions" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "status" "CarRevisionStatus" NOT NULL DEFAULT 'PENDING',
    "model_id" INTEGER,
    "year" INTEGER,
    "license_plate" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "car_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "car_revisions_car_id_created_at_idx" ON "car_revisions"("car_id", "created_at");

-- CreateIndex
CREATE INDEX "car_revisions_status_updated_at_idx" ON "car_revisions"("status", "updated_at");

-- CreateIndex
CREATE INDEX "car_documents_revision_id_idx" ON "car_documents"("revision_id");

-- AddForeignKey
ALTER TABLE "car_documents" ADD CONSTRAINT "car_documents_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "car_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_revisions" ADD CONSTRAINT "car_revisions_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_revisions" ADD CONSTRAINT "car_revisions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_revisions" ADD CONSTRAINT "car_revisions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraints Prisma cannot express (spec §4.1, §12.3)

-- At most one revision waiting for review per car; further edits overwrite it.
CREATE UNIQUE INDEX "car_revisions_one_pending_per_car"
  ON "car_revisions" ("car_id") WHERE "status" = 'PENDING';

-- A plate requested by a pending revision cannot be requested by another one.
CREATE UNIQUE INDEX "car_revisions_pending_license_plate_key"
  ON "car_revisions" ("license_plate") WHERE "status" = 'PENDING' AND "license_plate" IS NOT NULL;

-- One current document of each type per car, and one of each type per revision.
CREATE UNIQUE INDEX "car_documents_current_type_key"
  ON "car_documents" ("car_id", "type") WHERE "revision_id" IS NULL;
CREATE UNIQUE INDEX "car_documents_revision_type_key"
  ON "car_documents" ("revision_id", "type") WHERE "revision_id" IS NOT NULL;

ALTER TABLE "car_documents"
  ADD CONSTRAINT "car_documents_inspection_expiry_check"
  CHECK ("type" <> 'INSPECTION' OR "expires_on" IS NOT NULL);

-- The mileage limit and its per-km fee are set together.
ALTER TABLE "cars"
  ADD CONSTRAINT "cars_km_limit_check" CHECK (("daily_km_limit" IS NULL) = ("extra_km_fee" IS NULL));
