-- Duplication des contenus : republier un post N fois dans un même groupe.
ALTER TABLE "automation_settings" ADD COLUMN "repeat_times" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "automation_settings" ADD COLUMN "repeat_every_hours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "posts" ADD COLUMN "repeat_times" INTEGER;
ALTER TABLE "posts" ADD COLUMN "repeat_every_hours" INTEGER;
ALTER TABLE "post_targets" ADD COLUMN "repeat_round" INTEGER NOT NULL DEFAULT 0;
