CREATE TABLE `_schema_meta` (
	`key` text NOT NULL,
	`scope` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`key`, `scope`)
);
--> statement-breakpoint
CREATE TABLE `account_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`default_vat_code` text,
	`default_prepaid_input` text,
	`is_investment` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `associates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`share_bps` integer NOT NULL,
	`role` text,
	`from_date` text NOT NULL,
	`to_date` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`diff_json` text,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_form` text NOT NULL,
	`ide_number` text,
	`vat_number` text,
	`rc_registered` integer DEFAULT false NOT NULL,
	`address_json` text,
	`accounting_mode` text DEFAULT 'simple' NOT NULL,
	`share_capital` integer,
	`default_currency` text DEFAULT 'CHF' NOT NULL,
	`color` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `company_legal_form_history` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`from_form` text,
	`to_form` text NOT NULL,
	`effective_date` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `company_vat_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`rate_type` text NOT NULL,
	`value_bps` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `company_vat_settings` (
	`company_id` text PRIMARY KEY NOT NULL,
	`is_vat_subject` integer DEFAULT true NOT NULL,
	`period_type` text DEFAULT 'quarterly' NOT NULL,
	`method` text DEFAULT 'effective' NOT NULL,
	`accounting_basis` text DEFAULT 'agreed' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `distributions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`fiscal_year_id` text,
	`beneficiary` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fiscal_year_id`) REFERENCES `fiscal_years`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `equity_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fiscal_years` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoice_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`file_path` text NOT NULL,
	`original_name` text NOT NULL,
	`mime` text,
	`size` integer,
	`hash` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`number` text,
	`issue_date` text NOT NULL,
	`due_date` text,
	`third_party_id` text,
	`description` text,
	`category_id` text,
	`treatment` text DEFAULT 'standard' NOT NULL,
	`entered_as` text DEFAULT 'ttc' NOT NULL,
	`amount_ht` integer DEFAULT 0 NOT NULL,
	`vat_rate_bps` integer DEFAULT 0 NOT NULL,
	`vat_amount` integer DEFAULT 0 NOT NULL,
	`amount_ttc` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CHF' NOT NULL,
	`fx_rate` integer,
	`amount_chf` integer DEFAULT 0 NOT NULL,
	`vat_code` text,
	`vat_code_override` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`payment_date` text,
	`recurring_id` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`third_party_id`) REFERENCES `third_parties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `account_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recurring_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`template_json` text NOT NULL,
	`frequency` text NOT NULL,
	`next_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tdfn_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`label` text NOT NULL,
	`value_bps` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `third_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text DEFAULT 'both' NOT NULL,
	`name` text NOT NULL,
	`address_json` text,
	`email` text,
	`phone` text,
	`vat_number` text,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vat_rate_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`rate_type` text NOT NULL,
	`value_bps` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text
);
--> statement-breakpoint
CREATE TABLE `vat_return_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`vat_return_id` text NOT NULL,
	`code` text NOT NULL,
	`base_amount` integer DEFAULT 0 NOT NULL,
	`tax_amount` integer,
	FOREIGN KEY (`vat_return_id`) REFERENCES `vat_returns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vat_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`period_type` text NOT NULL,
	`year` integer NOT NULL,
	`period_index` integer,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`method` text DEFAULT 'effective' NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`total_payable` integer,
	`total_credit` integer,
	`filed_at` text,
	`paid_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
