CREATE TABLE `cash_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`date` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
