CREATE TABLE "homepage_content" (
    "id" TEXT NOT NULL DEFAULT 'homepage',
    "draft" JSONB NOT NULL,
    "published" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "homepage_content_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_page_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_resource" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "key" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_resource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_page_slug_key" ON "content_page"("slug");
CREATE INDEX "content_page_published_slug_idx" ON "content_page"("published", "slug");
CREATE UNIQUE INDEX "admin_resource_type_key_key" ON "admin_resource"("type", "key");
CREATE INDEX "admin_resource_type_updatedAt_idx" ON "admin_resource"("type", "updatedAt");
