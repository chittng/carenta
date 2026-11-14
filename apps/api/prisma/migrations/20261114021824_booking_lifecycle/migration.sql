-- CreateEnum
CREATE TYPE "BookingJobAction" AS ENUM ('SCHEDULE', 'CANCEL');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "checkout_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "request_fingerprint" VARCHAR(64),
ADD COLUMN     "request_id" UUID;

-- CreateTable
CREATE TABLE "booking_job_outbox" (
    "job_id" VARCHAR(200) NOT NULL,
    "booking_id" UUID NOT NULL,
    "action" "BookingJobAction" NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "run_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_job_outbox_pkey" PRIMARY KEY ("job_id")
);

-- CreateIndex
CREATE INDEX "booking_job_outbox_updated_at_idx" ON "booking_job_outbox"("updated_at");

-- CreateIndex
CREATE INDEX "booking_job_outbox_booking_id_idx" ON "booking_job_outbox"("booking_id");

-- CreateIndex
CREATE INDEX "bookings_status_approval_deadline_at_idx" ON "bookings"("status", "approval_deadline_at");

-- CreateIndex
CREATE INDEX "bookings_status_payment_deadline_at_idx" ON "bookings"("status", "payment_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_renter_id_request_id_key" ON "bookings"("renter_id", "request_id");

-- AddForeignKey
ALTER TABLE "booking_job_outbox" ADD CONSTRAINT "booking_job_outbox_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Imported/legacy rows can omit the request id. API rows bind it to one canonical payload.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_request_fingerprint_check" CHECK (
    ("request_id" IS NULL AND "request_fingerprint" IS NULL)
    OR ("request_id" IS NOT NULL AND "request_fingerprint" ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE "booking_job_outbox"
  ADD CONSTRAINT "booking_job_outbox_run_at_check" CHECK (
    ("action" = 'SCHEDULE' AND "run_at" IS NOT NULL)
    OR ("action" = 'CANCEL' AND "run_at" IS NULL)
  );
