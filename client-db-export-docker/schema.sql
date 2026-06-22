CREATE TABLE ran_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    run_on DATETIME DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE IF NOT EXISTS "chats" (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            sources TEXT DEFAULT '[]',
            files TEXT DEFAULT '[]'
          );
CREATE TABLE IF NOT EXISTS "messages" (
            id INTEGER PRIMARY KEY,
            messageId TEXT NOT NULL,
            chatId TEXT NOT NULL,
            backendId TEXT NOT NULL,
            query TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            responseBlocks TEXT DEFAULT '[]',
            status TEXT DEFAULT 'answering'
          );
CREATE TABLE `query_analytics` (
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
, `optimization_mode` text, `sources` text, `source_count` integer, `geo_city` text, `geo_region` text, `geo_country` text, `geo_latitude` integer, `geo_longitude` integer, `geo_timezone` text, `geo_source` text, `geo_area` text, `weather_data` text, `user_agent` text, `browser` text, `os` text, `device` text);
CREATE INDEX `idx_query_analytics_created_at` ON `query_analytics` (`created_at`);
CREATE INDEX `idx_query_analytics_model_provider` ON `query_analytics` (`model`, `provider`);
CREATE INDEX `idx_query_analytics_status` ON `query_analytics` (`status`);
CREATE INDEX `idx_query_analytics_chat_message` ON `query_analytics` (`chat_id`, `message_id`);
CREATE INDEX `idx_query_analytics_identity` ON `query_analytics` (`user_id`, `organization_id`);
CREATE INDEX `idx_query_analytics_geo` ON `query_analytics` (`geo_country`, `geo_region`, `geo_city`);
