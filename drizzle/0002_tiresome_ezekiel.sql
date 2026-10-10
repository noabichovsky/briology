CREATE TABLE `drive_root` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`refresh_token` text NOT NULL,
	`connected_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`connected_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
