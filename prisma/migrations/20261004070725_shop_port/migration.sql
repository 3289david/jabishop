-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "port" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_port_key" ON "Shop"("port");
