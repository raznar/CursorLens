PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_daily_usage` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`date` integer,
	`email` text,
	`is_active` integer,
	`total_lines_added` integer,
	`total_lines_deleted` integer,
	`accepted_lines_added` integer,
	`accepted_lines_deleted` integer,
	`total_applies` integer,
	`total_accepts` integer,
	`total_rejects` integer,
	`total_tabs_shown` integer,
	`total_tabs_accepted` integer,
	`composer_requests` integer,
	`chat_requests` integer,
	`agent_requests` integer,
	`cmdk_usages` integer,
	`subscription_included_reqs` integer,
	`api_key_reqs` integer,
	`usage_based_reqs` integer,
	`bugbot_usages` integer,
	`most_used_model` text,
	`apply_most_used_extension` text,
	`tab_most_used_extension` text,
	`client_version` text,
	PRIMARY KEY(`user_id`, `day`)
);
--> statement-breakpoint
INSERT INTO `__new_daily_usage`("user_id", "day", "date", "email", "is_active", "total_lines_added", "total_lines_deleted", "accepted_lines_added", "accepted_lines_deleted", "total_applies", "total_accepts", "total_rejects", "total_tabs_shown", "total_tabs_accepted", "composer_requests", "chat_requests", "agent_requests", "cmdk_usages", "subscription_included_reqs", "api_key_reqs", "usage_based_reqs", "bugbot_usages", "most_used_model", "apply_most_used_extension", "tab_most_used_extension", "client_version") SELECT "user_id", "day", "date", "email", "is_active", "total_lines_added", "total_lines_deleted", "accepted_lines_added", "accepted_lines_deleted", "total_applies", "total_accepts", "total_rejects", "total_tabs_shown", "total_tabs_accepted", "composer_requests", "chat_requests", "agent_requests", "cmdk_usages", "subscription_included_reqs", "api_key_reqs", "usage_based_reqs", "bugbot_usages", "most_used_model", "apply_most_used_extension", "tab_most_used_extension", "client_version" FROM `daily_usage`;--> statement-breakpoint
DROP TABLE `daily_usage`;--> statement-breakpoint
ALTER TABLE `__new_daily_usage` RENAME TO `daily_usage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `daily_usage_day_idx` ON `daily_usage` (`day`);--> statement-breakpoint
CREATE INDEX `daily_usage_email_idx` ON `daily_usage` (`email`);