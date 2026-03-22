import React, { useEffect, useState } from 'react';
import { RefreshCw, Activity, AlertCircle } from 'lucide-react';
import type { MonitorSummaryItem } from '../api/monitor';
import { getMonitorSummary, getRealtimeMonitor } from '../api/monitor';
import { Card, Button, Badge, Loading, AppPage } from '../components/common';
import { cn } from '../utils/cn';

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

/** Map operation-advice text → Badge variant */
const getAdviceBadgeVariant = (advice: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  const a = advice.toLowerCase();
  if (['强烈买入', 'strong buy', '买入', 'buy', '加仓', 'accumulate'].some(k => a.includes(k))) return 'success';
  if (['持有', 'hold'].some(k => a.includes(k))) return 'info';
  if (['观望', 'watch', 'wait'].some(k => a.includes(k))) return 'warning';
  if (['减仓', 'reduce', 'trim'].some(k => a.includes(k))) return 'warning';
  if (['卖出', 'sell', '强烈卖出', 'strong sell'].some(k => a.includes(k))) return 'danger';
  return 'default';
};

/** Map trend-prediction text → Badge variant */
const getTrendBadgeVariant = (trend: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  const t = trend.toLowerCase();
  if (['强烈看多', 'strong bullish', '看多', 'bullish', 'uptrend'].some(k => t.includes(k))) return 'success';
  if (['震荡', 'neutral', 'sideways', 'range'].some(k => t.includes(k))) return 'warning';
  if (['看空', 'bearish', 'downtrend', '强烈看空', 'strong bearish'].some(k => t.includes(k))) return 'danger';
  return 'default';
};

const getSentimentColor = (score: number) => {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
};

const getChangeColor = (change?: number) => {
  if (change === undefined || change === null) return 'text-secondary-text';
  if (change > 0) return 'text-danger';   // A-share: red = up
  if (change < 0) return 'text-success';  // A-share: green = down
  return 'text-secondary-text';
};

/* ------------------------------------------------------------------ */
/*  Key-points parser: "买点: X | 止盈: Y | 止损: Z" → structured      */
/* ------------------------------------------------------------------ */

