CREATE TABLE `signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`associate_id` text,
	`name` text NOT NULL,
	`role` text,
	`image` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`associate_id`) REFERENCES `associates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `quotes` ADD `signature_id` text;