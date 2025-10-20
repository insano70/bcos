'use client';

import type { ChartData } from 'chart.js';
import { ArcElement, Chart, DoughnutController, TimeScale, Tooltip } from 'chart.js';
import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import 'chartjs-adapter-moment';

Chart.register(DoughnutController, ArcElement, TimeScale, Tooltip);
Chart.overrides.doughnut.cutout = '80%';

interface DoughnutProps {
  data: ChartData;
  width: number;
  height: number;
}

const DoughnutChart = forwardRef<HTMLCanvasElement, DoughnutProps>(function DoughnutChart(
  { data, width, height },
  ref
) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const legend = useRef<HTMLUListElement>(null);

  // Expose canvas element to parent via ref
  useImperativeHandle(ref, () => canvas.current!, []);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { tooltipTitleColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  useEffect(() => {
    const ctx = canvas.current;
    if (!ctx) return;

    const newChart = new Chart(ctx, {
      type: 'doughnut',
      data: data,
      options: {
        layout: {
          padding: 24,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            titleColor: darkMode ? tooltipTitleColor.dark : tooltipTitleColor.light,
            bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
            borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
          },
        },
        interaction: {
          intersect: false,
          mode: 'nearest',
        },
        animation: {
          duration: 500,
        },
        maintainAspectRatio: false,
        responsive: true,
        resizeDelay: 200,
      },
      plugins: [
        {
          id: 'htmlLegend',
          afterUpdate(c, _args, _options) {
            const ul = legend.current;
            if (!ul) return;
            // Remove old legend items
            while (ul.firstChild) {
              ul.firstChild.remove();
            }
            // Reuse the built-in legendItems generator
            const items = c.options.plugins?.legend?.labels?.generateLabels?.(c);
            items?.forEach((item) => {
              const li = document.createElement('li');
              li.style.margin = '4px';
              // Button element
              const button = document.createElement('button');
              button.classList.add(
                'btn-xs',
                'bg-white',
                'dark:bg-gray-700',
                'text-gray-500',
                'dark:text-gray-400',
                'shadow-sm',
                'shadow-black/[0.08]',
                'rounded-full'
              );
              button.style.opacity = item.hidden ? '.3' : '';
              button.onclick = () => {
                c.toggleDataVisibility(item.index!);
                c.update();
              };
              // Color box
              const box = document.createElement('span');
              box.style.display = 'block';
              box.style.width = '8px';
              box.style.height = '8px';
              box.style.backgroundColor = item.fillStyle as string;
              box.style.borderRadius = '4px';
              box.style.marginRight = '4px';
              box.style.pointerEvents = 'none';
              // Label
              const label = document.createElement('span');
              label.style.display = 'flex';
              label.style.alignItems = 'center';
              const labelText = document.createTextNode(item.text);
              label.appendChild(labelText);
              li.appendChild(button);
              button.appendChild(box);
              button.appendChild(label);
              ul.appendChild(li);
            });
          },
        },
      ],
    });
    setChart(newChart);
    return () => newChart.destroy();
  }, []);

  useEffect(() => {
    if (!chart || !canvas.current) return;

    if (darkMode) {
      chart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.dark;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
    } else {
      chart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.light;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
    }
    chart.update('none');
  }, [theme]);

  // Handle dimension changes for responsive behavior
  useEffect(() => {
    if (!chart || !canvas.current) return;

    const canvasElement = canvas.current;

    // Update canvas dimensions
    canvasElement.width = width;
    canvasElement.height = height;

    // Resize the chart
    chart.resize();
  }, [chart, width, height]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <canvas
          ref={canvas}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            maxHeight: '100%',
          }}
        />
      </div>
      <div className="px-3 pt-2 pb-4 flex-shrink-0 overflow-hidden">
        <ul
          ref={legend}
          className="flex flex-wrap justify-center gap-x-2 gap-y-1"
          style={{
            maxHeight: '80px', // Limit legend height
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        ></ul>
      </div>
    </div>
  );
});

export default DoughnutChart;
