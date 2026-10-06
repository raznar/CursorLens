CREATE TABLE `ai_code_change_files` (
	`change_id` text NOT NULL,
	`idx` integer NOT NULL,
	`file_name` text,
	`file_extension` text,
	`lines_added` integer,
	`lines_deleted` integer,
	PRIMARY KEY(`change_id`, `idx`)
);
--> statement-breakpoint
CREATE INDEX `ai_code_change_files_extension_idx` ON `ai_code_change_files` (`file_extension`);--> statement-breakpoint
CREATE TABLE `ai_code_changes` (
	`change_id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_email` text,
	`source` text,
	`model` text,
	`total_lines_added` integer,
	`total_lines_deleted` integer,
	`created_at` integer,
	`created_day` text
);
--> statement-breakpoint
CREATE INDEX `ai_code_changes_created_day_idx` ON `ai_code_changes` (`created_day`);--> statement-breakpoint
CREATE INDEX `ai_code_changes_user_email_idx` ON `ai_code_changes` (`user_email`);--> statement-breakpoint
CREATE TABLE `ai_code_commits` (
	`commit_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text,
	`user_email` text,
	`repo_name` text,
	`branch_name` text,
	`is_primary_branch` integer,
	`commit_source` text,
	`total_lines_added` integer,
	`total_lines_deleted` integer,
	`tab_lines_added` integer,
	`tab_lines_deleted` integer,
	`composer_lines_added` integer,
	`composer_lines_deleted` integer,
	`non_ai_lines_added` integer,
	`non_ai_lines_deleted` integer,
	`message` text,
	`commit_ts` integer,
	`commit_day` text,
	PRIMARY KEY(`commit_hash`, `created_at`)
);
--> statement-breakpoint
CREATE INDEX `ai_code_commits_commit_day_idx` ON `ai_code_commits` (`commit_day`);--> statement-breakpoint
CREATE INDEX `ai_code_commits_user_email_idx` ON `ai_code_commits` (`user_email`);--> statement-breakpoint
CREATE INDEX `ai_code_commits_repo_name_idx` ON `ai_code_commits` (`repo_name`);--> statement-breakpoint
CREATE TABLE `analytics_bugbot_review_findings` (
	`request_id` text NOT NULL,
	`idx` integer NOT NULL,
	`comment_id` text,
	`resolution_status` text,
	`severity` text,
	`title` text,
	`description` text,
	`locations` text,
	PRIMARY KEY(`request_id`, `idx`)
);
--> statement-breakpoint
CREATE TABLE `analytics_bugbot_reviews` (
	`request_id` text PRIMARY KEY NOT NULL,
	`timestamp` integer,
	`repo` text,
	`repo_node_id` text,
	`pr_number` integer,
	`commit_sha` text,
	`bugs_found` integer,
	`cost_cents` real,
	`dry_run` integer,
	`publication_status` text
);
--> statement-breakpoint
CREATE INDEX `analytics_bugbot_reviews_timestamp_idx` ON `analytics_bugbot_reviews` (`timestamp`);--> statement-breakpoint
CREATE INDEX `analytics_bugbot_reviews_repo_idx` ON `analytics_bugbot_reviews` (`repo`);--> statement-breakpoint
CREATE TABLE `billing_group_daily_spend` (
	`group_id` text NOT NULL,
	`date` text NOT NULL,
	`spend_cents` real,
	PRIMARY KEY(`group_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `billing_group_daily_spend_date_idx` ON `billing_group_daily_spend` (`date`);--> statement-breakpoint
CREATE TABLE `billing_group_members` (
	`group_id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`email` text,
	`joined_at` integer,
	`left_at` integer,
	`spend_cents` real,
	`is_current` integer,
	PRIMARY KEY(`group_id`, `cycle_start`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `billing_group_members_email_idx` ON `billing_group_members` (`email`);--> statement-breakpoint
CREATE TABLE `billing_groups` (
	`id` text NOT NULL,
	`cycle_start` text NOT NULL,
	`cycle_end` text,
	`name` text NOT NULL,
	`type` text,
	`directory_group_id` text,
	`member_count` integer,
	`spend_cents` real,
	`is_unassigned` integer,
	`created_at` integer,
	`updated_at` integer,
	`synced_at` integer,
	PRIMARY KEY(`id`, `cycle_start`)
);
--> statement-breakpoint
CREATE TABLE `directory_group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`email` text,
	`joined_at` integer,
	`synced_at` integer,
	PRIMARY KEY(`group_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `directory_group_members_email_idx` ON `directory_group_members` (`email`);--> statement-breakpoint
CREATE TABLE `directory_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`member_count` integer,
	`monthly_spending_limit_dollars` integer,
	`created_at` integer,
	`updated_at` integer,
	`synced_at` integer
);
