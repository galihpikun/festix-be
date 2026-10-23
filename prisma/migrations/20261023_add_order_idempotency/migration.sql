-- Add idempotency support to orders table
ALTER TABLE "orders" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "orders" ADD COLUMN "request_fingerprint" TEXT;

-- Scoped unique constraint: one idempotency key per user
CREATE UNIQUE INDEX "orders_user_id_idempotency_key_key" ON "orders"("user_id", "idempotency_key");
