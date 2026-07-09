DROP INDEX IF EXISTS `messages_uid_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `messages_message_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_uid_user_id_idx` ON `messages` (`uid`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_message_id_user_id_idx` ON `messages` (`message_id`,`user_id`);