ALTER TABLE `company_brand_settings` ADD `font_mode` text DEFAULT 'inter' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_brand_settings` ADD `font_family` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `company_brand_settings` ADD `font_faces_json` text DEFAULT '[]' NOT NULL;