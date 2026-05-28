CREATE TABLE `user_embeddings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`embedding` text NOT NULL,
	`profile_hash` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `relevance_score` real;
