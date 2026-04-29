DROP INDEX `company_job_title_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `company_job_title_idx` ON `jobs` (`company`, `job_title`, `user_id`);
