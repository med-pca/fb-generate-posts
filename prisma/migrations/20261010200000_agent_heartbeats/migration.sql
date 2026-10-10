-- CreateTable
CREATE TABLE "agent_heartbeats" (
    "id" TEXT NOT NULL,
    "owner_key" TEXT NOT NULL,
    "owner_id" TEXT,
    "host" TEXT NOT NULL,
    "version" TEXT,
    "os" TEXT,
    "running_browsers" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_heartbeats_owner_key_host_key" ON "agent_heartbeats"("owner_key", "host");

