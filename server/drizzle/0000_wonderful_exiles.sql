CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_submissions" (
	"music_id" text NOT NULL,
	"play_style" text NOT NULL,
	"difficulty" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_submissions_pkey" PRIMARY KEY("music_id","play_style","difficulty","user_id")
);
--> statement-breakpoint
CREATE TABLE "music_charts" (
	"music_id" text NOT NULL,
	"play_style" text NOT NULL,
	"difficulty" text NOT NULL,
	"level" smallint,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "music_charts_pkey" PRIMARY KEY("music_id","play_style","difficulty"),
	CONSTRAINT "music_charts_play_style_valid" CHECK ("music_charts"."play_style" IN ('sp', 'dp')),
	CONSTRAINT "music_charts_difficulty_valid" CHECK ("music_charts"."difficulty" IN ('beginner', 'basic', 'difficult', 'expert', 'challenge')),
	CONSTRAINT "music_charts_level_range" CHECK ("music_charts"."level" BETWEEN 1 AND 19),
	CONSTRAINT "music_charts_status_valid" CHECK ("music_charts"."status" IN ('pending', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "music_jackets" (
	"music_id" text PRIMARY KEY NOT NULL,
	"content" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_submissions" (
	"music_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title_normalized" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "music_submissions_pkey" PRIMARY KEY("music_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "musics" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "musics_id_alnum" CHECK ("musics"."id" ~ '^[A-Za-z0-9]{1,64}$'),
	CONSTRAINT "musics_status_valid" CHECK ("musics"."status" IN ('pending', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "score_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "score_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"music_id" text NOT NULL,
	"play_style" text NOT NULL,
	"difficulty" text NOT NULL,
	"score" integer NOT NULL,
	"rank" text NOT NULL,
	"clear_type" text,
	"flare_rank" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_records_score_range" CHECK ("score_records"."score" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_submissions" ADD CONSTRAINT "chart_submissions_chart_fk" FOREIGN KEY ("music_id","play_style","difficulty") REFERENCES "public"."music_charts"("music_id","play_style","difficulty") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_submissions" ADD CONSTRAINT "chart_submissions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_charts" ADD CONSTRAINT "music_charts_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."musics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_jackets" ADD CONSTRAINT "music_jackets_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."musics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_submissions" ADD CONSTRAINT "music_submissions_music_id_fk" FOREIGN KEY ("music_id") REFERENCES "public"."musics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_submissions" ADD CONSTRAINT "music_submissions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_records" ADD CONSTRAINT "score_records_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_records" ADD CONSTRAINT "score_records_chart_fk" FOREIGN KEY ("music_id","play_style","difficulty") REFERENCES "public"."music_charts"("music_id","play_style","difficulty") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "score_records_lookup_idx" ON "score_records" USING btree ("user_id","music_id","play_style","difficulty","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "score_records_chart_idx" ON "score_records" USING btree ("music_id","play_style","difficulty");
