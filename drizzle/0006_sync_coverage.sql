CREATE TABLE `sync_coverage` (
	`data_type` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`etag` text,
	`rows` integer,
	`synced_at` integer NOT NULL,
	`run_id` integer,
	PRIMARY KEY(`data_type`, `window_start`, `window_end`)
);
--> statement-breakpoint
CREATE INDEX `sync_coverage_data_type_idx` ON `sync_coverage` (`data_type`);