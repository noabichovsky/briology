CREATE TABLE `drive_links` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`refresh_token` text NOT NULL,
	`connected_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_links_client_id_unique` ON `drive_links` (`client_id`);