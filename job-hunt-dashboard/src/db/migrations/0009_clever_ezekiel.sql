CREATE TABLE `webhook_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`run_at` text NOT NULL,
	`success` integer NOT NULL,
	`item_count` integer,
	`error_message` text
);
