PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_spend` (
	`user_id` text PRIMARY KEY NOT NULL,
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
INSERT INTO `__new_spend`("user_id", "name", "email", "role", "spend_cents", "overall_spend_cents", "fast_premium_requests", "hard_limit_override_dollars", "monthly_limit_dollars", "subscription_cycle_start", "synced_at") SELECT "user_id", "name", "email", "role", "spend_cents", "overall_spend_cents", "fast_premium_requests", "hard_limit_override_dollars", "monthly_limit_dollars", "subscription_cycle_start", "synced_at" FROM `spend`;--> statement-breakpoint
DROP TABLE `spend`;--> statement-breakpoint
ALTER TABLE `__new_spend` RENAME TO `spend`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `spend_email_idx` ON `spend` (`email`);--> statement-breakpoint
CREATE TABLE `__new_team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text,
	`is_removed` integer,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_team_members`("id", "email", "name", "role", "is_removed", "updated_at") SELECT "id", "email", "name", "role", "is_removed", "updated_at" FROM `team_members`;--> statement-breakpoint
DROP TABLE `team_members`;--> statement-breakpoint
ALTER TABLE `__new_team_members` RENAME TO `team_members`;--> statement-breakpoint
CREATE INDEX `team_members_email_idx` ON `team_members` (`email`);