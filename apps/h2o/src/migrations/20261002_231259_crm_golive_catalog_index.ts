import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_categories" ADD COLUMN "page_route_id" uuid;
  ALTER TABLE "product_categories" ADD COLUMN "source_route_id" varchar;
  ALTER TABLE "products" ADD COLUMN "page_route_id" uuid;
  ALTER TABLE "products" ADD COLUMN "source_route_id" varchar;
  ALTER TABLE "products_rels" ADD COLUMN "product_categories_id" uuid;
  ALTER TABLE "_products_v" ADD COLUMN "version_page_route_id" uuid;
  ALTER TABLE "_products_v" ADD COLUMN "version_source_route_id" varchar;
  ALTER TABLE "_products_v_rels" ADD COLUMN "product_categories_id" uuid;
  ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_page_route_id_public_routes_id_fk" FOREIGN KEY ("page_route_id") REFERENCES "public"."public_routes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products" ADD CONSTRAINT "products_page_route_id_public_routes_id_fk" FOREIGN KEY ("page_route_id") REFERENCES "public"."public_routes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_rels" ADD CONSTRAINT "products_rels_product_categories_fk" FOREIGN KEY ("product_categories_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v" ADD CONSTRAINT "_products_v_version_page_route_id_public_routes_id_fk" FOREIGN KEY ("version_page_route_id") REFERENCES "public"."public_routes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_products_v_rels" ADD CONSTRAINT "_products_v_rels_product_categories_fk" FOREIGN KEY ("product_categories_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "product_categories_page_route_idx" ON "product_categories" USING btree ("page_route_id");
  CREATE UNIQUE INDEX "product_categories_source_route_id_idx" ON "product_categories" USING btree ("source_route_id");
  CREATE INDEX "products_page_route_idx" ON "products" USING btree ("page_route_id");
  CREATE UNIQUE INDEX "products_source_route_id_idx" ON "products" USING btree ("source_route_id");
  CREATE INDEX "products_rels_product_categories_id_idx" ON "products_rels" USING btree ("product_categories_id");
  CREATE INDEX "_products_v_version_version_page_route_idx" ON "_products_v" USING btree ("version_page_route_id");
  CREATE INDEX "_products_v_version_version_source_route_id_idx" ON "_products_v" USING btree ("version_source_route_id");
  CREATE INDEX "_products_v_rels_product_categories_id_idx" ON "_products_v_rels" USING btree ("product_categories_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "product_categories" DROP CONSTRAINT "product_categories_page_route_id_public_routes_id_fk";
  
  ALTER TABLE "products" DROP CONSTRAINT "products_page_route_id_public_routes_id_fk";
  
  ALTER TABLE "products_rels" DROP CONSTRAINT "products_rels_product_categories_fk";
  
  ALTER TABLE "_products_v" DROP CONSTRAINT "_products_v_version_page_route_id_public_routes_id_fk";
  
  ALTER TABLE "_products_v_rels" DROP CONSTRAINT "_products_v_rels_product_categories_fk";
  
  DROP INDEX "product_categories_page_route_idx";
  DROP INDEX "product_categories_source_route_id_idx";
  DROP INDEX "products_page_route_idx";
  DROP INDEX "products_source_route_id_idx";
  DROP INDEX "products_rels_product_categories_id_idx";
  DROP INDEX "_products_v_version_version_page_route_idx";
  DROP INDEX "_products_v_version_version_source_route_id_idx";
  DROP INDEX "_products_v_rels_product_categories_id_idx";
  ALTER TABLE "product_categories" DROP COLUMN "page_route_id";
  ALTER TABLE "product_categories" DROP COLUMN "source_route_id";
  ALTER TABLE "products" DROP COLUMN "page_route_id";
  ALTER TABLE "products" DROP COLUMN "source_route_id";
  ALTER TABLE "products_rels" DROP COLUMN "product_categories_id";
  ALTER TABLE "_products_v" DROP COLUMN "version_page_route_id";
  ALTER TABLE "_products_v" DROP COLUMN "version_source_route_id";
  ALTER TABLE "_products_v_rels" DROP COLUMN "product_categories_id";`)
}
