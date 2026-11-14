-- DropIndex
DROP INDEX "driver_licenses_user_id_key";

-- CreateIndex
CREATE INDEX "driver_licenses_user_id_idx" ON "driver_licenses"("user_id");

-- At most one current license (approved or expired) and one submission (pending or
-- rejected) per user, so a renewal can wait for review next to the approved license.
CREATE UNIQUE INDEX "driver_licenses_one_current_per_user"
  ON "driver_licenses" ("user_id") WHERE "status" IN ('APPROVED', 'EXPIRED');
CREATE UNIQUE INDEX "driver_licenses_one_submission_per_user"
  ON "driver_licenses" ("user_id") WHERE "status" IN ('PENDING', 'REJECTED');

-- Every car license class has an expiry date (spec §3).
ALTER TABLE "driver_licenses" ALTER COLUMN "expires_on" SET NOT NULL;
