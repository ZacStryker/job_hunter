CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text NOT NULL,
	`received_at` text NOT NULL,
	`from_address` text NOT NULL,
	`subject` text NOT NULL,
	`type` text,
	`company` text,
	`job_title` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_uid_unique` ON `messages` (`uid`);
