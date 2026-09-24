CREATE TABLE `bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`label` text NOT NULL,
	`iban` text NOT NULL,
	`holder_name` text,
	`bank_name` text,
	`bic` text,
	`currency` text DEFAULT 'CHF' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contract_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`articles_json` text DEFAULT '[]' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`number` text NOT NULL,
	`third_party_id` text,
	`quote_id` text,
	`title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`min_duration_months` integer,
	`notice_days` integer,
	`monthly_amount_ht` integer,
	`vat_rate_bps` integer DEFAULT 0 NOT NULL,
	`articles_json` text DEFAULT '[]' NOT NULL,
	`signed_date` text,
	`signed_place` text,
	`terminated_date` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`third_party_id`) REFERENCES `third_parties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `document_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`document_type` text NOT NULL,
	`document_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'item' NOT NULL,
	`label` text NOT NULL,
	`qty_milli` integer DEFAULT 1000 NOT NULL,
	`unit_price_ht` integer DEFAULT 0 NOT NULL,
	`vat_rate_bps` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`number` text NOT NULL,
	`issue_date` text NOT NULL,
	`valid_until` text,
	`third_party_id` text,
	`title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'CHF' NOT NULL,
	`amount_ht` integer DEFAULT 0 NOT NULL,
	`vat_amount` integer DEFAULT 0 NOT NULL,
	`amount_ttc` integer DEFAULT 0 NOT NULL,
	`vat_note` text,
	`notes` text,
	`bank_account_id` text,
	`accepted_at` text,
	`invoice_id` text,
	`contract_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`third_party_id`) REFERENCES `third_parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `rc_number` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `email` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `website` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `street` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `building_number` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `zip` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `city` text;--> statement-breakpoint
ALTER TABLE `companies` ADD `country` text DEFAULT 'CH' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `logo_text` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `title` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `quote_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `contract_id` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `bank_account_id` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `address_line2` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `street` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `building_number` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `zip` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `city` text;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `country` text DEFAULT 'CH' NOT NULL;--> statement-breakpoint
ALTER TABLE `third_parties` ADD `rc_number` text;