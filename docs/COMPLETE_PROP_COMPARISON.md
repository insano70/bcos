# Complete Prop Comparison: Individual vs Batch

## AnalyticsChart → ChartRenderer (Batch OFF - WORKING)

**From analytics-chart.tsx lines 536-595:**

```typescript
<ChartRenderer
  chartType={chartType}
  data={data.chartData}
  rawData={data.rawData}
  columns={data.columns}
  formattedData={data.formattedData}
  chartRef={chartRef}
  width={width}                    // ← Has width
  height={height}                  // ← Has height
  frequency={props.frequency}      // ← Has frequency
  stackingMode={stackingMode}
  colorPalette={colorPalette}
  dualAxisConfig={dualAxisConfig}  // ← HAS dualAxisConfig!
  title={title}
  measure={measure}
  responsive={responsive}
  minHeight={minHeight}
  maxHeight={maxHeight}
  aspectRatio={aspectRatio}
/>
```

## BatchChartRenderer → ChartRenderer (Batch ON - BROKEN)

**From batch-chart-renderer.tsx lines 210-229:**

```typescript
<ChartRenderer
  chartType={chartData.metadata.chartType}
  data={chartData.chartData}
  rawData={chartData.rawData}
  {...(chartData.columns && { columns: chartData.columns })}
  {...(chartData.formattedData && { formattedData: chartData.formattedData })}
  title={chartDefinition.chart_name}
  {...(chartData.metadata.measure && { measure: chartData.metadata.measure })}
  {...(chartData.metadata.frequency && { frequency: chartData.metadata.frequency })}
  {...(chartData.metadata.groupBy && { groupBy: chartData.metadata.groupBy })}
  {...(colorPalette && { colorPalette })}
  {...(stackingMode && { stackingMode })}
  responsive={responsive}
  minHeight={minHeight}
  maxHeight={maxHeight}
  // ❌ MISSING: dualAxisConfig
  // ❌ MISSING: width
  // ❌ MISSING: height
  // ❌ MISSING: aspectRatio
  // ❌ MISSING: chartRef
/>
```

## CRITICAL MISSING PROPS

### 1. dualAxisConfig ❌ 🔴 CRITICAL
**Why dual-axis charts don't render**

Individual: `dualAxisConfig={dualAxisConfig}` from props
Batch: **MISSING**

### 2. width/height ❌
**Why charts overflow containers**

Individual: `width={width} height={height}` (800x400 default)
Batch: **MISSING** - only has responsive/minHeight/maxHeight

### 3. aspectRatio ❌
**Affects chart proportions**

Individual: `aspectRatio={aspectRatio}`
Batch: **MISSING**

### 4. chartRef ❌
**Needed for export functionality**

Individual: `chartRef={chartRef}`
Batch: **MISSING**

## ROOT CAUSE

BatchChartRenderer doesn't have access to:
- dualAxisConfig (needs to be in chartDefinition.chart_config or metadata)
- width/height (needs to calculate or pass through)
- aspectRatio (needs from props or config)


