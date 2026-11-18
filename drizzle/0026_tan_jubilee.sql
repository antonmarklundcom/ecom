CREATE TABLE `enquiry_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` date NOT NULL,
	`product_id` int unsigned NOT NULL DEFAULT 0,
	`variant_id` int unsigned NOT NULL DEFAULT 0,
	`origin` enum('producto','tarjeta','flotante','guia','contacto') NOT NULL,
	`count` int unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `enquiry_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `enquiry_daily_key_uq` UNIQUE(`day`,`product_id`,`variant_id`,`origin`)
);
--> statement-breakpoint
CREATE TABLE `search_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day` date NOT NULL,
	`term` varchar(80) NOT NULL,
	`zero_results` boolean NOT NULL DEFAULT false,
	`count` int unsigned NOT NULL DEFAULT 0,
	CONSTRAINT `search_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `search_daily_key_uq` UNIQUE(`day`,`term`,`zero_results`)
);
--> statement-breakpoint
CREATE INDEX `enquiry_daily_product_idx` ON `enquiry_daily` (`product_id`,`day`);