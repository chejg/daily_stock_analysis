# -*- coding: utf-8 -*-
from pydantic import BaseModel
from typing import List, Optional

class MonitorSummaryItem(BaseModel):
    stock_code: str
    stock_name: str
    operation_advice: str
    trend_prediction: str
    sentiment_label: str
    sentiment_score: int
    key_points: str
    current_price: Optional[float] = None
    change_pct: Optional[float] = None
    update_time: str

class MonitorSummaryResponse(BaseModel):
    total: int
    items: List[MonitorSummaryItem]

class RealtimeMonitorRequest(BaseModel):
    stock_code: str

class RealtimeMonitorResponse(BaseModel):
    stock_code: str
    stock_name: str
    current_price: Optional[float] = None
    change_pct: Optional[float] = None
    advice: str
    update_time: str
    success: bool
    error_message: Optional[str] = None
