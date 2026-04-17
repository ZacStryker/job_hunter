CREATE TABLE `prompts` (
	`flow` text PRIMARY KEY NOT NULL,
	`system_prompt` text,
	`user_message` text NOT NULL,
	`updated_at` text NOT NULL
);
