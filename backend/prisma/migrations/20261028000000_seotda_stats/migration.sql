-- 섯다 전적/스탯을 고스톱(wins/losses)과 분리
ALTER TABLE "User" ADD COLUMN "sdGames" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdLosses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdDies" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdFoldWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdBluffWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdTtaengWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdGwangWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdAllinWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdDoubleWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdBiggestPot" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdBestPower" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "sdBestHand" TEXT;

-- 기존에 고스톱 전적에 섞여 들어간 섯다 승패를 옮긴다 (게임 기록의 방 이름이 '[섯다]' 로 시작)
UPDATE "User" SET
  "sdWins" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[섯다]%' AND r."outcome" = 'win'),
  "sdLosses" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[섯다]%' AND r."outcome" = 'lose'),
  "sdGames" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[섯다]%');
UPDATE "User" SET "wins" = MAX(0, "wins" - "sdWins"), "losses" = MAX(0, "losses" - "sdLosses");
