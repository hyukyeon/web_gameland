-- 스도쿠 일일 보상: 오늘(KST) 보상을 받은 클리어 횟수와 마지막 클리어 시각
ALTER TABLE "User" ADD COLUMN "dailySudokuCleared" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastSudokuClearedAt" DATETIME;
