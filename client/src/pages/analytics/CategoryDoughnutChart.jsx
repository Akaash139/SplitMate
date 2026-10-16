import { useState, useMemo } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import {
  calculateDonutSlices,
  formatINR,
  CATEGORY_ICONS,
  CATEGORY_COLORS
} from "../../services/analyticsUtils";
import { Badge } from "../../components/common/Badge";

/**
 * Responsive, interactive SVG Doughnut Chart for Category Spending Breakdown
 */
export function CategoryDoughnutChart({
  categoryBreakdown = [],
  totalSpent = 0,
  expenseCount = 0,
  currency = "INR"
}) {
  const [hoveredCategory, setHoveredCategory] = useState(null);

  const slices = useMemo(() => {
    return calculateDonutSlices(categoryBreakdown, totalSpent);
  }, [categoryBreakdown, totalSpent]);

  const activeHoverData = useMemo(() => {
    if (!hoveredCategory) return null;
    return (
      categoryBreakdown.find((c) => c.category === hoveredCategory) ||
      slices.find((s) => s.category === hoveredCategory)
    );
  }, [hoveredCategory, categoryBreakdown, slices]);

  const hasData = totalSpent > 0 && slices.length > 0;

  return (
    <div className="category-chart-card">
      <div className="category-chart-layout">
        {/* SVG Donut Visual */}
        <div className="donut-visual-container">
          <svg
            viewBox="0 0 300 300"
            className="donut-svg"
            role="img"
            aria-label={`Category spending breakdown doughnut chart. Total spent: ${currency} ${formatINR(totalSpent)}`}
          >
            <desc>
              {hasData
                ? `Breakdown of ${slices.length} categories totaling ${currency} ${formatINR(totalSpent)}`
                : "No expenses recorded for this period."}
            </desc>

            {!hasData ? (
              // Empty state circle
              <g className="empty-donut-group">
                <circle
                  cx="150"
                  cy="150"
                  r="100"
                  fill="none"
                  stroke="var(--charcoal-200)"
                  strokeWidth="24"
                  strokeDasharray="6 6"
                />
                <circle cx="150" cy="150" r="76" fill="var(--bg-surface)" />
                <text
                  x="150"
                  y="145"
                  textAnchor="middle"
                  className="donut-center-empty-icon"
                  fill="var(--charcoal-400)"
                >
                  0
                </text>
                <text
                  x="150"
                  y="168"
                  textAnchor="middle"
                  className="donut-center-sub"
                  fill="var(--charcoal-500)"
                  fontSize="12"
                >
                  No Spending
                </text>
              </g>
            ) : (
              <g className="donut-slices-group">
                {slices.map((slice) => {
                  const isHovered = hoveredCategory === slice.category;
                  return (
                    <path
                      key={slice.category}
                      d={slice.pathD}
                      fill={slice.color}
                      className={`donut-slice ${isHovered ? "is-hovered" : ""}`}
                      onMouseEnter={() => setHoveredCategory(slice.category)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      onFocus={() => setHoveredCategory(slice.category)}
                      onBlur={() => setHoveredCategory(null)}
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={`${slice.category}: ${currency} ${formatINR(slice.total)} (${slice.percentage}%)`}
                      style={{
                        transformOrigin: "150px 150px",
                        cursor: "pointer",
                        transition: "all 0.15s ease-out",
                        opacity: hoveredCategory && !isHovered ? 0.45 : 1,
                        filter: isHovered ? "drop-shadow(0 4px 8px rgba(0,0,0,0.2))" : "none"
                      }}
                    />
                  );
                })}

                {/* Donut Hole Background */}
                <circle cx="150" cy="150" r="76" fill="var(--bg-surface)" />

                {/* Center Content: Dynamic switch on slice hover */}
                {activeHoverData ? (
                  <g className="donut-center-text animate-fade-in">
                    <text
                      x="150"
                      y="132"
                      textAnchor="middle"
                      className="donut-center-label"
                      fill="var(--charcoal-600)"
                      fontSize="12"
                      fontWeight="600"
                    >
                      {activeHoverData.category}
                    </text>
                    <text
                      x="150"
                      y="156"
                      textAnchor="middle"
                      className="donut-center-amount"
                      fill="var(--charcoal-900)"
                      fontSize="18"
                      fontWeight="700"
                    >
                      ₹{formatINR(activeHoverData.total)}
                    </text>
                    <text
                      x="150"
                      y="176"
                      textAnchor="middle"
                      className="donut-center-sub"
                      fill={CATEGORY_COLORS[activeHoverData.category] || "var(--teal-600)"}
                      fontSize="12.5"
                      fontWeight="600"
                    >
                      {activeHoverData.percentage || 0}% of Total
                    </text>
                  </g>
                ) : (
                  <g className="donut-center-text">
                    <text
                      x="150"
                      y="132"
                      textAnchor="middle"
                      className="donut-center-label"
                      fill="var(--charcoal-500)"
                      fontSize="12"
                      fontWeight="500"
                    >
                      Total Spending
                    </text>
                    <text
                      x="150"
                      y="156"
                      textAnchor="middle"
                      className="donut-center-amount"
                      fill="var(--charcoal-900)"
                      fontSize="19"
                      fontWeight="700"
                    >
                      ₹{formatINR(totalSpent)}
                    </text>
                    <text
                      x="150"
                      y="176"
                      textAnchor="middle"
                      className="donut-center-sub"
                      fill="var(--charcoal-500)"
                      fontSize="12"
                    >
                      {expenseCount} {expenseCount === 1 ? "expense" : "expenses"}
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Itemized Legend & Breakdown Table */}
        <div className="donut-legend-container">
          {!hasData ? (
            <div className="donut-empty-legend">
              <PieChartIcon size={24} className="empty-legend-icon" />
              <p className="empty-legend-title">No category data to display</p>
              <p className="empty-legend-desc">
                When expenses are added to this group, their category breakdown and percentage shares will appear here.
              </p>
            </div>
          ) : (
            <div className="donut-legend-list" role="list">
              {slices.map((item) => {
                const IconComponent = CATEGORY_ICONS[item.category] || PieChartIcon;
                const isHovered = hoveredCategory === item.category;

                return (
                  <div
                    key={item.category}
                    className={`donut-legend-item ${isHovered ? "is-active" : ""}`}
                    onMouseEnter={() => setHoveredCategory(item.category)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    role="listitem"
                  >
                    <div className="legend-item-left">
                      <div
                        className="legend-icon-badge"
                        style={{
                          backgroundColor: `${item.color}18`,
                          color: item.color
                        }}
                      >
                        <IconComponent size={16} />
                      </div>
                      <div className="legend-text-meta">
                        <span className="legend-cat-name">{item.category}</span>
                        <span className="legend-count-sub">
                          {item.count} {item.count === 1 ? "transaction" : "transactions"}
                          {item.userShare > 0 ? ` • Your share: ₹${formatINR(item.userShare)}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="legend-item-right">
                      <span className="legend-amount-val">₹{formatINR(item.total)}</span>
                      <Badge
                        variant="neutral"
                        size="sm"
                        className="legend-pct-badge"
                        style={{
                          backgroundColor: `${item.color}15`,
                          color: item.color,
                          fontWeight: 600
                        }}
                      >
                        {item.percentage}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
