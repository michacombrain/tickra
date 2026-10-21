-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "editedAt" DATETIME;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "Issue" ADD COLUMN "storyPoints" INTEGER;
