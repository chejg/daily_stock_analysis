import apiClient from './index';

export interface MonitorSummaryItem {
  stock_code: string;
  stock_name: string;
  operation_advice: string;
  trend_prediction: string;
  sentiment_label: string;
  sentiment_score: number;
  key_points: string;
  current_price?: number;
  change_pct?: number;
  update_time: string;
}

export interface MonitorSummaryResponse {
  total: number;
  items: MonitorSummaryItem[];
}

export interface RealtimeMonitorResponse {
  stock_code: string;
  stock_name: string;
  current_price?: number;
  change_pct?: number;
  advice: string;
  update_time: string;
  success: boolean;
  error_message?: string;
}

export const getMonitorSummary = async (): Promise<MonitorSummaryResponse> => {
  const response = await apiClient.get<MonitorSummaryResponse>('/api/v1/monitor/summary');
  return response.data;
};

export const getRealtimeMonitor = async (stockCode: string): Promise<RealtimeMonitorResponse> => {
  const response = await apiClient.post<RealtimeMonitorResponse>('/api/v1/monitor/realtime', {
    stock_code: stockCode,
  });
  return response.data;
};
