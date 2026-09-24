CREATE TABLE `company_brand_settings` (
	`company_id` text PRIMARY KEY NOT NULL,
	`logo_mode` text DEFAULT 'text' NOT NULL,
	`logo_image` text,
	`logo_height_dmm` integer DEFAULT 105 NOT NULL,
	`show_contact` integer DEFAULT true NOT NULL,
	`pattern_mode` text DEFAULT 'letters' NOT NULL,
	`pattern_text` text DEFAULT 'Q' NOT NULL,
	`pattern_opacity_pct` integer DEFAULT 40 NOT NULL,
	`pattern_size_dmm` integer DEFAULT 42 NOT NULL,
	`show_quote_signatures` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
