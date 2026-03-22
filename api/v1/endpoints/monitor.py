# -*- coding: utf-8 -*-
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
import json

from api.deps import get_database_manager
from api.v1.schemas.monitor import (
    MonitorSummaryResponse,
    MonitorSummaryItem,
    RealtimeMonitorRequest,
    RealtimeMonitorResponse
)
from src.config import get_config
from src.storage import DatabaseManager
from src.report_language import get_sentiment_label, localize_operation_advice, localize_trend_prediction
from data_provider import DataFetcherManager
from litellm import completion

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get(
    "/summary",
    response_model=MonitorSummaryResponse,
    summary="获取所有自选股汇总监控",
    description="返回自选股最新分析的操作建议、趋势预测、sentiment及聚集点位等汇总信息。"
)
def get_monitor_summary(
    db_manager: DatabaseManager = Depends(get_database_manager)
) -> MonitorSummaryResponse:
    try:
        config = get_config()
        stock_list = config.stock_list
        items: List[MonitorSummaryItem] = []
        
        for code in stock_list:
            # 获取最新一次分析记录
            records = db_manager.get_analysis_history(code=code, limit=1)
            if not records:
                continue
                
            history = records[0]
            
            report_lang = config.report_language or "zh"
            
            # 从 history.raw_result 提取 dashboard
            raw_result = {}
            if history.raw_result:
                try:
                    raw_result = json.loads(history.raw_result)
                except Exception:
                    pass
            dashboard = raw_result.get("dashboard", {}) if raw_result else {}
            
            ideal_buy = history.ideal_buy or dashboard.get("ideal_buy", "")
            take_profit = history.take_profit or dashboard.get("take_profit", "")
            stop_loss = history.stop_loss or dashboard.get("stop_loss", "")
            
            key_points = f"买点: {ideal_buy} | 止盈: {take_profit} | 止损: {stop_loss}"
            
            context_snapshot = {}
            if history.context_snapshot:
                try:
                    context_snapshot = json.loads(history.context_snapshot)
                except Exception:
                    pass
            
            # 从 context_snapshot 中提取价格信息
            current_price = None
            change_pct = None
            if isinstance(context_snapshot, dict):
                enhanced_context = context_snapshot.get("enhanced_context") or {}
                realtime = enhanced_context.get("realtime") or {}
                current_price = realtime.get("price")
                change_pct = realtime.get("change_pct") or realtime.get("change_60d")
                
                if current_price is None:
                    realtime_quote_raw = context_snapshot.get("realtime_quote_raw") or {}
                    current_price = realtime_quote_raw.get("price")
                    change_pct = change_pct or realtime_quote_raw.get("change_pct") or realtime_quote_raw.get("pct_chg")
            
            monitor_item = MonitorSummaryItem(
                stock_code=history.code,
                stock_name=history.name or code,
                operation_advice=localize_operation_advice(history.operation_advice, report_lang),
                trend_prediction=localize_trend_prediction(history.trend_prediction, report_lang),
                sentiment_score=history.sentiment_score or 50,
                sentiment_label=get_sentiment_label(history.sentiment_score, report_lang),
                key_points=key_points,
                current_price=current_price,
                change_pct=change_pct,
                update_time=history.created_at.strftime("%Y-%m-%d %H:%M:%S") if history.created_at else ""
            )
            items.append(monitor_item)
            
        return MonitorSummaryResponse(total=len(items), items=items)
    except Exception as e:
        logger.error(f"获取监控汇总失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post(
    "/realtime",
    response_model=RealtimeMonitorResponse,
    summary="获取指定股票的实时监控建议",
)
def get_realtime_monitor(
    request: RealtimeMonitorRequest = Body(...),
) -> RealtimeMonitorResponse:
    try:
        code = request.stock_code
        config = get_config()
        
        # 获取实时行情
        manager = DataFetcherManager()
        quote = manager.get_realtime_quote(code)
        current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if not quote:
            return RealtimeMonitorResponse(
                stock_code=code,
                stock_name=code,
                advice="无法获取实时行情数据。",
                update_time=current_time,
                success=False,
                error_message="No quote from data providers."
            )
            
        # 构建 LLM 提示词
        quote_dict = quote.__dict__ if hasattr(quote, '__dict__') else quote
        quote_text = json.dumps(quote_dict, ensure_ascii=False, default=str, indent=2)
        
        prompt = f"""
你是一个专业的实时股票交易助手。当前时间（可能盘中）：{current_time}。
这是股票 {quote_dict.get('name', code)} ({code}) 刚刚抓取到的真实实时行情数据：
```json
{quote_text}
```

请基于以上最新分钟级或日级现价、涨跌幅、量价以及盘口数据，给出一个简短的、针对当前的**具体实时操作建议**，包括：
1. 现状评估 (1句说明现状)
2. 操作建议 (买入/观望/卖出/持有，明确方向)
3. 盘中关键关注点 (如压力/支撑)

只需返回核心建议文本，不要罗嗦，越直接越好。
"""
        model = config.litellm_model or "gemini/gemini-2.5-flash"
        
        # 简易调用 LiteLLM
        try:
            response = completion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=300
            )
            advice = response.choices[0].message.content
            success = True
            error_msg = None
        except Exception as llm_err:
            logger.warning(f"实时建议调用大模型失败: {llm_err}")
            advice = f"获取实时数据成功，但生成大模型建议失败: {llm_err}"
            success = False
            error_msg = str(llm_err)

        return RealtimeMonitorResponse(
            stock_code=code,
            stock_name=quote_dict.get('name', code),
            current_price=quote_dict.get('price'),
            change_pct=quote_dict.get('change_pct', quote_dict.get('pct_chg')),
            advice=advice.strip(),
            update_time=current_time,
            success=success,
            error_message=error_msg
        )
        
    except Exception as e:
        logger.error(f"获取实时监控异常: {e}", exc_info=True)
        return RealtimeMonitorResponse(
            stock_code=request.stock_code,
            stock_name=request.stock_code,
            advice="发生内部错误",
            update_time=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            success=False,
            error_message=str(e)
        )
