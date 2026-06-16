CREATE TABLE IF NOT EXISTS `gmail_label_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`label` text NOT NULL,
	`job_status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gmail_label_mappings_user_id_idx` ON `gmail_label_mappings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `gmail_label_mappings_user_label_unique_idx` ON `gmail_label_mappings` (`user_id`,`label`);
