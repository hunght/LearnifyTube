CREATE TABLE `generated_quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`quiz_type` text NOT NULL,
	`difficulty` text NOT NULL,
	`num_questions` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generated_quizzes_video_id_idx` ON `generated_quizzes` (`video_id`);--> statement-breakpoint
CREATE INDEX `generated_quizzes_lookup_idx` ON `generated_quizzes` (`video_id`,`quiz_type`,`difficulty`,`num_questions`);