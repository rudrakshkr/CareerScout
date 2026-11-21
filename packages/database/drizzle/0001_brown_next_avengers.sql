CREATE TABLE `education_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`institution` text NOT NULL,
	`education_level` text,
	`degree` text,
	`field_of_study` text,
	`start_date` text,
	`end_date` text,
	`graduation_year` integer,
	`grade` text,
	`description` text,
	`is_current` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `education_entries_user_sort_idx` ON `education_entries` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `experience_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_name` text NOT NULL,
	`job_title` text NOT NULL,
	`employment_type` text,
	`location` text,
	`work_arrangement` text,
	`start_date` text,
	`end_date` text,
	`is_current` integer DEFAULT false NOT NULL,
	`description` text,
	`achievements` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `experience_entries_user_sort_idx` ON `experience_entries` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`description` text,
	`role` text,
	`project_url` text,
	`repository_url` text,
	`start_date` text,
	`end_date` text,
	`is_ongoing` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_sort_idx` ON `projects` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `project_technologies` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_technologies_project_idx` ON `project_technologies` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_technologies_project_name_unique` ON `project_technologies` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `user_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`proficiency` text,
	`years_experience` real,
	`is_highlighted` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_skills_user_sort_idx` ON `user_skills` (`user_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_skills_user_name_unique` ON `user_skills` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `job_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`minimum_salary` integer,
	`maximum_salary` integer,
	`salary_currency` text,
	`salary_period` text,
	`paid_preference` text DEFAULT 'paid_preferred' NOT NULL,
	`work_arrangement` text DEFAULT 'any' NOT NULL,
	`willing_to_relocate` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_preferences_salary_range_check" CHECK("job_preferences"."minimum_salary" IS NULL OR "job_preferences"."maximum_salary" IS NULL OR "job_preferences"."minimum_salary" <= "job_preferences"."maximum_salary"),
	CONSTRAINT "job_preferences_salary_nonnegative_check" CHECK(("job_preferences"."minimum_salary" IS NULL OR "job_preferences"."minimum_salary" >= 0) AND ("job_preferences"."maximum_salary" IS NULL OR "job_preferences"."maximum_salary" >= 0))
);
--> statement-breakpoint
CREATE TABLE `preferred_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`seniority` text DEFAULT 'any' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preferred_roles_user_priority_idx` ON `preferred_roles` (`user_id`,`priority`);--> statement-breakpoint
CREATE TABLE `preferred_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`city` text,
	`region` text,
	`country` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preferred_locations_user_priority_idx` ON `preferred_locations` (`user_id`,`priority`);--> statement-breakpoint
CREATE TABLE `resume_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`original_filename` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size_bytes` integer NOT NULL,
	`sha256_hash` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`processing_status` text DEFAULT 'uploaded' NOT NULL,
	`extracted_text_storage_key` text,
	`processing_error` text,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_documents_storage_key_unique` ON `resume_documents` (`storage_key`);--> statement-breakpoint
CREATE INDEX `resume_documents_user_uploaded_idx` ON `resume_documents` (`user_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `resume_documents_user_primary_idx` ON `resume_documents` (`user_id`,`is_primary`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `onboarding_status` text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `onboarding_current_step` text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `onboarding_completed_at` integer;