ALTER TABLE `sync_runs` ADD `mock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `sync_runs` SET `mock` = 1 WHERE `summary` LIKE '%"mock":true%';
