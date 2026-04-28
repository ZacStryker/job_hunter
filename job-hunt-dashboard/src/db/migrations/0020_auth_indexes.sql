ALTER TABLE `users` ADD `activation_token_expires_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_activation_token_idx` ON `users` (`activation_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_reset_token_idx` ON `users` (`reset_token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);