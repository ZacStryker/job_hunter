ALTER TABLE `webhook_runs` ADD `user_id` integer DEFAULT 1 NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `webhook_runs_user_id_idx` ON `webhook_runs` (`user_id`);