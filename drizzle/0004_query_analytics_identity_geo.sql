ALTER TABLE `query_analytics` ADD COLUMN `optimization_mode` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `sources` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `source_count` integer;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_city` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_region` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_country` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_latitude` integer;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_longitude` integer;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_timezone` text;
--> statement-breakpoint
ALTER TABLE `query_analytics` ADD COLUMN `geo_source` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_identity` ON `query_analytics` (`user_id`, `organization_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_geo` ON `query_analytics` (`geo_country`, `geo_region`, `geo_city`);
