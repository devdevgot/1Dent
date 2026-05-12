-- Add 'hourly' salary type for hourly-rate employees
ALTER TYPE "salary_type" ADD VALUE IF NOT EXISTS 'hourly';
