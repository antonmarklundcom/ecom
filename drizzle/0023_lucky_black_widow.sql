CREATE TABLE `product_slug_redirects` (
	`slug` varchar(160) NOT NULL,
	`product_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_slug_redirects_slug` PRIMARY KEY(`slug`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_title` varchar(200);--> statement-breakpoint
ALTER TABLE `categories` ADD `seo_description` varchar(500);--> statement-breakpoint
ALTER TABLE `products` ADD `specifications` json;--> statement-breakpoint
ALTER TABLE `products` ADD `supplier_details` json;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_title` varchar(200);--> statement-breakpoint
ALTER TABLE `products` ADD `seo_description` varchar(500);--> statement-breakpoint
ALTER TABLE `variants` ADD `attributes` json;--> statement-breakpoint
ALTER TABLE `variants` ADD `identifiers` json;--> statement-breakpoint
ALTER TABLE `product_slug_redirects` ADD CONSTRAINT `product_slug_redirects_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `product_slug_redirects_product_idx` ON `product_slug_redirects` (`product_id`);
--> statement-breakpoint
INSERT INTO `product_slug_redirects` (`slug`, `product_id`) SELECT `slug`, `id` FROM `products`;
