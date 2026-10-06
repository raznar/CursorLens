PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_spend` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`role` text,
	`spend_cents` real,
	`overall_spend_cents` real,
	`fast_premium_requests` integer,
	`hard_limit_override_dollars` integer,
	`monthly_limit_dollars` integer,
	`effective_per_user_limit_dollars` integer,
	`subscription_cycle_start` integer,
	`synced_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_spend`("user_id", "name", "email", "role", "spend_cents", "overall_spend_cents", "fast_premium_requests", "hard_limit_override_dollars", "monthly_limit_dollars", "subscription_cycle_start", "synced_at") SELECT "user_id", "name", "email", "role", "spend_cents", "overall_spend_cents", "fast_premium_requests", "hard_limit_override_dollars", "monthly_limit_dollars", "subscription_cycle_start", "synced_at" FROM `spend`;--> statement-breakpoint
DROP TABLE `spend`;--> statement-breakpoint
ALTER TABLE `__new_spend` RENAME TO `spend`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `spend_email_idx` ON `spend` (`email`);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `application_type` text;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `cloud_agent_id` text;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `automation_id` text;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `conversation_id` text;--> statement-breakpoint
CREATE INDEX `usage_events_conversation_id_idx` ON `usage_events` (`conversation_id`);