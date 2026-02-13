-- Bi-Amazon backend performance indexes
-- Safe to run multiple times (checks INFORMATION_SCHEMA before ALTER TABLE)
-- Execute against target DB (e.g. bi_amazon)

SET @db_name := DATABASE();

-- dim_bsr_item: accelerate latest-batch and asin lookup queries
SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_bsr_item'
      AND index_name = 'idx_dim_bsr_item_site_asin_createtime'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_bsr_item ADD INDEX idx_dim_bsr_item_site_asin_createtime (site, asin, createtime)',
    'SELECT "idx_dim_bsr_item_site_asin_createtime exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_bsr_item'
      AND index_name = 'idx_dim_bsr_item_site_createtime_rank_asin'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_bsr_item ADD INDEX idx_dim_bsr_item_site_createtime_rank_asin (site, createtime, bsr_rank, asin)',
    'SELECT "idx_dim_bsr_item_site_createtime_rank_asin exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- dim_bsr_mapping: accelerate owner/admin mapping joins and group operations
SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_bsr_mapping'
      AND index_name = 'idx_dim_bsr_mapping_owner_site_competitor_date'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_bsr_mapping ADD INDEX idx_dim_bsr_mapping_owner_site_competitor_date (owner_userid, site, competitor_asin, createtime)',
    'SELECT "idx_dim_bsr_mapping_owner_site_competitor_date exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_bsr_mapping'
      AND index_name = 'idx_dim_bsr_mapping_site_competitor_date'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_bsr_mapping ADD INDEX idx_dim_bsr_mapping_site_competitor_date (site, competitor_asin, createtime)',
    'SELECT "idx_dim_bsr_mapping_site_competitor_date exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- dim_bsr_product: accelerate site list ordering
SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_bsr_product'
      AND index_name = 'idx_dim_bsr_product_site_updated_created_asin'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_bsr_product ADD INDEX idx_dim_bsr_product_site_updated_created_asin (site, updated_at, created_at, asin)',
    'SELECT "idx_dim_bsr_product_site_updated_created_asin exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- dim_product_visibility: accelerate restricted access checks
SET @exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = @db_name
      AND table_name = 'dim_product_visibility'
      AND index_name = 'idx_dim_product_visibility_operator_asin'
);
SET @sql := IF(
    @exists = 0,
    'ALTER TABLE dim_product_visibility ADD INDEX idx_dim_product_visibility_operator_asin (operator_userid, asin)',
    'SELECT "idx_dim_product_visibility_operator_asin exists"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
