import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, Calendar } from "lucide-react";
import {
  calculateBarChartMetrics,
  formatINR,
  getPeakSpendingMonth
} from "../../services/analyticsUtils";

/**
 * Responsive, accessible SVG Bar Chart for Monthly Spending Trends
 */
export function MonthlySpendingBarChart({
  monthlyTrends = [],
  filterYear = null,
  currency = "INR"
}) {
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null);

  const metrics = useMemo(() => {
    return calculateBarChartMetrics(monthlyTrends, 640, 240);
  }, [monthlyTrends]);

  const { bars, yTicks, maxY, margin, chartWidth, chartHeight } = metrics;

  // Compute peak month using helper
  const peakMonth = useMemo(() => {
    return getPeakSpendingMonth(monthlyTrends);
  }, [monthlyTrends]);

  const hasData = Boolean(peakMonth);

  return (
    <div className="monthly-chart-card">
      {/* Monthly Chart Meta Strip */}
      <div className="monthly-chart-meta-row">
        <div className="meta-left">
          <span className="meta-label">
            <Calendar size={14} className="inline-icon" />
            {filterYear ? `Year ${filterYear} Timeline` : "Historical Monthly Trend"}
          </span>
        </div>
        <div className="meta-right">
          {peakMonth && (
            <span className="peak-badge">
              <TrendingUp size={13} />
              Peak: <strong>{peakMonth.monthLabel || peakMonth.month}</strong> (₹{formatINR(peakMonth.total)})
            </span>
          )}
        </div>
      </div>

      {/* SVG Bar Visual */}
      <div className="bar-visual-container">
        {!hasData && (!monthlyTrends || monthlyTrends.length === 0) ? (
          <div className="bar-empty-state">
            <BarChart3 size={32} className="empty-bar-icon" />
            <p className="empty-bar-title">No monthly spending data</p>
            <p className="empty-bar-desc">
              Transactions recorded in this group will generate a monthly trend bar graph.
            </p>
          </div>
        ) : (
          <svg
            viewBox="0 0 640 240"
            className="bar-chart-svg"
            role="img"
            aria-label={`Monthly spending trends chart. Peak month: ${
              peakMonth ? `${peakMonth.monthLabel || peakMonth.month} with ${currency} ${formatINR(peakMonth.total)}` : "None"
            }`}
          >
            <desc>
              Monthly expenditure timeline across {monthlyTrends.length} months. Maximum vertical scale: {currency} {formatINR(maxY)}.
            </desc>

            <defs>
              <linearGradient id="violetBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.80" />
              </linearGradient>
              <linearGradient id="hoverBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A855F7" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Ticks */}
            {yTicks.map((tickVal) => {
              const yPos =
                margin.top + (chartHeight - (tickVal / maxY) * chartHeight);
              return (
                <g key={tickVal} className="grid-level-group">
                  <line
                    x1={margin.left}
                    y1={yPos}
                    x2={margin.left + chartWidth}
                    y2={yPos}
                    stroke="var(--charcoal-200)"
                    strokeDasharray={tickVal === 0 ? "none" : "3 3"}
                    strokeWidth={tickVal === 0 ? "1.5" : "1"}
                  />
                  <text
                    x={margin.left - 10}
                    y={yPos + 4}
                    textAnchor="end"
                    className="y-axis-label"
                    fill="var(--charcoal-500)"
                    fontSize="11"
                  >
                    ₹{tickVal >= 1000 ? `${(tickVal / 1000).toFixed(tickVal % 1000 === 0 ? 0 : 1)}k` : tickVal}
                  </text>
                </g>
              );
            })}

            {/* Render Bars */}
            {bars.map((bar, index) => {
              const isHovered = hoveredBarIndex === index;
              return (
                <g
                  key={bar.month}
                  className={`bar-group ${isHovered ? "is-hovered" : ""}`}
                  onMouseEnter={() => setHoveredBarIndex(index)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                  onFocus={() => setHoveredBarIndex(index)}
                  onBlur={() => setHoveredBarIndex(null)}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${bar.monthLabel}: ${currency} ${formatINR(bar.total)} across ${bar.count} transactions`}
                >
                  {/* Subtle bar background slot */}
                  <rect
                    x={bar.x - 2}
                    y={margin.top}
                    width={bar.width + 4}
                    height={chartHeight}
                    fill="transparent"
                    className="bar-hitbox"
                  />

                  {/* Active Bar */}
                  {bar.isZero ? (
                    <rect
                      x={bar.x}
                      y={margin.top + chartHeight - 2}
                      width={bar.width}
                      height={2}
                      rx={1}
                      fill="var(--charcoal-300)"
                      className="zero-bar-indicator"
                    />
                  ) : (
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={4}
                      fill={isHovered ? "url(#hoverBarGradient)" : "url(#violetBarGradient)"}
                      className="spending-bar"
                      style={{
                        transition: "all 0.15s ease",
                        filter: isHovered
                          ? "drop-shadow(0 4px 6px rgba(139, 92, 246, 0.35))"
                          : "none"
                      }}
                    />
                  )}

                  {/* X-Axis Month Label */}
                  <text
                    x={bar.x + bar.width / 2}
                    y={margin.top + chartHeight + 20}
                    textAnchor="middle"
                    className={`x-axis-label ${isHovered ? "is-active" : ""}`}
                    fill={isHovered ? "var(--charcoal-900)" : "var(--charcoal-500)"}
                    fontSize={bars.length > 8 ? "10.5" : "11.5"}
                    fontWeight={isHovered ? "700" : "500"}
                  >
                    {bar.monthLabel ? bar.monthLabel.split(" ")[0] : bar.month}
                  </text>
                </g>
              );
            })}

            {/* Tooltip bubble on hover */}
            {hoveredBarIndex !== null && bars[hoveredBarIndex] && (
              <g className="chart-tooltip-group animate-fade-in" pointerEvents="none">
                {(() => {
                  const bar = bars[hoveredBarIndex];
                  const tooltipWidth = 130;
                  const tooltipHeight = 48;
                  let tipX = bar.x + bar.width / 2 - tooltipWidth / 2;
                  // Clamp to chart bounds
                  if (tipX < margin.left) tipX = margin.left;
                  if (tipX + tooltipWidth > margin.left + chartWidth) {
                    tipX = margin.left + chartWidth - tooltipWidth;
                  }
                  const tipY = Math.max(8, bar.y - tooltipHeight - 8);

                  return (
                    <>
                      <rect
                        x={tipX}
                        y={tipY}
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx={6}
                        fill="#0F172A"
                        className="tooltip-box"
                        style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" }}
                      />
                      <text
                        x={tipX + tooltipWidth / 2}
                        y={tipY + 18}
                        textAnchor="middle"
                        fill="#E2E8F0"
                        fontSize="11"
                        fontWeight="500"
                      >
                        {bar.monthLabel}
                      </text>
                      <text
                        x={tipX + tooltipWidth / 2}
                        y={tipY + 36}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="13"
                        fontWeight="700"
                      >
                        ₹{formatINR(bar.total)}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
