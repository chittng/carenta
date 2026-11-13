-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "DriverLicenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DriverLicenseClass" AS ENUM ('B', 'C1', 'C', 'D1', 'D2', 'D', 'BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE', 'LEGACY_B1', 'LEGACY_B2', 'LEGACY_C', 'LEGACY_D', 'LEGACY_E', 'LEGACY_FB2', 'LEGACY_FC', 'LEGACY_FD', 'LEGACY_FE');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('BOOKING_PAYOUT', 'CANCELLATION_PAYOUT', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "CarStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'REJECTED', 'ACTIVE', 'PAUSED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('SEDAN', 'SUV', 'CROSSOVER', 'MPV', 'HATCHBACK', 'PICKUP');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID');

-- CreateEnum
CREATE TYPE "CarDocumentType" AS ENUM ('REGISTRATION', 'INSPECTION');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_APPROVAL', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'RETURNED', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PickupMethod" AS ENUM ('SELF_PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('RENTER', 'OWNER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BookingExtensionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PAID', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('VNPAY');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('BOOKING', 'EXTENSION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('CANCELLATION', 'DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TripReportType" AS ENUM ('PICKUP', 'RETURN');

-- CreateEnum
CREATE TYPE "TripReportPhotoKind" AS ENUM ('FRONT', 'BACK', 'LEFT', 'RIGHT', 'ODOMETER', 'FUEL', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeCategory" AS ENUM ('DAMAGE', 'CLEANING', 'FUEL', 'TRAFFIC_FINE', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeRenterResponse" AS ENUM ('ACCEPTED', 'CONTESTED');

-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('RENTER_TO_OWNER', 'OWNER_TO_RENTER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_key" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locked_at" TIMESTAMPTZ(3),
    "lock_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_licenses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "license_class" "DriverLicenseClass" NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "expires_on" DATE,
    "front_image_key" TEXT NOT NULL,
    "back_image_key" TEXT NOT NULL,
    "status" "DriverLicenseStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "driver_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "booking_id" UUID,
    "withdrawal_request_id" UUID,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_makes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "car_makes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_models" (
    "id" SERIAL NOT NULL,
    "make_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "car_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "cars" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "model_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "license_plate" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "body_type" "BodyType" NOT NULL,
    "seats" INTEGER NOT NULL,
    "transmission" "Transmission" NOT NULL,
    "fuel_type" "FuelType" NOT NULL,
    "fuel_consumption" DECIMAL(5,1),
    "odometer_km" INTEGER NOT NULL,
    "description" TEXT,
    "rule_no_smoking" BOOLEAN NOT NULL DEFAULT false,
    "rule_no_pets" BOOLEAN NOT NULL DEFAULT false,
    "rule_no_durian_seafood" BOOLEAN NOT NULL DEFAULT false,
    "rule_same_fuel_level" BOOLEAN NOT NULL DEFAULT false,
    "rule_keep_clean" BOOLEAN NOT NULL DEFAULT false,
    "rules_note" TEXT,
    "daily_km_limit" INTEGER,
    "extra_km_fee" INTEGER,
    "province" TEXT NOT NULL,
    "ward" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_max_radius_km" INTEGER,
    "delivery_fee_per_km" INTEGER,
    "delivery_free_radius_km" INTEGER,
    "instant_book" BOOLEAN NOT NULL DEFAULT false,
    "deposit_amount" INTEGER NOT NULL DEFAULT 5000000,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 120,
    "status" "CarStatus" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "hidden_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_photos" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_documents" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "type" "CarDocumentType" NOT NULL,
    "file_key" TEXT NOT NULL,
    "expires_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_amenities" (
    "car_id" UUID NOT NULL,
    "amenity_id" INTEGER NOT NULL,

    CONSTRAINT "car_amenities_pkey" PRIMARY KEY ("car_id","amenity_id")
);

-- CreateTable
CREATE TABLE "car_pricings" (
    "car_id" UUID NOT NULL,
    "hourly_price" INTEGER,
    "daily_price" INTEGER,
    "monthly_price" INTEGER,
    "min_duration_hours" INTEGER NOT NULL,
    "max_duration_days" INTEGER NOT NULL,
    "weekend_surcharge_percent" INTEGER,
    "holiday_surcharge_percent" INTEGER,
    "long_rental_discount_percent" INTEGER,
    "late_fee_per_hour" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "car_pricings_pkey" PRIMARY KEY ("car_id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "renter_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "blocked_until" TIMESTAMPTZ(3) NOT NULL,
    "pickup_method" "PickupMethod" NOT NULL,
    "delivery_address" TEXT,
    "delivery_latitude" DECIMAL(9,6),
    "delivery_longitude" DECIMAL(9,6),
    "delivery_distance_km" DECIMAL(6,2),
    "pricing_snapshot" JSONB NOT NULL,
    "price_breakdown" JSONB NOT NULL,
    "rental_amount" INTEGER NOT NULL,
    "delivery_fee" INTEGER NOT NULL,
    "deposit_amount" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "commission_rate_percent" INTEGER NOT NULL,
    "commission_amount" INTEGER NOT NULL,
    "late_fee" INTEGER NOT NULL DEFAULT 0,
    "extra_km_fee" INTEGER NOT NULL DEFAULT 0,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "approval_deadline_at" TIMESTAMPTZ(3),
    "payment_deadline_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "picked_up_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" "ActorRole",
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_logs" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_role" "ActorRole" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_extensions" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "previous_end_at" TIMESTAMPTZ(3) NOT NULL,
    "requested_end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "BookingExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "price_breakdown" JSONB NOT NULL,
    "extra_amount" INTEGER NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "extension_id" UUID,
    "purpose" "PaymentPurpose" NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'VNPAY',
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "txn_ref" TEXT NOT NULL,
    "provider_transaction_no" TEXT,
    "bank_code" TEXT,
    "response_code" TEXT,
    "raw_response" JSONB,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "RefundType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "request_id" TEXT NOT NULL,
    "provider_transaction_no" TEXT,
    "response_code" TEXT,
    "raw_response" JSONB,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_reports" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "type" "TripReportType" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "fuel_level_percent" INTEGER NOT NULL,
    "notes" TEXT,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trip_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_report_photos" (
    "id" UUID NOT NULL,
    "trip_report_id" UUID NOT NULL,
    "kind" "TripReportPhotoKind" NOT NULL,
    "file_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "category" "DisputeCategory" NOT NULL,
    "claimed_amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "response_deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "renter_response" "DisputeRenterResponse",
    "renter_response_note" TEXT,
    "renter_responded_at" TIMESTAMPTZ(3),
    "resolved_amount" INTEGER,
    "resolution_note" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "file_key" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "author_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "car_id" UUID NOT NULL,
    "renter_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "type" "MessageType" NOT NULL,
    "body" TEXT,
    "image_key" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "driver_licenses_user_id_key" ON "driver_licenses"("user_id");

-- CreateIndex
CREATE INDEX "driver_licenses_status_submitted_at_idx" ON "driver_licenses"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "driver_licenses_license_number_idx" ON "driver_licenses"("license_number");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_booking_id_idx" ON "wallet_transactions"("booking_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_withdrawal_request_id_idx" ON "wallet_transactions"("withdrawal_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_user_id_key" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_user_id_created_at_idx" ON "withdrawal_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "car_makes_name_key" ON "car_makes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "car_makes_slug_key" ON "car_makes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "car_models_make_id_name_key" ON "car_models"("make_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "car_models_make_id_slug_key" ON "car_models"("make_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_code_key" ON "amenities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "cars_license_plate_key" ON "cars"("license_plate");

-- CreateIndex
CREATE INDEX "cars_owner_id_idx" ON "cars"("owner_id");

-- CreateIndex
CREATE INDEX "cars_status_province_idx" ON "cars"("status", "province");

-- CreateIndex
CREATE INDEX "cars_latitude_longitude_idx" ON "cars"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "cars_model_id_idx" ON "cars"("model_id");

-- CreateIndex
CREATE INDEX "car_photos_car_id_position_idx" ON "car_photos"("car_id", "position");

-- CreateIndex
CREATE INDEX "car_documents_car_id_type_idx" ON "car_documents"("car_id", "type");

-- CreateIndex
CREATE INDEX "car_amenities_amenity_id_idx" ON "car_amenities"("amenity_id");

-- CreateIndex
CREATE INDEX "availability_blocks_car_id_start_at_idx" ON "availability_blocks"("car_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_car_id_start_at_idx" ON "bookings"("car_id", "start_at");

-- CreateIndex
CREATE INDEX "bookings_renter_id_created_at_idx" ON "bookings"("renter_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_owner_id_created_at_idx" ON "bookings"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "booking_status_logs_booking_id_created_at_idx" ON "booking_status_logs"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_extensions_booking_id_idx" ON "booking_extensions"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_txn_ref_key" ON "payments"("txn_ref");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_request_id_key" ON "refunds"("request_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_booking_id_idx" ON "refunds"("booking_id");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trip_reports_booking_id_type_key" ON "trip_reports"("booking_id", "type");

-- CreateIndex
CREATE INDEX "trip_report_photos_trip_report_id_idx" ON "trip_report_photos"("trip_report_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_booking_id_key" ON "disputes"("booking_id");

-- CreateIndex
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");

-- CreateIndex
CREATE INDEX "dispute_evidence_dispute_id_idx" ON "dispute_evidence"("dispute_id");

-- CreateIndex
CREATE INDEX "reviews_subject_user_id_published_at_idx" ON "reviews"("subject_user_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_direction_key" ON "reviews"("booking_id", "direction");

-- CreateIndex
CREATE INDEX "conversations_renter_id_last_message_at_idx" ON "conversations"("renter_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_owner_id_last_message_at_idx" ON "conversations"("owner_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_car_id_renter_id_key" ON "conversations"("car_id", "renter_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_template_created_at_idx" ON "notifications"("user_id", "template", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- AddForeignKey
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_licenses" ADD CONSTRAINT "driver_licenses_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_withdrawal_request_id_fkey" FOREIGN KEY ("withdrawal_request_id") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_models" ADD CONSTRAINT "car_models_make_id_fkey" FOREIGN KEY ("make_id") REFERENCES "car_makes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "car_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_photos" ADD CONSTRAINT "car_photos_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_documents" ADD CONSTRAINT "car_documents_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_amenities" ADD CONSTRAINT "car_amenities_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_amenities" ADD CONSTRAINT "car_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_pricings" ADD CONSTRAINT "car_pricings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_logs" ADD CONSTRAINT "booking_status_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_logs" ADD CONSTRAINT "booking_status_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_extensions" ADD CONSTRAINT "booking_extensions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "booking_extensions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reports" ADD CONSTRAINT "trip_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reports" ADD CONSTRAINT "trip_reports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_reports" ADD CONSTRAINT "trip_reports_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_report_photos" ADD CONSTRAINT "trip_report_photos_trip_report_id_fkey" FOREIGN KEY ("trip_report_id") REFERENCES "trip_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_renter_id_fkey" FOREIGN KEY ("renter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Constraints Prisma cannot express ──────────────────────────────────────

-- Needed to combine "car_id WITH =" and a range in one GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- No double booking: a car cannot have two bookings that hold the calendar over overlapping
-- [start_at, blocked_until) ranges. blocked_until already includes the cleaning buffer.
-- PENDING_APPROVAL does not hold the calendar; owner acceptance moves the booking to
-- AWAITING_PAYMENT, which fails here if another booking already took the slot.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "car_id" WITH =,
    tstzrange("start_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" IN ('AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'));

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_time_range_check" CHECK ("end_at" > "start_at" AND "blocked_until" >= "end_at"),
  ADD CONSTRAINT "bookings_amounts_check" CHECK (
    "rental_amount" >= 0 AND "delivery_fee" >= 0 AND "deposit_amount" >= 0
    AND "commission_amount" >= 0 AND "late_fee" >= 0 AND "extra_km_fee" >= 0
    AND "total_amount" = "rental_amount" + "delivery_fee" + "deposit_amount"
  ),
  ADD CONSTRAINT "bookings_commission_rate_check" CHECK ("commission_rate_percent" BETWEEN 0 AND 100);

ALTER TABLE "availability_blocks"
  ADD CONSTRAINT "availability_blocks_time_range_check" CHECK ("end_at" > "start_at");

ALTER TABLE "booking_extensions"
  ADD CONSTRAINT "booking_extensions_time_range_check" CHECK ("requested_end_at" > "previous_end_at"),
  ADD CONSTRAINT "booking_extensions_amount_check" CHECK ("extra_amount" >= 0);

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_check" CHECK ("balance" >= 0);

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_amount_check" CHECK ("amount" <> 0),
  ADD CONSTRAINT "wallet_transactions_balance_after_check" CHECK ("balance_after" >= 0);

ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_amount_check" CHECK ("amount" > 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0);

ALTER TABLE "car_pricings"
  ADD CONSTRAINT "car_pricings_unit_enabled_check" CHECK (
    "hourly_price" IS NOT NULL OR "daily_price" IS NOT NULL OR "monthly_price" IS NOT NULL
  ),
  ADD CONSTRAINT "car_pricings_prices_check" CHECK (
    ("hourly_price" IS NULL OR "hourly_price" > 0)
    AND ("daily_price" IS NULL OR "daily_price" > 0)
    AND ("monthly_price" IS NULL OR "monthly_price" > 0)
    AND ("late_fee_per_hour" IS NULL OR "late_fee_per_hour" >= 0)
  ),
  ADD CONSTRAINT "car_pricings_percent_check" CHECK (
    ("weekend_surcharge_percent" IS NULL OR "weekend_surcharge_percent" BETWEEN 0 AND 100)
    AND ("holiday_surcharge_percent" IS NULL OR "holiday_surcharge_percent" BETWEEN 0 AND 100)
    AND ("long_rental_discount_percent" IS NULL OR "long_rental_discount_percent" BETWEEN 0 AND 100)
  ),
  ADD CONSTRAINT "car_pricings_duration_check" CHECK ("min_duration_hours" > 0 AND "max_duration_days" > 0);

ALTER TABLE "cars"
  ADD CONSTRAINT "cars_deposit_check" CHECK ("deposit_amount" >= 0),
  ADD CONSTRAINT "cars_buffer_check" CHECK ("buffer_minutes" >= 0),
  ADD CONSTRAINT "cars_seats_check" CHECK ("seats" > 0),
  ADD CONSTRAINT "cars_odometer_check" CHECK ("odometer_km" >= 0);

ALTER TABLE "trip_reports"
  ADD CONSTRAINT "trip_reports_fuel_level_check" CHECK ("fuel_level_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "trip_reports_odometer_check" CHECK ("odometer_km" >= 0);

ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_amounts_check" CHECK (
    "claimed_amount" > 0 AND ("resolved_amount" IS NULL OR "resolved_amount" >= 0)
  );

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
