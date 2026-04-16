-- Add 'cancelled' status to treatment_plan_status enum for archiving plans
ALTER TYPE "treatment_plan_status" ADD VALUE IF NOT EXISTS 'cancelled';
