-- 슬롯머신 일일 한도: 오늘(KST) 슬롯에 베팅한 총금액과 마지막 플레이 시각
ALTER TABLE "User" ADD COLUMN "dailySlotSpent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastSlotPlayedAt" DATETIME;
