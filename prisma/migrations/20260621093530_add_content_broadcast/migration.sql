-- CreateTable
CREATE TABLE "BotContent" (
    "id" SERIAL NOT NULL,
    "lang" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "UserTag" (
    "id" SERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "videoFileId" TEXT,
    "text" TEXT,
    "buttons" JSONB,
    "filterLang" TEXT,
    "filterHasContacts" BOOLEAN NOT NULL DEFAULT false,
    "filterTags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotContent_lang_idx" ON "BotContent"("lang");

-- CreateIndex
CREATE UNIQUE INDEX "BotContent_lang_key_key" ON "BotContent"("lang", "key");

-- CreateIndex
CREATE INDEX "UserTag_tag_idx" ON "UserTag"("tag");

-- CreateIndex
CREATE INDEX "UserTag_userId_idx" ON "UserTag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTag_userId_tag_key" ON "UserTag"("userId", "tag");

-- AddForeignKey
ALTER TABLE "UserTag" ADD CONSTRAINT "UserTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
