CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text,
	`front_content` text NOT NULL,
	`back_content` text NOT NULL,
	`context_text` text,
	`audio_url` text,
	`timestamp_seconds` integer,
	`difficulty` integer DEFAULT 0,
	`next_review_at` text,
	`review_count` integer DEFAULT 0,
	`ease_factor` integer DEFAULT 250,
	`interval` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `flashcards_video_id_idx` ON `flashcards` (`video_id`);--> statement-breakpoint
CREATE INDEX `flashcards_next_review_idx` ON `flashcards` (`next_review_at`);--> statement-breakpoint
CREATE TABLE `quiz_results` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`quiz_type` text NOT NULL,
	`score` integer NOT NULL,
	`total_questions` integer NOT NULL,
	`answers` text,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quiz_results_video_id_idx` ON `quiz_results` (`video_id`);--> statement-breakpoint
CREATE INDEX `quiz_results_completed_at_idx` ON `quiz_results` (`completed_at`);--> statement-breakpoint
CREATE TABLE `video_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`summary_type` text NOT NULL,
	`content` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `video_summaries_video_id_idx` ON `video_summaries` (`video_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `video_summaries_video_id_summary_type_language_unique` ON `video_summaries` (`video_id`,`summary_type`,`language`);