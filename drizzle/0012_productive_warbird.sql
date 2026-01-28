CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `favorites_entity_idx` ON `favorites` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `favorites_created_at_idx` ON `favorites` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_entity_type_entity_id_unique` ON `favorites` (`entity_type`,`entity_id`);