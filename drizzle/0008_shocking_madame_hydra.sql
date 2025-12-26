PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- First, update NULL channel_title values from the channels table where possible
UPDATE `youtube_videos` 
SET `channel_title` = COALESCE(
  (SELECT c.channel_title FROM channels c WHERE c.channel_id = youtube_videos.channel_id),
  'Unknown Channel'
) 
WHERE `channel_title` IS NULL;--> statement-breakpoint
CREATE TABLE `__new_youtube_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`channel_id` text,
	`channel_title` text NOT NULL,
	`duration_seconds` integer,
	`view_count` integer,
	`like_count` integer,
	`thumbnail_url` text,
	`thumbnail_path` text,
	`published_at` integer,
	`tags` text,
	`raw_json` text,
	`download_status` text,
	`download_progress` integer,
	`download_format` text,
	`download_quality` text,
	`download_file_path` text,
	`download_file_size` integer,
	`last_error_message` text,
	`error_type` text,
	`is_retryable` integer,
	`last_downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_youtube_videos`("id", "video_id", "title", "description", "channel_id", "channel_title", "duration_seconds", "view_count", "like_count", "thumbnail_url", "thumbnail_path", "published_at", "tags", "raw_json", "download_status", "download_progress", "download_format", "download_quality", "download_file_path", "download_file_size", "last_error_message", "error_type", "is_retryable", "last_downloaded_at", "created_at", "updated_at") SELECT "id", "video_id", "title", "description", "channel_id", "channel_title", "duration_seconds", "view_count", "like_count", "thumbnail_url", "thumbnail_path", "published_at", "tags", "raw_json", "download_status", "download_progress", "download_format", "download_quality", "download_file_path", "download_file_size", "last_error_message", "error_type", "is_retryable", "last_downloaded_at", "created_at", "updated_at" FROM `youtube_videos`;--> statement-breakpoint
DROP TABLE `youtube_videos`;--> statement-breakpoint
ALTER TABLE `__new_youtube_videos` RENAME TO `youtube_videos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `youtube_videos_video_id_idx` ON `youtube_videos` (`video_id`);--> statement-breakpoint
CREATE INDEX `youtube_videos_published_at_idx` ON `youtube_videos` (`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `youtube_videos_video_id_unique` ON `youtube_videos` (`video_id`);