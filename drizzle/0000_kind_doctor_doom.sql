CREATE TABLE `analytics_agent_edits` (
	`event_date` text PRIMARY KEY NOT NULL,
	`total_suggested_diffs` integer,
	`total_accepted_diffs` integer,
	`total_rejected_diffs` integer,
	`total_green_lines_accepted` integer,
	`total_red_lines_accepted` integer,
	`total_green_lines_rejected` integer,
	`total_red_lines_rejected` integer,
	`total_green_lines_suggested` integer,
	`total_red_lines_suggested` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer
);
--> statement-breakpoint
CREATE TABLE `analytics_ask_mode` (
	`event_date` text NOT NULL,
	`model` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`event_date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `analytics_bugbot` (
	`repo` text NOT NULL,
	`pr_number` integer NOT NULL,
	`timestamp` integer,
	`reviews` integer,
	`issues_total` integer,
	`issues_high` integer,
	`issues_medium` integer,
	`issues_low` integer,
	`resolved_total` integer,
	`resolved_high` integer,
	`resolved_medium` integer,
	`resolved_low` integer,
	PRIMARY KEY(`repo`, `pr_number`)
);
--> statement-breakpoint
CREATE TABLE `analytics_client_versions` (
	`event_date` text NOT NULL,
	`client_version` text NOT NULL,
	`user_count` integer,
	`percentage` real,
	PRIMARY KEY(`event_date`, `client_version`)
);
--> statement-breakpoint
CREATE TABLE `analytics_commands` (
	`event_date` text NOT NULL,
	`command_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`event_date`, `command_name`)
);
--> statement-breakpoint
CREATE TABLE `analytics_conversation_insights` (
	`slice` text NOT NULL,
	`label` text NOT NULL,
	`date` text NOT NULL,
	`count` integer,
	PRIMARY KEY(`slice`, `label`, `date`)
);
--> statement-breakpoint
CREATE TABLE `analytics_dau` (
	`date` text PRIMARY KEY NOT NULL,
	`dau` integer,
	`cli_dau` integer,
	`cloud_agent_dau` integer,
	`bugbot_dau` integer
);
--> statement-breakpoint
CREATE TABLE `analytics_leaderboard` (
	`board` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text,
	`total_accepts` integer,
	`total_lines_accepted` integer,
	`total_lines_suggested` integer,
	`line_acceptance_ratio` real,
	`accept_ratio` real,
	`rank` integer,
	`period_start` text,
	`period_end` text,
	PRIMARY KEY(`board`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `analytics_mcp` (
	`event_date` text NOT NULL,
	`mcp_server_name` text NOT NULL,
	`tool_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`event_date`, `mcp_server_name`, `tool_name`)
);
--> statement-breakpoint
CREATE TABLE `analytics_models` (
	`date` text NOT NULL,
	`model` text NOT NULL,
	`messages` integer,
	`users` integer,
	PRIMARY KEY(`date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `analytics_plans` (
	`event_date` text NOT NULL,
	`model` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`event_date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `analytics_skills` (
	`event_date` text NOT NULL,
	`skill_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`event_date`, `skill_name`)
);
--> statement-breakpoint
CREATE TABLE `analytics_tabs` (
	`event_date` text PRIMARY KEY NOT NULL,
	`total_suggestions` integer,
	`total_accepts` integer,
	`total_rejects` integer,
	`total_green_lines_accepted` integer,
	`total_red_lines_accepted` integer,
	`total_green_lines_rejected` integer,
	`total_red_lines_rejected` integer,
	`total_green_lines_suggested` integer,
	`total_red_lines_suggested` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer
);
--> statement-breakpoint
CREATE TABLE `analytics_top_file_extensions` (
	`event_date` text NOT NULL,
	`file_extension` text NOT NULL,
	`total_files` integer,
	`total_accepts` integer,
	`total_rejects` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer,
	`total_lines_rejected` integer,
	PRIMARY KEY(`event_date`, `file_extension`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`event_id` text PRIMARY KEY NOT NULL,
	`timestamp` integer,
	`ip_address` text,
	`user_email` text,
	`event_type` text,
	`event_data` text,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_logs_event_type_idx` ON `audit_logs` (`event_type`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_email_idx` ON `audit_logs` (`user_email`);--> statement-breakpoint
CREATE TABLE `by_user_agent_edits` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`total_suggested_diffs` integer,
	`total_accepted_diffs` integer,
	`total_rejected_diffs` integer,
	`total_green_lines_accepted` integer,
	`total_red_lines_accepted` integer,
	`total_green_lines_rejected` integer,
	`total_red_lines_rejected` integer,
	`total_green_lines_suggested` integer,
	`total_red_lines_suggested` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer,
	PRIMARY KEY(`email`, `event_date`)
);
--> statement-breakpoint
CREATE TABLE `by_user_ask_mode` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`model` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`email`, `event_date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `by_user_client_versions` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`client_version` text NOT NULL,
	`user_count` integer,
	`percentage` real,
	PRIMARY KEY(`email`, `event_date`, `client_version`)
);
--> statement-breakpoint
CREATE TABLE `by_user_commands` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`command_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`email`, `event_date`, `command_name`)
);
--> statement-breakpoint
CREATE TABLE `by_user_mcp` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`mcp_server_name` text NOT NULL,
	`tool_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`email`, `event_date`, `mcp_server_name`, `tool_name`)
);
--> statement-breakpoint
CREATE TABLE `by_user_models` (
	`email` text NOT NULL,
	`date` text NOT NULL,
	`model` text NOT NULL,
	`messages` integer,
	PRIMARY KEY(`email`, `date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `by_user_plans` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`model` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`email`, `event_date`, `model`)
);
--> statement-breakpoint
CREATE TABLE `by_user_skills` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`skill_name` text NOT NULL,
	`usage` integer,
	PRIMARY KEY(`email`, `event_date`, `skill_name`)
);
--> statement-breakpoint
CREATE TABLE `by_user_tabs` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`total_suggestions` integer,
	`total_accepts` integer,
	`total_rejects` integer,
	`total_green_lines_accepted` integer,
	`total_red_lines_accepted` integer,
	`total_green_lines_rejected` integer,
	`total_red_lines_rejected` integer,
	`total_green_lines_suggested` integer,
	`total_red_lines_suggested` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer,
	PRIMARY KEY(`email`, `event_date`)
);
--> statement-breakpoint
CREATE TABLE `by_user_top_file_extensions` (
	`email` text NOT NULL,
	`event_date` text NOT NULL,
	`file_extension` text NOT NULL,
	`total_files` integer,
	`total_accepts` integer,
	`total_rejects` integer,
	`total_lines_suggested` integer,
	`total_lines_accepted` integer,
	`total_lines_rejected` integer,
	PRIMARY KEY(`email`, `event_date`, `file_extension`)
);
--> statement-breakpoint
CREATE TABLE `daily_usage` (
	`user_id` integer NOT NULL,
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
CREATE INDEX `daily_usage_day_idx` ON `daily_usage` (`day`);--> statement-breakpoint
CREATE INDEX `daily_usage_email_idx` ON `daily_usage` (`email`);--> statement-breakpoint
CREATE TABLE `saved_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`sql` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spend` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`role` text,
	`spend_cents` integer,
	`overall_spend_cents` integer,
	`fast_premium_requests` integer,
	`hard_limit_override_dollars` integer,
	`monthly_limit_dollars` integer,
	`subscription_cycle_start` integer,
	`synced_at` integer
);
--> statement-breakpoint
CREATE INDEX `spend_email_idx` ON `spend` (`email`);--> statement-breakpoint
CREATE TABLE `sync_run_items` (
	`run_id` integer NOT NULL,
	`data_type` text NOT NULL,
	`status` text NOT NULL,
	`rows` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`error` text,
	PRIMARY KEY(`run_id`, `data_type`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`summary` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`data_type` text PRIMARY KEY NOT NULL,
	`last_synced_at` integer NOT NULL,
	`watermark` text,
	`etag` text,
	`status` text NOT NULL,
	`last_error` text,
	`last_run_id` integer
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text,
	`is_removed` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `team_members_email_idx` ON `team_members` (`email`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`event_key` text PRIMARY KEY NOT NULL,
	`timestamp` integer,
	`user_email` text,
	`service_account_id` text,
	`service_account_name` text,
	`model` text,
	`kind` text,
	`max_mode` integer,
	`requests_costs` real,
	`is_token_based_call` integer,
	`is_chargeable` integer,
	`is_headless` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`cache_write_tokens` integer,
	`cache_read_tokens` integer,
	`total_cents` real,
	`discount_percent_off` real,
	`charged_cents` real,
	`cursor_token_fee` real
);
--> statement-breakpoint
CREATE INDEX `usage_events_timestamp_idx` ON `usage_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `usage_events_user_email_idx` ON `usage_events` (`user_email`);--> statement-breakpoint
CREATE INDEX `usage_events_model_idx` ON `usage_events` (`model`);