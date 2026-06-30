CREATE TABLE IF NOT EXISTS `setup_dismissals` (
	`user_id` integer NOT NULL,
	`task_id` text NOT NULL,
	`dismissed_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `task_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
