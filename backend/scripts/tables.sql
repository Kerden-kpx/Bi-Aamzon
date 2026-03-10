-- bi_amazon.dim_bi_amazon_item definition

CREATE TABLE `dim_bi_amazon_item` (
  `asin` varchar(25) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ASIN',
  `site` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '站点',
  `parent_asin` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '父级 ASIN',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品标题',
  `image_url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品主图 URL',
  `product_url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '亚马逊产品详情页链接',
  `brand` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品牌',
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类目',
  `price` decimal(10,2) DEFAULT NULL COMMENT '售价',
  `list_price` decimal(10,2) DEFAULT NULL COMMENT '原价',
  `is_limited_time_deal` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否Limited time deal: 1是 0否',
  `score` decimal(3,1) DEFAULT NULL COMMENT '评分',
  `comment_count` int DEFAULT '0' COMMENT '评论总数',
  `bsr_rank` int DEFAULT NULL COMMENT 'BSR排名',
  `category_rank` int DEFAULT NULL COMMENT '大类排名',
  `variation_count` int DEFAULT '1' COMMENT '变体数',
  `launch_date` date DEFAULT NULL COMMENT '上架日期',
  `conversion_rate` decimal(5,4) DEFAULT NULL COMMENT '综合转化率',
  `conversion_rate_period` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '转化率周期',
  `organic_traffic_count` int DEFAULT NULL COMMENT '7天自然流量得分',
  `organic_search_terms` int DEFAULT '0' COMMENT '自然搜索词',
  `ad_traffic_count` int DEFAULT NULL COMMENT '7天广告流量得分',
  `ad_search_terms` int DEFAULT '0' COMMENT '广告流量词',
  `search_recommend_terms` int DEFAULT '0' COMMENT '搜索推荐词',
  `sales_volume` int DEFAULT '0' COMMENT '月销量',
  `sales` decimal(12,2) DEFAULT '0.00' COMMENT '月销售额',
  `tags` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品标签，多个标签用逗号分隔',
  `type` varchar(25) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品类型',
  `createtime` date NOT NULL DEFAULT (curdate()) COMMENT '创建日期',
  PRIMARY KEY (`asin`,`site`,`createtime`),
  KEY `idx_bsr_site_date_rank` (`site`,`createtime`,`bsr_rank`),
  KEY `idx_bsr_site_asin` (`site`,`asin`),
  KEY `idx_dim_bsr_item_site_asin_createtime` (`site`,`asin`,`createtime`),
  KEY `idx_dim_bsr_item_site_createtime_rank_asin` (`site`,`createtime`,`bsr_rank`,`asin`),
  KEY `idx_dim_bsr_item_site_asin_createtime_rank` (`site`,`asin`,`createtime`,`bsr_rank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='亚马逊BSR数据明细表';


-- bi_amazon.dim_bi_amazon_log definition

CREATE TABLE `dim_bi_amazon_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `module` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模块',
  `action` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '动作',
  `target_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '目标ID',
  `operator_userid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作者userid',
  `operator_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '操作者姓名',
  `detail` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '详情',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_module_action` (`module`,`action`),
  KEY `idx_operator_userid` (`operator_userid`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2539 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志';


-- bi_amazon.dim_bi_amazon_mapping definition

CREATE TABLE `dim_bi_amazon_mapping` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `competitor_asin` varchar(25) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '竞品ASIN',
  `yida_asin` varchar(25) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '自家ASIN',
  `owner_userid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '映射所属用户(dingtalk_userid)',
  `site` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '站点/市场',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_owner_site_comp_yida` (`owner_userid`,`site`,`competitor_asin`,`yida_asin`),
  KEY `idx_dim_bsr_mapping_owner_site_competitor` (`owner_userid`,`site`,`competitor_asin`),
  KEY `idx_dim_bsr_mapping_owner_site_yida` (`owner_userid`,`site`,`yida_asin`),
  KEY `idx_dim_bsr_mapping_site_competitor` (`site`,`competitor_asin`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BSR映射表(按用户)';


-- bi_amazon.dim_bi_amazon_permissions definition

CREATE TABLE `dim_bi_amazon_permissions` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `operator_userid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '被授权用户ID',
  `asin` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '授权ASIN',
  `site` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'US' COMMENT '授权站点',
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '授权操作人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_asin_site` (`operator_userid`,`asin`,`site`),
  KEY `idx_user` (`operator_userid`),
  KEY `idx_asin` (`asin`),
  KEY `idx_site` (`site`),
  KEY `idx_dim_product_visibility_operator_asin_site` (`operator_userid`,`asin`,`site`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户产品可见权限(ASIN+站点)';


-- bi_amazon.dim_bi_amazon_product definition

CREATE TABLE `dim_bi_amazon_product` (
  `asin` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ASIN - 对应亚马逊ASIN，主键',
  `site` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'US',
  `sku` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SKU编号 - 内部SKU标识',
  `brand` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '品牌名 - EZARC / TOLESA 等',
  `product` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品简称 - 便于内部识别的命名',
  `category` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '类目 - 产品所属类目',
  `application_tags` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '应用标签 - 切木/切枝/切金属/切石工等，多个用逗号分隔',
  `other_tags` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '其他标签 - Japanese Tooth/Demolition/Carbide Teeth等，多个用逗号分隔',
  `material_tags` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '材质标签 - Bi-Metal/Carbide/HCS/CRV等，多个用逗号分隔',
  `spec_length` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格-长度',
  `spec_quantity` int unsigned DEFAULT NULL COMMENT '规格-片数',
  `spec_other` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格-其他信息',
  `position_tags` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '定位标签 - 主推/防守/补位/新品等，多个用逗号分隔',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '在售' COMMENT '产品状态',
  `created_at` date DEFAULT NULL COMMENT '创建时间',
  `updated_at` date DEFAULT NULL COMMENT '最近更新时间',
  `creator_userid` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建者钉钉userid',
  PRIMARY KEY (`asin`,`site`),
  KEY `idx_dim_bsr_product_site_updated_at` (`site`,`updated_at`),
  KEY `idx_dim_bsr_product_site_updated_created_asin` (`site`,`updated_at`,`created_at`,`asin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='易达产品表';


-- bi_amazon.dim_bi_amazon_role definition

CREATE TABLE `dim_bi_amazon_role` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'admin|team_lead|operator',
  `role_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色名称',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`role_code`),
  KEY `idx_role_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC角色维表';


-- bi_amazon.dim_bi_amazon_todo definition

CREATE TABLE `dim_bi_amazon_todo` (
  `site` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'US' COMMENT '站点',
  `competitor_asin` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '竞品ASIN',
  `yida_asin` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '自家ASIN',
  `userid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '创建人userid',
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '待办事项标题(subject)',
  `detail` varchar(5000) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '策略内容/待办描述(description)',
  `owner_userid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '负责人userid',
  `owner_unionid` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '负责人钉钉unionId',
  `owner_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '负责人姓名',
  `participant_userids` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '参与人userid列表(逗号分隔)',
  `participant_names` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '参与人姓名列表(逗号分隔)',
  `review_date` date DEFAULT NULL COMMENT '日期',
  `deadline_time` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '截止时间',
  `reminder_time` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '提醒时间',
  `priority` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '优先级',
  `state` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '待开始' COMMENT '状态',
  `dingtalk_task_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '钉钉待办任务ID',
  `created_at` date NOT NULL DEFAULT (curdate()) COMMENT '创建日期',
  `updated_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后更新人userid',
  PRIMARY KEY (`owner_userid`,`dingtalk_task_id`),
  KEY `idx_dim_bi_amazon_todo_site` (`site`),
  KEY `idx_dim_bi_amazon_todo_yida_asin` (`yida_asin`),
  KEY `idx_dim_bi_amazon_todo_state` (`state`),
  KEY `idx_dim_bi_amazon_todo_review_date` (`review_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BI Amazon钉钉待办表';


-- bi_amazon.dim_bi_amazon_user definition

CREATE TABLE `dim_bi_amazon_user` (
  `dingtalk_userid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '钉钉用户ID',
  `dingtalk_unionid` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '钉钉unionId',
  `dingtalk_username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '钉钉用户名',
  `avatar_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '头像URL',
  `role` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'operator' COMMENT '角色',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active/disabled',
  `product_scope` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT 'all|restricted',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`dingtalk_userid`),
  KEY `idx_role_status` (`role`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';


-- bi_amazon.fact_bi_amazon_product_day definition

CREATE TABLE `fact_bi_amazon_product_day` (
  `site` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '站点',
  `asin` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'ASIN',
  `date` date NOT NULL COMMENT '日期',
  `buybox_price` decimal(10,2) DEFAULT NULL COMMENT 'Buybox价格($)',
  `price` decimal(10,2) DEFAULT NULL COMMENT '价格($)',
  `prime_price` decimal(10,2) DEFAULT NULL COMMENT 'Prime价格($)',
  `coupon_price` decimal(10,2) DEFAULT NULL COMMENT 'Coupon价格($)',
  `coupon_discount` decimal(5,2) DEFAULT NULL COMMENT 'Coupon折扣',
  `child_sales` int DEFAULT NULL COMMENT '子体销量',
  `sales_volume` int DEFAULT NULL COMMENT '日销量',
  `fba_price` decimal(10,2) DEFAULT NULL COMMENT 'FBA价格($)',
  `fbm_price` decimal(10,2) DEFAULT NULL COMMENT 'FBM价格($)',
  `strikethrough_price` decimal(10,2) DEFAULT NULL COMMENT '划线价格($)',
  `bsr_rank` int DEFAULT NULL COMMENT 'BSR排名',
  `bsr_reciprocating_saw_blades` int DEFAULT NULL COMMENT 'BSR[Reciprocating Saw Blades]',
  `rating` decimal(4,2) DEFAULT NULL COMMENT '评分',
  `rating_count` int DEFAULT NULL COMMENT '评分数',
  `seller_count` int DEFAULT NULL COMMENT '卖家数',
  PRIMARY KEY (`asin`,`date`,`site`),
  KEY `idx_bsr_daily_site_date` (`site`,`date`),
  KEY `idx_bsr_daily_asin_site` (`asin`,`site`),
  KEY `idx_bsr_daily_site_asin_date` (`site`,`asin`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- bi_amazon.fact_bi_amazon_product_month definition

CREATE TABLE `fact_bi_amazon_product_month` (
  `site` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '站点',
  `asin` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ASIN',
  `month` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '月份(YYYY-MM)',
  `sales_volume` int DEFAULT NULL COMMENT '月销量',
  `sales` decimal(12,2) DEFAULT NULL COMMENT '月销售额',
  `is_child` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否子体',
  `price` decimal(10,2) DEFAULT NULL COMMENT '价格',
  PRIMARY KEY (`site`,`asin`,`month`,`is_child`),
  KEY `idx_month` (`month`),
  KEY `idx_asin` (`asin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BSR月度销量/销售额历史表';

-- bi_amazon.fact_bi_amzon_insight definition

CREATE TABLE `fact_bi_amzon_insight` (
  `job_id` varchar(32) NOT NULL COMMENT '任务ID',
  `site` varchar(10) NOT NULL COMMENT '站点',
  `asin` varchar(20) NOT NULL COMMENT 'ASIN',
  `operator_userid` varchar(64) NOT NULL COMMENT '操作人用户ID',
  `status` varchar(20) NOT NULL COMMENT '状态(pending/running/success/failed)',
  `report_text` longtext COMMENT 'AI分析报告',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`job_id`),
  KEY `idx_ai_site_asin` (`site`,`asin`),
  KEY `idx_ai_operator` (`operator_userid`),
  KEY `idx_ai_status_created` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI分析任务与结果';


-- bi_amazon.dim_bi_amazon_role_rule definition

CREATE TABLE `dim_bi_amazon_role_rule` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色编码',
  `resource` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'product|strategy|user|permission',
  `action` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'read|write|manage',
  `scope_type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'all|team|brand|self',
  `effect` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'allow' COMMENT 'allow|deny',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_rule` (`role_code`,`resource`,`action`,`scope_type`,`effect`),
  KEY `idx_res_action` (`resource`,`action`),
  CONSTRAINT `fk_role_rule_role` FOREIGN KEY (`role_code`) REFERENCES `dim_bi_amazon_role` (`role_code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色规则';


-- bi_amazon.rel_bi_amazon_team_member definition

CREATE TABLE `rel_bi_amazon_team_member` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `team_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '运营组名',
  `dingtalk_userid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `member_role` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member' COMMENT 'lead|member',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_team_user` (`team_name`,`dingtalk_userid`),
  KEY `idx_userid` (`dingtalk_userid`),
  KEY `idx_team_role` (`team_name`,`member_role`),
  CONSTRAINT `fk_team_member_user` FOREIGN KEY (`dingtalk_userid`) REFERENCES `dim_bi_amazon_user` (`dingtalk_userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运营组成员关系';


-- bi_amazon.rel_bi_amazon_user_role definition

CREATE TABLE `rel_bi_amazon_user_role` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dingtalk_userid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `role_code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '角色编码',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`dingtalk_userid`,`role_code`),
  KEY `idx_role_code` (`role_code`),
  CONSTRAINT `fk_rel_user_role_role` FOREIGN KEY (`role_code`) REFERENCES `dim_bi_amazon_role` (`role_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_rel_user_role_user` FOREIGN KEY (`dingtalk_userid`) REFERENCES `dim_bi_amazon_user` (`dingtalk_userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关系';
