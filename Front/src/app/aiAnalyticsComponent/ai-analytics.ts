import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';

// ── Types mirror the BE payload from
//    GET /work-session/analytics/workforce ──────────────────────
interface Breakdown {
  productivePct: number;
  distractingPct: number;
  idlePct: number;
  neutralPct: number;
}
interface AppUsage {
  name: string;
  seconds: number;
  category: 'productive' | 'distracting' | 'neutral';
}
interface EmployeeAnalytics {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  activeSeconds: number;
  idleSeconds: number;
  pausedSeconds: number;
  trackedSeconds: number;
  sessions: number;
  screenshots: number;
  breakdown: Breakdown;
  productivityScore: number;
  topApplications: AppUsage[];
  hasData: boolean;
}
interface InsightRef {
  userId: string;
  name: string;
  image: string | null;
  productivityScore: number;
}
interface WorkforceAnalytics {
  range: { from: string | null; to: string | null };
  team: {
    employeeCount: number;
    trackedEmployeeCount: number;
    totalActiveSeconds: number;
    totalIdleSeconds: number;
    totalPausedSeconds: number;
    totalTrackedSeconds: number;
    breakdown: Breakdown;
    averageProductivity: number;
  };
  employees: EmployeeAnalytics[];
  topApplications: AppUsage[];
  insights: {
    topPerformer: InsightRef | null;
    needsAttention: InsightRef | null;
    averageTeamProductivity: number;
    mostUsedApplication: { name: string; seconds: number } | null;
  };
  meta: {
    hasAppTelemetry: boolean;
    generatedAt: string;
    dataPoints: { sessions: number; activityEvents: number; members: number };
  };
}

// A single slice of a pie chart, pre-computed for the SVG renderer.
interface PieSlice {
  label: string;
  pct: number;
  color: string;
  dash: string;   // stroke-dasharray
  offset: number; // stroke-dashoffset
}

@Component({
  selector: 'app-ai-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ai-analytics.html',
  styleUrls: ['./ai-analytics.css'],
})
export class AiAnalyticsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  data = signal<WorkforceAnalytics | null>(null);
  loading = signal(true);
  error = signal<string>('');

  // Category → colour map (matches the design system tokens).
  readonly catColors: Record<string, string> = {
    productive: '#10b981',  // emerald
    distracting: '#ef4444', // red
    idle: '#f59e0b',        // amber
    neutral: '#8b5cf6',     // violet
  };

  private get orgId(): string {
    return this.auth.currentUser()?.orgId ?? '';
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    if (!this.orgId) {
      this.error.set('No organization selected.');
      this.loading.set(false);
      return;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: WorkforceAnalytics }>(
          `${BASE}/work-session/analytics/workforce?orgId=${this.orgId}`,
        ),
      );
      this.data.set(res?.data ?? null);
    } catch (err: any) {
      if (err?.status === 403) {
        this.error.set('Only organization owners and admins can view AI Analytics.');
      } else {
        this.error.set(err?.error?.message || 'Failed to load analytics.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ── Derived view-models ────────────────────────────────────
  // Employees that actually have tracked time (drives charts/table).
  trackedEmployees = computed(() =>
    (this.data()?.employees ?? []).filter((e) => e.hasData),
  );

  hasTelemetry = computed(() => this.data()?.meta?.hasAppTelemetry ?? false);

  // Build the four-slice pie for a breakdown.
  buildPie(b: Breakdown): PieSlice[] {
    const slices = [
      { label: 'Productive', pct: b.productivePct, color: this.catColors['productive'] },
      { label: 'Neutral', pct: b.neutralPct, color: this.catColors['neutral'] },
      { label: 'Distracting', pct: b.distractingPct, color: this.catColors['distracting'] },
      { label: 'Idle', pct: b.idlePct, color: this.catColors['idle'] },
    ].filter((s) => s.pct > 0);

    const C = 2 * Math.PI * 16; // r = 16
    let acc = 0;
    return slices.map((s) => {
      const len = (s.pct / 100) * C;
      const slice: PieSlice = {
        ...s,
        dash: `${len} ${C - len}`,
        offset: -acc,
      };
      acc += len;
      return slice;
    });
  }

  // Convenience: team-level pie.
  teamPie = computed<PieSlice[]>(() => {
    const b = this.data()?.team?.breakdown;
    return b ? this.buildPie(b) : [];
  });

  // ── Formatting helpers ─────────────────────────────────────
  formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${seconds}s`;
  }

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  scoreClass(score: number): string {
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  // For the comparison bars — find the max so bars scale nicely.
  maxScore = computed(() => {
    const list = this.trackedEmployees();
    return list.length ? Math.max(...list.map((e) => e.productivityScore), 1) : 1;
  });

  refresh() {
    this.load();
  }
}
