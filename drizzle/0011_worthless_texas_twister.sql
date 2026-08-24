CREATE TABLE `analytics_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`visit_id` varchar(32) NOT NULL,
	`type` enum('visita','carrito_agregado','checkout_iniciado','compra') NOT NULL,
	`path` varchar(255),
	`variant_id` int,
	`order_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_variant_id_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `analytics_events` ADD CONSTRAINT `analytics_events_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `analytics_type_created_idx` ON `analytics_events` (`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_visit_idx` ON `analytics_events` (`visit_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analytics_variant_idx` ON `analytics_events` (`variant_id`);--> statement-breakpoint
CREATE INDEX `analytics_created_idx` ON `analytics_events` (`created_at`);