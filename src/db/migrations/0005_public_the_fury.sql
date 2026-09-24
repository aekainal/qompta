CREATE TABLE `fund_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`associate_id` text,
	`associate_name` text NOT NULL,
	`date` text NOT NULL,
	`kind` text DEFAULT 'current_account' NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`method` text DEFAULT 'bank' NOT NULL,
	`bank_account_id` text,
	`reference` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`associate_id`) REFERENCES `associates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
