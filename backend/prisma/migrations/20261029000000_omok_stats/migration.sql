-- 오목 전적/연승/AI 상대 승리 (고스톱 wins/losses, 섯다 sdWins/sdLosses 와 분리, 실전만 누적. ogBotWins 는 연습 포함)
ALTER TABLE "User" ADD COLUMN "ogGames" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogLosses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogBestStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogBotWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "ogFastWin" INTEGER NOT NULL DEFAULT 0;

-- 이미 쌓인 오목 정산 기록(방 이름이 '[오목]' 으로 시작)에서 승패를 옮긴다
UPDATE "User" SET
  "ogWins" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[오목]%' AND r."outcome" = 'win'),
  "ogLosses" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[오목]%' AND r."outcome" = 'lose'),
  "ogGames" = (SELECT COUNT(*) FROM "GameResult" r JOIN "Game" g ON g."id" = r."gameId" WHERE r."userId" = "User"."id" AND g."roomName" LIKE '[오목]%');
