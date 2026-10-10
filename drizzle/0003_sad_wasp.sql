CREATE TABLE `client_members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`folder_id` text NOT NULL,
	`folder_name` text NOT NULL,
	`invited_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_members_email_unique` ON `client_members` (`email`);