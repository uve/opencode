CREATE TABLE `client_state` (
	`id` text PRIMARY KEY,
	`state` text NOT NULL,
	`device_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
