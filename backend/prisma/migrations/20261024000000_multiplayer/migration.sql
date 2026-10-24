-- AlterTable
ALTER TABLE "User" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roomName" TEXT NOT NULL,
    "betPerPt" INTEGER NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "nagari" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GameResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gameId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "moneyDelta" INTEGER NOT NULL,
    CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GameResult_userId_idx" ON "GameResult"("userId");
CREATE INDEX "GameResult_gameId_idx" ON "GameResult"("gameId");

-- 기존 2인 기록 이관 (Game.id = GameRecord.id 로 보존)
INSERT INTO "Game" ("id", "roomName", "betPerPt", "playerCount", "detail", "createdAt")
  SELECT "id", "roomName", "betPerPt", 2, "detail", "createdAt" FROM "GameRecord";
INSERT INTO "GameResult" ("gameId", "userId", "outcome", "moneyDelta")
  SELECT "id", "winnerId", 'win', "moneyDelta" FROM "GameRecord";
INSERT INTO "GameResult" ("gameId", "userId", "outcome", "moneyDelta")
  SELECT "id", "loserId", 'lose', -"moneyDelta" FROM "GameRecord";

-- DropTable
DROP TABLE "GameRecord";
