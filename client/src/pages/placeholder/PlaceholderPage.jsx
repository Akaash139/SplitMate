import { Construction } from "lucide-react";
import { Card, CardContent } from "../../components/common/Card";
import { Badge } from "../../components/common/Badge";

export function PlaceholderPage({ title, description, milestone }) {
  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-welcome-header">
        <div>
          <Badge variant="mint" size="sm" className="mb-2">
            {milestone || "UPCOMING MODULE"}
          </Badge>
          <h1 className="welcome-title">{title}</h1>
          <p className="welcome-subtitle">{description}</p>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="empty-state-card">
            <div className="empty-state-icon-wrap">
              <Construction size={28} />
            </div>
            <h3 className="empty-state-title">{title} Module</h3>
            <p className="empty-state-desc">
              This module will be connected during its scheduled development milestone.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
