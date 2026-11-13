-- Rental terms (spec §4.2–4.6, §12.4). The API validates the same rules with zod;
-- these checks keep the invariants the booking and pricing code relies on.

-- The late fee defaults to 10% of the daily price, so a car without one must set it.
-- A minimum rental time longer than the maximum would make the car impossible to book.
ALTER TABLE "car_pricings"
  ADD CONSTRAINT "car_pricings_late_fee_check" CHECK (
    "daily_price" IS NOT NULL OR "late_fee_per_hour" IS NOT NULL
  ),
  ADD CONSTRAINT "car_pricings_duration_range_check" CHECK (
    "min_duration_hours" <= "max_duration_days" * 24
  );

-- Deposit up to 50.000.000đ; buffer up to a day, in 30-minute steps like booking times.
-- Delivery settings are all set when delivery is on and all null when it is off.
ALTER TABLE "cars"
  ADD CONSTRAINT "cars_deposit_max_check" CHECK ("deposit_amount" <= 50000000),
  ADD CONSTRAINT "cars_buffer_step_check" CHECK (
    "buffer_minutes" <= 1440 AND "buffer_minutes" % 30 = 0
  ),
  ADD CONSTRAINT "cars_delivery_check" CHECK (
    (
      "delivery_enabled"
      AND "delivery_max_radius_km" IS NOT NULL
      AND "delivery_fee_per_km" IS NOT NULL
      AND "delivery_free_radius_km" IS NOT NULL
      AND "delivery_max_radius_km" > 0
      AND "delivery_fee_per_km" >= 0
      AND "delivery_free_radius_km" BETWEEN 0 AND "delivery_max_radius_km"
    )
    OR (
      NOT "delivery_enabled"
      AND "delivery_max_radius_km" IS NULL
      AND "delivery_fee_per_km" IS NULL
      AND "delivery_free_radius_km" IS NULL
    )
  );
