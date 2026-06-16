CREATE TABLE IF NOT EXISTS `query_analytics` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text,
  `user_id` text,
  `query_text` text NOT NULL,
  `model` text,
  `provider` text,
  `status` text NOT NULL,
  `error_message` text,
  `started_at` text NOT NULL,
  `completed_at` text,
  `latency_ms` integer,
  `prompt_tokens` integer,
  `completion_tokens` integer,
  `total_tokens` integer,
  `estimated_cost` integer,
  `response_id` text,
  `message_id` text,
  `chat_id` text,
  `citation_count` integer,
  `feedback_rating` integer,
  `feedback_text` text,
  `evaluation_score` integer,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_created_at` ON `query_analytics` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_model_provider` ON `query_analytics` (`model`, `provider`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_status` ON `query_analytics` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_query_analytics_chat_message` ON `query_analytics` (`chat_id`, `message_id`);
