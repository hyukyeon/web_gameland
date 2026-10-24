-- 프로필: 다른 사람에게 보이는 닉네임, 아바타 이미지 파일명
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;
ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");
