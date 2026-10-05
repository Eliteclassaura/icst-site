import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_rs_h_level" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum_rs_mode" AS ENUM('after-section', 'before-heading', 'replace-body', 'template-slot');
  CREATE TYPE "public"."enum__rs_h_v_level" AS ENUM('2', '3', '4');
  CREATE TYPE "public"."enum__rs_v_mode" AS ENUM('after-section', 'before-heading', 'replace-body', 'template-slot');
  CREATE TABLE "rs_h" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_rs_h_level" DEFAULT '2',
  	"block_name" varchar
  );
  
  CREATE TABLE "rs_p" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "rs_l_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb
  );
  
  CREATE TABLE "rs_l" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ordered" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "rs_t_head" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "rs_t_cells" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "rs_t_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "rs_t" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "rs_f_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  CREATE TABLE "rs_f" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "rs_i" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"caption" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"block_name" varchar
  );
  
  CREATE TABLE "rs" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"mode" "enum_rs_mode",
  	"anchor" varchar,
  	"source" varchar
  );
  
  CREATE TABLE "_rs_h_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"text" varchar,
  	"level" "enum__rs_h_v_level" DEFAULT '2',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_p_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_l_items_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_rs_l_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"ordered" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_t_head_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_rs_t_cells_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_rs_t_rows_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_rs_t_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_f_items_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_rs_f_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_i_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"_path" text NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"image_id" uuid,
  	"alt" varchar,
  	"caption" varchar,
  	"image_url" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_rs_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"mode" "enum__rs_v_mode",
  	"anchor" varchar,
  	"source" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "rs_h" ADD CONSTRAINT "rs_h_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_p" ADD CONSTRAINT "rs_p_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_l_items" ADD CONSTRAINT "rs_l_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."rs_l"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_l" ADD CONSTRAINT "rs_l_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_t_head" ADD CONSTRAINT "rs_t_head_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."rs_t"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_t_cells" ADD CONSTRAINT "rs_t_cells_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."rs_t_rows"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_t_rows" ADD CONSTRAINT "rs_t_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."rs_t"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_t" ADD CONSTRAINT "rs_t_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_f_items" ADD CONSTRAINT "rs_f_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."rs_f"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_f" ADD CONSTRAINT "rs_f_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs_i" ADD CONSTRAINT "rs_i_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "rs_i" ADD CONSTRAINT "rs_i_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "rs" ADD CONSTRAINT "rs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."public_routes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_h_v" ADD CONSTRAINT "_rs_h_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_p_v" ADD CONSTRAINT "_rs_p_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_l_items_v" ADD CONSTRAINT "_rs_l_items_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_rs_l_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_l_v" ADD CONSTRAINT "_rs_l_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_t_head_v" ADD CONSTRAINT "_rs_t_head_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_rs_t_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_t_cells_v" ADD CONSTRAINT "_rs_t_cells_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_rs_t_rows_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_t_rows_v" ADD CONSTRAINT "_rs_t_rows_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_rs_t_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_t_v" ADD CONSTRAINT "_rs_t_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_f_items_v" ADD CONSTRAINT "_rs_f_items_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_rs_f_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_f_v" ADD CONSTRAINT "_rs_f_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_i_v" ADD CONSTRAINT "_rs_i_v_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_rs_i_v" ADD CONSTRAINT "_rs_i_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_rs_v" ADD CONSTRAINT "_rs_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_public_routes_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "rs_h_order_idx" ON "rs_h" USING btree ("_order");
  CREATE INDEX "rs_h_parent_id_idx" ON "rs_h" USING btree ("_parent_id");
  CREATE INDEX "rs_h_path_idx" ON "rs_h" USING btree ("_path");
  CREATE INDEX "rs_p_order_idx" ON "rs_p" USING btree ("_order");
  CREATE INDEX "rs_p_parent_id_idx" ON "rs_p" USING btree ("_parent_id");
  CREATE INDEX "rs_p_path_idx" ON "rs_p" USING btree ("_path");
  CREATE INDEX "rs_l_items_order_idx" ON "rs_l_items" USING btree ("_order");
  CREATE INDEX "rs_l_items_parent_id_idx" ON "rs_l_items" USING btree ("_parent_id");
  CREATE INDEX "rs_l_order_idx" ON "rs_l" USING btree ("_order");
  CREATE INDEX "rs_l_parent_id_idx" ON "rs_l" USING btree ("_parent_id");
  CREATE INDEX "rs_l_path_idx" ON "rs_l" USING btree ("_path");
  CREATE INDEX "rs_t_head_order_idx" ON "rs_t_head" USING btree ("_order");
  CREATE INDEX "rs_t_head_parent_id_idx" ON "rs_t_head" USING btree ("_parent_id");
  CREATE INDEX "rs_t_cells_order_idx" ON "rs_t_cells" USING btree ("_order");
  CREATE INDEX "rs_t_cells_parent_id_idx" ON "rs_t_cells" USING btree ("_parent_id");
  CREATE INDEX "rs_t_rows_order_idx" ON "rs_t_rows" USING btree ("_order");
  CREATE INDEX "rs_t_rows_parent_id_idx" ON "rs_t_rows" USING btree ("_parent_id");
  CREATE INDEX "rs_t_order_idx" ON "rs_t" USING btree ("_order");
  CREATE INDEX "rs_t_parent_id_idx" ON "rs_t" USING btree ("_parent_id");
  CREATE INDEX "rs_t_path_idx" ON "rs_t" USING btree ("_path");
  CREATE INDEX "rs_f_items_order_idx" ON "rs_f_items" USING btree ("_order");
  CREATE INDEX "rs_f_items_parent_id_idx" ON "rs_f_items" USING btree ("_parent_id");
  CREATE INDEX "rs_f_order_idx" ON "rs_f" USING btree ("_order");
  CREATE INDEX "rs_f_parent_id_idx" ON "rs_f" USING btree ("_parent_id");
  CREATE INDEX "rs_f_path_idx" ON "rs_f" USING btree ("_path");
  CREATE INDEX "rs_i_order_idx" ON "rs_i" USING btree ("_order");
  CREATE INDEX "rs_i_parent_id_idx" ON "rs_i" USING btree ("_parent_id");
  CREATE INDEX "rs_i_path_idx" ON "rs_i" USING btree ("_path");
  CREATE INDEX "rs_i_image_idx" ON "rs_i" USING btree ("image_id");
  CREATE INDEX "rs_order_idx" ON "rs" USING btree ("_order");
  CREATE INDEX "rs_parent_id_idx" ON "rs" USING btree ("_parent_id");
  CREATE INDEX "_rs_h_v_order_idx" ON "_rs_h_v" USING btree ("_order");
  CREATE INDEX "_rs_h_v_parent_id_idx" ON "_rs_h_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_h_v_path_idx" ON "_rs_h_v" USING btree ("_path");
  CREATE INDEX "_rs_p_v_order_idx" ON "_rs_p_v" USING btree ("_order");
  CREATE INDEX "_rs_p_v_parent_id_idx" ON "_rs_p_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_p_v_path_idx" ON "_rs_p_v" USING btree ("_path");
  CREATE INDEX "_rs_l_items_v_order_idx" ON "_rs_l_items_v" USING btree ("_order");
  CREATE INDEX "_rs_l_items_v_parent_id_idx" ON "_rs_l_items_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_l_v_order_idx" ON "_rs_l_v" USING btree ("_order");
  CREATE INDEX "_rs_l_v_parent_id_idx" ON "_rs_l_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_l_v_path_idx" ON "_rs_l_v" USING btree ("_path");
  CREATE INDEX "_rs_t_head_v_order_idx" ON "_rs_t_head_v" USING btree ("_order");
  CREATE INDEX "_rs_t_head_v_parent_id_idx" ON "_rs_t_head_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_t_cells_v_order_idx" ON "_rs_t_cells_v" USING btree ("_order");
  CREATE INDEX "_rs_t_cells_v_parent_id_idx" ON "_rs_t_cells_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_t_rows_v_order_idx" ON "_rs_t_rows_v" USING btree ("_order");
  CREATE INDEX "_rs_t_rows_v_parent_id_idx" ON "_rs_t_rows_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_t_v_order_idx" ON "_rs_t_v" USING btree ("_order");
  CREATE INDEX "_rs_t_v_parent_id_idx" ON "_rs_t_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_t_v_path_idx" ON "_rs_t_v" USING btree ("_path");
  CREATE INDEX "_rs_f_items_v_order_idx" ON "_rs_f_items_v" USING btree ("_order");
  CREATE INDEX "_rs_f_items_v_parent_id_idx" ON "_rs_f_items_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_f_v_order_idx" ON "_rs_f_v" USING btree ("_order");
  CREATE INDEX "_rs_f_v_parent_id_idx" ON "_rs_f_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_f_v_path_idx" ON "_rs_f_v" USING btree ("_path");
  CREATE INDEX "_rs_i_v_order_idx" ON "_rs_i_v" USING btree ("_order");
  CREATE INDEX "_rs_i_v_parent_id_idx" ON "_rs_i_v" USING btree ("_parent_id");
  CREATE INDEX "_rs_i_v_path_idx" ON "_rs_i_v" USING btree ("_path");
  CREATE INDEX "_rs_i_v_image_idx" ON "_rs_i_v" USING btree ("image_id");
  CREATE INDEX "_rs_v_order_idx" ON "_rs_v" USING btree ("_order");
  CREATE INDEX "_rs_v_parent_id_idx" ON "_rs_v" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "rs_h" CASCADE;
  DROP TABLE "rs_p" CASCADE;
  DROP TABLE "rs_l_items" CASCADE;
  DROP TABLE "rs_l" CASCADE;
  DROP TABLE "rs_t_head" CASCADE;
  DROP TABLE "rs_t_cells" CASCADE;
  DROP TABLE "rs_t_rows" CASCADE;
  DROP TABLE "rs_t" CASCADE;
  DROP TABLE "rs_f_items" CASCADE;
  DROP TABLE "rs_f" CASCADE;
  DROP TABLE "rs_i" CASCADE;
  DROP TABLE "rs" CASCADE;
  DROP TABLE "_rs_h_v" CASCADE;
  DROP TABLE "_rs_p_v" CASCADE;
  DROP TABLE "_rs_l_items_v" CASCADE;
  DROP TABLE "_rs_l_v" CASCADE;
  DROP TABLE "_rs_t_head_v" CASCADE;
  DROP TABLE "_rs_t_cells_v" CASCADE;
  DROP TABLE "_rs_t_rows_v" CASCADE;
  DROP TABLE "_rs_t_v" CASCADE;
  DROP TABLE "_rs_f_items_v" CASCADE;
  DROP TABLE "_rs_f_v" CASCADE;
  DROP TABLE "_rs_i_v" CASCADE;
  DROP TABLE "_rs_v" CASCADE;
  DROP TYPE "public"."enum_rs_h_level";
  DROP TYPE "public"."enum_rs_mode";
  DROP TYPE "public"."enum__rs_h_v_level";
  DROP TYPE "public"."enum__rs_v_mode";`)
}
