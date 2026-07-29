"use client";

// The member profile's progression chart.
//
// ONE SERIES AT A TIME, by design and not by omission. The metrics here are on
// incomparable scales — 30.000 points beside a K/D of 2,99 — and plotting them
// together would need a second y-axis, which is the single worst thing a chart can
// do: the crossing point of two lines becomes an artefact of the two scales rather
// than a fact about the data. A toggle keeps one axis and, as a bonus, means the
// chart needs no legend: the button that is pressed names the line.
//
// Area for cumulative counters (points, kills, matches), line for K/D. A filled
// area reads as accumulated volume, which is true of a career total and false of a
// ratio that goes up and down.

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type { ProgressionPoint } from "../lib/progression";
import { formatKd, formatNumber, formatPoints } from "../lib/format";

type MetricKey = "points" | "kills" | "kd" | "matches";

const METRICS: {
  key: MetricKey;
  label: string;
  /** Cumulative counters get a filled area; a ratio gets a bare line. */
  cumulative: boolean;
  format: (value: number) => string;
  /** What the tooltip row says, since the axis label is the short form. */
  tooltipLabel: string;
}[] = [
  {
    key: "points",
    label: "Pontos",
    cumulative: true,
    format: formatPoints,
    tooltipLabel: "Pontos acumulados",
  },
  { key: "kills", label: "Kills", cumulative: true, format: formatNumber, tooltipLabel: "Kills" },
  { key: "kd", label: "K/D", cumulative: false, format: formatKd, tooltipLabel: "K/D" },
  {
    key: "matches",
    label: "Partidas",
    cumulative: true,
    format: formatNumber,
    tooltipLabel: "Partidas",
  },
];

const SAO_PAULO = "America/Sao_Paulo";

/**
 * Two tick formats, picked by how much time the series covers.
 *
 * A date-only tick is wrong for a short series, and not subtly: the collection
 * runs every 20 minutes, so a member read across two days produced an axis reading
 * "27/07 27/07 28/07 28/07 28/07 28/07 28/07" — seven ticks carrying two bits of
 * information. Below the threshold the time is what distinguishes the readings, so
 * the tick has to include it.
 */
const dayTick = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: SAO_PAULO,
});

const dayTimeTick = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: SAO_PAULO,
});

/** Above this span, the time of day stops being what tells readings apart. */
const SHORT_SPAN_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Narrowest y-window the K/D view may use, in K/D points. Half a point is wide
 * enough that a thousandths-scale wobble reads as the flat line it is.
 */
const RATIO_MIN_SPAN = 0.5;

const fullFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: SAO_PAULO,
});

interface MemberProgressionProps {
  series: ProgressionPoint[];
  className?: string;
}

export function MemberProgression({ series, className }: MemberProgressionProps) {
  const [metricKey, setMetricKey] = useState<MetricKey>("points");
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const data = series.map((point) => ({
    ...point,
    /** Milliseconds, so the x-axis is a real time scale and not equal spacing. */
    time: new Date(point.capturedAt).getTime(),
  }));

  const span = data.length > 1 ? data[data.length - 1].time - data[0].time : 0;
  const shortSpan = span > 0 && span < SHORT_SPAN_MS;
  const tick = shortSpan ? dayTimeTick : dayTick;

  /**
   * Y domain for the ratio view, and this is a correctness fix rather than a
   * cosmetic one.
   *
   * Career K/D is an average over hundreds of matches, so it moves in thousandths:
   * this member went from 0,8985 to 0,8955 across two days. Fitted tightly, that
   * turned into a cliff halfway down the plot — a chart claiming a collapse where
   * the number barely moved — and every axis tick rounded to the same "0,90".
   *
   * Forcing a minimum window of half a point makes small movement LOOK small,
   * which is the honest rendering, and gives the ticks room to differ.
   */
  const ratioDomain = (): [number, number] => {
    const values = data.map((point) => point[metricKey] as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const center = (min + max) / 2;
    const half = Math.max(RATIO_MIN_SPAN / 2, (max - min) * 0.75);
    return [Math.max(0, center - half), center + half];
  };

  const config = {
    [metricKey]: { label: metric.tooltipLabel, color: "var(--primary)" },
  } satisfies ChartConfig;

  const Chart = metric.cumulative ? AreaChart : LineChart;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Filters in one row above the chart. */}
      <div className="flex flex-wrap gap-1.5">
        {METRICS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="sm"
            variant={option.key === metricKey ? "default" : "secondary"}
            aria-pressed={option.key === metricKey}
            onClick={() => setMetricKey(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <Chart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Recessive grid: horizontal only, so it reads as a reference and not
              as part of the data. */}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />

          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => tick.format(value)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            // Wider gap for the longer label, so ticks thin out instead of
            // colliding on a narrow screen.
            minTickGap={shortSpan ? 72 : 32}
            className="text-muted-foreground text-xs"
          />
          <YAxis
            tickFormatter={metric.format}
            tickLine={false}
            axisLine={false}
            width={52}
            tickMargin={4}
            // Cumulative counters are magnitudes and belong on a zero baseline.
            // The ratio gets the padded window above instead of an auto fit.
            domain={metric.cumulative ? [0, "auto"] : ratioDomain()}
            className="text-muted-foreground text-xs"
          />

          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const time = payload?.[0]?.payload?.time as number | undefined;
                  return time ? fullFormatter.format(time) : "";
                }}
                // Name AND value: a custom formatter replaces the whole row, and
                // returning the bare number left the tooltip reading "437" with
                // nothing saying what 437 was.
                formatter={(value) => (
                  <>
                    <span className="text-muted-foreground">{metric.tooltipLabel}</span>
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {metric.format(Number(value))}
                    </span>
                  </>
                )}
              />
            }
          />

          {metric.cumulative ? (
            <Area
              dataKey={metricKey}
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              fill={`url(#fill-${metricKey})`}
              // 8px active dot: the hover target has to be bigger than the mark.
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
              dot={false}
            />
          ) : (
            <Line
              dataKey={metricKey}
              type="monotone"
              stroke="var(--primary)"
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
              dot={false}
            />
          )}
        </Chart>
      </ChartContainer>
    </div>
  );
}
