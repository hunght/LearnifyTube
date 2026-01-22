CREATE TABLE `custom_playlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`video_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`playlist_id`) REFERENCES `custom_playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `youtube_videos`(`video_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_playlist_items_playlist_id_idx` ON `custom_playlist_items` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `custom_playlist_items_video_id_idx` ON `custom_playlist_items` (`video_id`);--> statement-breakpoint
CREATE INDEX `custom_playlist_items_position_idx` ON `custom_playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `custom_playlist_items_playlist_id_video_id_unique` ON `custom_playlist_items` (`playlist_id`,`video_id`);--> statement-breakpoint
CREATE TABLE `custom_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`item_count` integer DEFAULT 0,
	`view_count` integer DEFAULT 0,
	`last_viewed_at` integer,
	`current_video_index` integer DEFAULT 0,
	`total_watch_time_seconds` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `custom_playlists_updated_at_idx` ON `custom_playlists` (`updated_at`);--> statement-breakpoint
CREATE INDEX `custom_playlists_last_viewed_at_idx` ON `custom_playlists` (`last_viewed_at`);