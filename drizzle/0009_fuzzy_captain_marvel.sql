ALTER TABLE `flashcards` ADD `card_type` text DEFAULT 'basic';--> statement-breakpoint
ALTER TABLE `flashcards` ADD `screenshot_path` text;--> statement-breakpoint
ALTER TABLE `flashcards` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `flashcards` ADD `cloze_content` text;