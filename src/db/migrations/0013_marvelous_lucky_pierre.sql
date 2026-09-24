CREATE TABLE `company_equity` (
	`company_id` text PRIMARY KEY NOT NULL,
	`share_capital` integer DEFAULT 0 NOT NULL,
	`reserves` integer DEFAULT 0 NOT NULL,
	`retained_earnings` integer DEFAULT 0 NOT NULL,
	`non_deductible_charges` integer DEFAULT 0 NOT NULL,
	`manager_salary` integer DEFAULT 0 NOT NULL,
	`dividends` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
