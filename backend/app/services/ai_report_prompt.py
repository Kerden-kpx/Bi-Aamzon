from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List

# Gemini system prompt for Keepa-style deep report.
KEEPA_REPORT_SYSTEM_PROMPT = """你是资深 Amazon 运营数据分析师，擅长 Keepa 时序数据、价格策略、BSR 归因、库存断货影响、评论增长异常识别与生命周期判断。

你的输出必须遵守：
1. 只能基于输入数据分析，不得编造。
2. 每个结论必须给出数据证据（日期+指标值+变化幅度）。
3. 数据不足时必须明确写“数据不足/暂不判断”。
4. 语气专业、克制、可执行，避免空话。
5. 输出语言：中文。
6. 输出格式必须严格按用户给的九大章节与标题。
7. 数值统一：价格保留2位小数；百分比保留1位；排名变化写“上升/下降约X万”。
8. 对“异常点”必须给出“可能原因 + 风险提示 + 验证建议”三段式说明。
9. 最后必须给出“全盘总结与建议”，包含“优势/挑战/优化方向/防御策略/结论”。
10. 必须严格按指定 Markdown 模板排版输出（标题层级、分割线、加粗小标题、列表符号）。
"""


def build_keepa_report_user_prompt(
    asin: str,
    site: str,
    range_days: int,
    summary: Dict[str, Any],
    rows_payload: List[Dict[str, Any]],
) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    summary_json = json.dumps(summary, ensure_ascii=False)
    rows_json = json.dumps(rows_payload, ensure_ascii=False)
    return f"""请基于以下数据生成《Keepa数据深度解析报告 - ASIN: {asin}》。

基础信息：
- ASIN: {asin}
- Site: {site}
- 数据周期: {summary.get("date_start", "")} ~ {summary.get("date_end", "")}
- 分析日期: {today}
- 观察窗口: 最近{range_days}天
- 数据来源: fact_bsr_daily

字段说明：
- date, buybox_price, price, prime_price, coupon_price, coupon_discount
- child_sales, fba_price, fbm_price, strikethrough_price
- bsr_rank, bsr_reciprocating_saw_blades, rating, rating_count, seller_count

原始数据（按日期升序，JSON数组）：
{rows_json}

汇总数据（JSON）：
{summary_json}

请严格输出以下结构（标题不要改）：
Keepa数据深度解析报告 - ASIN: {asin}
一、关键时间点分析：运营节奏与首单判断
二、评分数曲线分析：上评手法及异常点评估
三、价格策略分析：促销手法与折扣心理学
四、FBA断货分析：库存管理能力评估
五、跟卖攻防：品牌保护能力分析
六、排名归因分析
七、子体销量与季节性
八、生命周期判断与依据
九、全盘总结与建议

额外分析规则：
1. “最早在售日期”：优先以价格相关字段首次非空日期判定。
2. “首单出单日期”：以 bsr_rank 首次非空日期判定。
3. “首条评论时间”：以 rating_count 首次大于0日期判定。
4. 评分异常：单日 rating_count 增量 >= max(20, 最近30天日增量P95*2) 视为异常候选。
5. 断货判定：fba_price 为空连续区间；输出每段起止日期、天数、断货前后 bsr_rank 变化。
6. 跟卖判定：seller_count > 1 视为存在跟卖风险；否则写“未发现明显跟卖”。
7. 价格与排名关系：至少给3个“调价-排名变化”案例（若数据不足则按实际输出）。
8. 生命周期必须在“新品期/成长期/成熟期/衰退期”四选一，并给排除其他阶段依据。
9. 建议必须可执行，至少覆盖：库存、价格、评论、竞争监控。

输出风格要求：
- 段落清晰，优先“结论先行 + 证据支撑”。
- 不要输出代码块，不要输出JSON，不要暴露内部规则。
- 必须使用以下排版规范：
  1) 报告标题使用一级标题：`# Keepa数据深度解析报告 - ASIN: ...`
  2) 每个大章节使用二级标题：`## 一、...`
  3) 每个大章节前增加分割线：`---`
  4) 小节标题使用加粗并带冒号：`**最早在售日期：**`
  5) 数据证据使用无序列表：`- 2025-...`
  6) “结论/建议”前缀统一写成：`- 结论：...`、`- 建议：...`
  7) 不要使用表格。"""
