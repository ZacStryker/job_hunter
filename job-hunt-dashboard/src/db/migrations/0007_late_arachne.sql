ALTER TABLE `messages` ADD `message_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_message_id_unique` ON `messages` (`message_id`);