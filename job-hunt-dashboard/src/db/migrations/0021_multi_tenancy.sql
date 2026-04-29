ALTER TABLE `jobs` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `jobs_user_id_idx` ON `jobs` (`user_id`);
--> statement-breakpoint
ALTER TABLE `search_configs` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `search_configs_user_id_idx` ON `search_configs` (`user_id`);
--> statement-breakpoint
ALTER TABLE `cover_letters` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `cover_letters_user_id_idx` ON `cover_letters` (`user_id`);
--> statement-breakpoint
ALTER TABLE `messages` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `messages_user_id_idx` ON `messages` (`user_id`);
