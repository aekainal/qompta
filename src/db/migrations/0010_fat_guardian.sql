CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`metric` text NOT NULL,
	`period_type` text DEFAULT 'year' NOT NULL,
	`period_year` integer NOT NULL,
	`period_quarter` integer,
	`period_month` integer,
	`target_value` integer NOT NULL,
	`direction` text DEFAULT 'at_least' NOT NULL,
	`label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
