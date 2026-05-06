ALTER TABLE `profile` ADD `user_id` integer NOT NULL DEFAULT 1 REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_user_id_idx` ON `profile` (`user_id`);