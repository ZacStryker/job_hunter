CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`job_title` text NOT NULL,
	`fit_score` integer,
	`recommendation` text,
	`role_fit` text,
	`requirements_met` text,
	`requirements_missed` text,
	`red_flags` text,
	`job_description` text,
	`source_url` text,
	`date_scraped` text,
	`applied` integer DEFAULT false NOT NULL,
	`status` text,
	`status_override` text,
	`cover_letter_sent_at` text,
	`date_applied` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `company_job_title_idx` ON `jobs` (`company`,`job_title`);