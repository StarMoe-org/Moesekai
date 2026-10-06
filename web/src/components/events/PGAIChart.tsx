"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useI18n } from '@/contexts/I18nContext';
import { KLinePoint } from '@/types/prediction';
import { useMd3ChartColors } from './useMd3ChartColors';

interface PGAIChartProps {
    globalKline: KLinePoint[];
    height?: number;
}

interface TooltipParam {
    dataIndex: number;
}

export default function PGAIChart({ globalKline, height: _height = 300 }: PGAIChartProps) {
    const { t, formatNumber } = useI18n();
    const hasData = globalKline.length > 0;
    const c = useMd3ChartColors();
    const latestPoint = globalKline[globalKline.length - 1];
    const prevPoint = globalKline[globalKline.length - 2];

    const currentIndex = latestPoint?.c || 0;
    // Calculate change % based on previous close, or open if no previous data
    const prevClose = prevPoint?.c || latestPoint?.o || 1;
    const changePct = ((currentIndex - prevClose) / prevClose) * 100;

    const option = useMemo(() => {
        if (!globalKline || globalKline.length === 0) {
            return {
                title: {
                    text: t("page.prediction.pgai.noKlineData"),
                    left: 'center',
                    top: 'center',
                    textStyle: { color: '#94a3b8', fontSize: 14, fontWeight: 'normal' },
                },
            };
        }

        const times = globalKline.map(p => {
            const d = new Date(p.t);
            return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:00`;
        });

        // Candlestick data: [open, close, lowest, highest]
        const ohlc = globalKline.map(p => [p.o, p.c, p.l, p.h]);

        // Calculate start percentage for last 48 points (assuming hourly data)
        // If fewer than 48 points, show all (start = 0)
        const totalPoints = globalKline.length;
        const pointsToShow = 48;
        const startPct = totalPoints > pointsToShow ? ((totalPoints - pointsToShow) / totalPoints) * 100 : 0;

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: c.surfaceContainerHigh,
                borderColor: c.outlineVariant,
                borderWidth: 1,
                textStyle: { color: c.onSurface },
                formatter: (params: TooltipParam[]) => {
                    const idx = params[0].dataIndex;
                    const item = globalKline[idx];
                    return `
             <div style="font-weight:600;margin-bottom:4px">${times[idx]}</div>
             <div style="font-size:12px;color:${c.onSurfaceVariant}">
               ${t("page.prediction.pgai.tooltipOpen")}: ${formatNumber(item.o)} <br/>
               ${t("page.prediction.pgai.tooltipClose")}: ${formatNumber(item.c)} <br/>
               ${t("page.prediction.pgai.tooltipHigh")}: ${formatNumber(item.h)} <br/>
               ${t("page.prediction.pgai.tooltipLow")}: ${formatNumber(item.l)}
             </div>
           `;
                }
            },
            legend: { show: false }, // Remove legend as requested
            grid: [
                { left: '10%', right: '8%', top: '15%', height: '50%' },
                { left: '10%', right: '8%', top: '72%', height: '18%' }
            ],
            xAxis: [
                {
                    type: 'category',
                    data: times,
                    boundaryGap: true,
                    axisLine: { lineStyle: { color: c.outlineVariant } },
                    axisLabel: { color: c.onSurfaceVariant, rotate: 45, fontSize: 9 },
                    axisTick: { show: false },
                    splitLine: { show: false }
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: times,
                    boundaryGap: true,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { show: false },
                    splitLine: { show: false }
                }
            ],
            yAxis: [
                {
                    scale: true,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: c.outlineVariant, type: 'dashed' } },
                    axisLabel: { color: c.onSurfaceVariant }
                },
                {
                    scale: true,
                    gridIndex: 1,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: {
                        show: false // Hide volume labels for cleaner look
                    }
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: startPct,
                    end: 100
                },
                {
                    type: 'slider',
                    xAxisIndex: [0, 1],
                    start: startPct,
                    end: 100,
                    height: 15,
                    bottom: 5,
                    borderColor: c.outlineVariant,
                    backgroundColor: c.surfaceContainer,
                    fillerColor: 'rgba(51, 204, 187, 0.1)',
                }
            ],
            series: [
                {
                    type: 'candlestick',
                    data: ohlc,
                    itemStyle: {
                        color: '#ef4444',     // Rising (Close > Open) -> Red in China/Japan usually? Or Green? 
                        // In standard financial charts: 
                        // China/Japan: Red = Up, Green = Down.
                        // Western: Green = Up, Red = Down.
                        // Let's stick to standard/user preference. Project seems Chinese/Japanese context.
                        // Web default ECharts is Red=Up 
                        color0: '#22c55e', // Falling -> Green
                        borderColor: '#ef4444',
                        borderColor0: '#22c55e'
                    },
                    barWidth: '60%'
                }
            ]
        };
    }, [c, formatNumber, globalKline, t]);

    return (
        <div className="bg-surface-card border border-outline-variant/70 text-on-surface rounded-md3-xl p-6 h-full flex flex-col">
            <div className="flex justify-between items-start gap-4 mb-6">
                <div>
                    <h3 className="type-title-l text-on-surface flex items-center gap-2">
                        {t("page.prediction.pgai.title")}
                        <span className="bg-tertiary-container text-on-tertiary-container type-label-s px-1.5 py-0.5 rounded-md3-xs uppercase">beta</span>
                    </h3>
                    <p className="type-body-s text-on-surface-variant mt-1">{t("page.prediction.pgai.subtitle")}</p>
                </div>
                {hasData ? (
                    <div className="text-right">
                        <div className={`type-display-s tabular-nums ${changePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {formatNumber(currentIndex)}
                        </div>
                        <div className={`type-label-l flex items-center justify-end gap-1 ${changePct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            <span>{changePct >= 0 ? '▲' : '▼'}</span>
                            {Math.abs(changePct).toFixed(2)}%
                        </div>
                    </div>
                ) : (
                    <div className="type-display-s text-on-surface-variant">—</div>
                )}
            </div>

            <div className="flex-1 min-h-0">
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'svg' }}
                />
            </div>
        </div>
    );
}
