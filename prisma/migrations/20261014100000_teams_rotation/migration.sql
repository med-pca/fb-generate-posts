-- AlterTable
ALTER TABLE "automation_settings" ADD COLUMN     "nst_group_checkpoint" TEXT NOT NULL DEFAULT 'PostFlow · Vérification',
ADD COLUMN     "nst_group_disabled" TEXT NOT NULL DEFAULT 'PostFlow · Désactivés',
ADD COLUMN     "nst_group_limited" TEXT NOT NULL DEFAULT 'PostFlow · Limités',
ADD COLUMN     "nst_group_logged_out" TEXT NOT NULL DEFAULT 'PostFlow · Déconnectés';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "max_per_profile_per_day" INTEGER,
ADD COLUMN     "rotation_teams" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "nst_group_id" TEXT,
ADD COLUMN     "nst_group_name" TEXT,
ADD COLUMN     "team_nst_group_id" TEXT,
ADD COLUMN     "team_nst_group_name" TEXT;