const parseKeyPoints = (raw: string) => {
  const parts = raw.split('|').map(s => s.trim());
  const result: { label: string; value: string; color: string }[] = [];
  for (const p of parts) {
    if (p.startsWith('买点')) {
      result.push({ label: '买点', value: p.replace(/^买点[:：]\s*/, ''), color: 'text-success' });
    } else if (p.startsWith('止盈')) {
      result.push({ label: '止盈', value: p.replace(/^止盈[:：]\s*/, ''), color: 'text-warning' });
    } else if (p.startsWith('止损')) {
      result.push({ label: '止损', value: p.replace(/^止损[:：]\s*/, ''), color: 'text-danger' });
    } else {
      result.push({ label: '', value: p, color: 'text-muted-foreground' });
    }
  }
  return result;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const MonitorPage: React.FC = () => {
  const [summaryItems, setSummaryItems] = useState<MonitorSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Realtime States
  const [refreshingCodes, setRefreshingCodes] = useState<Set<string>>(new Set());
  const [realtimeAdvice, setRealtimeAdvice] = useState<Record<string, string>>({});

  const fetchSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await getMonitorSummary();
      setSummaryItems(resp.items || []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || '获取汇总信息失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleRealtimeRefresh = async (stockCode: string) => {
    setRefreshingCodes((prev) => {
      const next = new Set(prev);
      next.add(stockCode);
      return next;
    });

    try {
      const resp = await getRealtimeMonitor(stockCode);
      if (resp.success) {
        setRealtimeAdvice((prev) => ({
          ...prev,
          [stockCode]: resp.advice,
        }));
        setSummaryItems((prev) =>
          prev.map((item) =>
            item.stock_code === stockCode
              ? { ...item, current_price: resp.current_price, change_pct: resp.change_pct }
              : item
          )
        );
      } else {
        setRealtimeAdvice((prev) => ({
          ...prev,
          [stockCode]: '获取失败：' + resp.error_message,
        }));
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setRealtimeAdvice((prev) => ({
        ...prev,
        [stockCode]: '网络或服务器错误: ' + (e?.message || ''),
      }));
    } finally {
      setRefreshingCodes((prev) => {
        const next = new Set(prev);
        next.delete(stockCode);
        return next;
      });
    }
  };

  return (
    <AppPage className="flex flex-col space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center text-xl font-semibold tracking-tight text-foreground">
            <Activity className="mr-2 h-6 w-6 text-primary" />
            监控台
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            实时监控自选股票异动、市场情绪与智能操作建议
          </p>
        </div>
        <div>
          <Button onClick={fetchSummary} variant="outline" isLoading={isLoading}>
            {!isLoading && <RefreshCw className="mr-2 h-4 w-4" />}
            刷新汇总
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isLoading && !summaryItems.length ? (
        <div className="flex h-64 items-center justify-center">
          <Loading label="加载监控数据中..." />
        </div>
      ) : summaryItems.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Activity className="mb-4 h-12 w-12 opacity-20" />
          <h3 className="text-lg font-medium">暂无自选股汇总</h3>
          <p className="mt-2 text-sm">请先将股票加入自选列表并进行分析</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryItems.map((item) => {
            const isRefreshing = refreshingCodes.has(item.stock_code);
            const rAdvice = realtimeAdvice[item.stock_code];
            const keyPoints = parseKeyPoints(item.key_points);

            return (
              <Card key={item.stock_code} className="flex flex-col overflow-hidden">
                {/* ── Header: name + price ── */}
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-sm font-bold text-foreground sm:text-base">
                      {item.stock_name}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{item.stock_code}</span>
                    </h3>
                    <span className={cn('text-lg font-semibold tabular-nums leading-tight', getChangeColor(item.change_pct))}>
                      {item.current_price ? Number(item.current_price).toFixed(2) : '-'}
                      {item.change_pct !== undefined && item.change_pct !== null ? (
                        <span className="ml-2 text-sm">
                          {item.change_pct > 0 ? '+' : ''}{Number(item.change_pct).toFixed(2)}%
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Badge variant={getSentimentColor(item.sentiment_score)}>
                    {item.sentiment_label} ({item.sentiment_score})
                  </Badge>
                </div>

                {/* ── Body: advice + trend + key points ── */}
                <div className="flex flex-1 flex-col gap-2 px-4 py-3">
                  {/* Advice & Trend in one row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={getAdviceBadgeVariant(item.operation_advice)} size="sm">
                      {item.operation_advice}
                    </Badge>
                    <Badge variant={getTrendBadgeVariant(item.trend_prediction)} size="sm">
                      {item.trend_prediction}
                    </Badge>
                  </div>

                  {/* Key points – compact inline */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {keyPoints.map((kp, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {kp.label && (
                          <span className="font-medium text-muted-foreground">{kp.label}</span>
                        )}
                        <span className={cn('font-semibold', kp.color)}>{kp.value || '-'}</span>
                      </span>
                    ))}
                  </div>

                  {/* Update time */}
                  {item.update_time && (
                    <span className="text-[10px] text-muted-foreground/60">{item.update_time}</span>
                  )}
                </div>

                {/* ── Footer: realtime ── */}
                <div className="border-t border-border/50 bg-muted/10 px-4 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/70">实时分析（开市有效）</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleRealtimeRefresh(item.stock_code)}
                      isLoading={isRefreshing}
                      loadingText="分析中..."
                    >
                      {!isRefreshing && <RefreshCw className="mr-1 h-3 w-3" />}
                      实时建议
                    </Button>
                  </div>
                  {rAdvice && (
                    <div className="mt-1.5 rounded-lg bg-background p-2.5 text-xs border border-border/50 whitespace-pre-wrap leading-relaxed">
                      {rAdvice}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppPage>
  );
};

export default MonitorPage;
