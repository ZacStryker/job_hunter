ALTER TABLE `jobs` ADD `job_reqs_met` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `job_reqs_missed` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `candidate_reqs_met` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `candidate_reqs_missed` text;--> statement-breakpoint
UPDATE `jobs` SET `job_reqs_met` = `requirements_met`, `job_reqs_missed` = `requirements_missed`, `candidate_reqs_met` = `role_fit`, `candidate_reqs_missed` = `red_flags`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `role_fit`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `requirements_met`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `requirements_missed`;--> statement-breakpoint
ALTER TABLE `jobs` DROP COLUMN `red_flags`;
