CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`website_url` text,
	`careers_url` text,
	`ats_provider` text DEFAULT 'other' NOT NULL,
	`ats_board_token` text,
	`industry` text,
	`headquarters` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_user_normalized_name_unique` ON `companies` (`user_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `companies_user_idx` ON `companies` (`user_id`);--> statement-breakpoint
CREATE TABLE `job_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`company_name` text NOT NULL,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`apply_url` text,
	`location_text` text,
	`country_scope` text DEFAULT 'unknown' NOT NULL,
	`work_arrangement` text DEFAULT 'unknown' NOT NULL,
	`employment_type` text DEFAULT 'unknown' NOT NULL,
	`compensation_status` text DEFAULT 'unspecified' NOT NULL,
	`salary_text` text,
	`description` text,
	`matched_role_title` text,
	`match_score` integer DEFAULT 0 NOT NULL,
	`match_reasons_json` text DEFAULT '[]' NOT NULL,
	`matched_skills_json` text DEFAULT '[]' NOT NULL,
	`missing_skills_json` text DEFAULT '[]' NOT NULL,
	`verification_status` text DEFAULT 'discovered' NOT NULL,
	`application_status` text DEFAULT 'none' NOT NULL,
	`posted_at` integer,
	`discovered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_opportunities_user_fingerprint_unique` ON `job_opportunities` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `job_opportunities_user_score_idx` ON `job_opportunities` (`user_id`,`match_score`);--> statement-breakpoint
CREATE INDEX `job_opportunities_user_posted_idx` ON `job_opportunities` (`user_id`,`posted_at`);--> statement-breakpoint
CREATE INDEX `job_opportunities_user_discovered_idx` ON `job_opportunities` (`user_id`,`discovered_at`);--> statement-breakpoint
CREATE TABLE `company_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text,
	`job_id` text,
	`company_name` text NOT NULL,
	`full_name` text NOT NULL,
	`role_title` text,
	`contact_type` text DEFAULT 'recruiter' NOT NULL,
	`email` text,
	`profile_url` text,
	`platform` text DEFAULT 'linkedin' NOT NULL,
	`source_url` text NOT NULL,
	`source_note` text,
	`confidence` text DEFAULT 'search_lead' NOT NULL,
	`last_verified_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `company_contacts_user_company_idx` ON `company_contacts` (`user_id`,`company_name`);--> statement-breakpoint
CREATE INDEX `company_contacts_user_job_idx` ON `company_contacts` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `outreach_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`contact_id` text,
	`company_name` text NOT NULL,
	`role_title` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`recipient_label` text NOT NULL,
	`recipient_target` text,
	`subject` text,
	`body` text NOT NULL,
	`grounding_facts_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `company_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outreach_drafts_user_status_idx` ON `outreach_drafts` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `outreach_drafts_user_job_idx` ON `outreach_drafts` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text DEFAULT 'quick' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`checkpoint_json` text DEFAULT '{}' NOT NULL,
	`jobs_scanned` integer DEFAULT 0 NOT NULL,
	`jobs_matched` integer DEFAULT 0 NOT NULL,
	`contacts_found` integer DEFAULT 0 NOT NULL,
	`drafts_created` integer DEFAULT 0 NOT NULL,
	`logs_json` text DEFAULT '[]' NOT NULL,
	`error_message` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_runs_user_created_idx` ON `research_runs` (`user_id`,`created_at`);