ALTER TABLE `youtube_videos` ADD `optimization_status` text;--> statement-breakpoint
ALTER TABLE `youtube_videos` ADD `optimization_progress` integer;--> statement-breakpoint
ALTER TABLE `youtube_videos` ADD `last_optimized_at` integer;--> statement-breakpoint
ALTER TABLE `youtube_videos` ADD `original_file_size` integer;