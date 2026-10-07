ALTER TABLE `product_images` ADD `provenance` enum('supplier-authorized','owned-photo','illustrative');--> statement-breakpoint
ALTER TABLE `product_images` ADD `verified_at` timestamp(3);