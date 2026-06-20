import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// ─────────────────────────────────────────────────────────────
// AI Speech Analysis — PRESENTATION DEMO
//
// Everything on this page renders from the static mock data below.
// There are NO network requests, and NO OpenAI / Whisper / librosa
// calls — the numbers are illustrative fixtures captured from a real
// run and frozen here so the page always renders instantly for demos.
// ─────────────────────────────────────────────────────────────

interface Metric {
  key: string;
  icon: string;
  title: string;
  score: number;        // 0–100
  label: string;        // e.g. "Low"
  sublabel: string;     // e.g. "Calm / Subdued"
  color: string;        // progress-bar accent
  detail: string[];     // two small detail lines
}

interface Breakdown {
  productivePct: number;
  distractingPct: number;
  neutralPct: number;
  idlePct: number;
}

interface PieSlice {
  label: string;
  pct: number;
  color: string;
  dash: string;
  offset: number;
}

interface Employee {
  name: string;
  role: string;
  email: string;
  productivityScore: number;
  activeLabel: string;
  idleLabel: string;
  breakdown: Breakdown;
  topApp: string;
}

@Component({
  selector: 'app-ai-speech-analysis',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ai-speech-analysis.html',
  styleUrls: ['./ai-speech-analysis.css'],
})
export class AiSpeechAnalysisComponent {
  // ── 1. Transcript + 2. Translation ────────────────────────
  detectedLanguage = 'ar';
  translationEngine = 'Whisper medium';

  transcriptAr = signal<string>(
    'يا شباب ازايكو، عايزكو تصبوا دوصا تبلغوا دوف هيتقولة ان مدة الـ communication skills and report writing هي اللي ' +
      'هتلاقوا تتوريال في جدولهم شغالة من يوم السبت عادي خالص دي المكررة الوحيدة لتتوريال السفيات بقى system موجودة على الـ ' +
      'theoretical and practical من اول web شغالة ان مدة الـ is شغالة بالنسبة لسنة اولى عايزكو بقى تبلغوا طلبة 3 و 4 ' +
      'اسبوع برد تمام',
  );

  translationEn = signal<string>(
    'Guys, how are you? Look, I want you to notice that the communication skills and report writing material on the ' +
      'system, you will find a tutorial on their website, is already working since Saturday. This is the only tutorial ' +
      'that is still working for the first year. I want you to notice that the web material is working theoretically and ' +
      'practically since the first week. Bye!',
  );

  // ── 3. Acoustic conclusion ─────────────────────────────────
  conclusion = {
    emotion: 'Excited',
    confidence: 'Low',
    emoji: '🤩',
    description:
      'The speaker sounds excited and engaged. High pitch (175 Hz), wide intonation range (81 Hz spread), ' +
      'and fast pace (131 WPM) with a stable voice indicate high positive energy. (with hints of Calm)',
    basis: 'pitch 38% · pace 44% · volume 45% · trembling 53% · hesitations 62%',
  };

  // ── 4. Acoustic metric cards ────────────────────────────────
  audioDuration = '27.4s';

  metrics = signal<Metric[]>([
    {
      key: 'pitch',
      icon: '😟',
      title: 'Pitch / Tone',
      score: 37,
      label: 'Low',
      sublabel: 'Calm / Subdued',
      color: '#3b82f6',
      detail: ['Median: 174.7 Hz', 'Range: 144.4–225.2 Hz'],
    },
    {
      key: 'pace',
      icon: '😐',
      title: 'Speaking Pace',
      score: 44,
      label: 'Moderate',
      sublabel: 'Neutral',
      color: '#10b981',
      detail: ['131 WPM', 'Source: WPM'],
    },
    {
      key: 'volume',
      icon: '😐',
      title: 'Volume / Energy',
      score: 45,
      label: 'Moderate',
      sublabel: 'Neutral',
      color: '#10b981',
      detail: ['Dyn. range: 2.38×', 'CV: 0.737'],
    },
    {
      key: 'trembling',
      icon: '😰',
      title: 'Voice Trembling',
      score: 53,
      label: 'Moderate',
      sublabel: 'Nervous / Fearful',
      color: '#f59e0b',
      detail: ['Jitter: 2.141% · Shimmer: 11.224%', 'Jitter score 36% · Shimmer 75%'],
    },
    {
      key: 'hesitations',
      icon: '😧',
      title: 'Hesitations',
      score: 61,
      label: 'Occasional',
      sublabel: 'Uncertain / Nervous',
      color: '#f59e0b',
      detail: ['7 gaps · 3.3s (11.9%)', 'Filler words: 0'],
    },
    {
      key: 'voiced',
      icon: '😊',
      title: 'Voiced Ratio',
      score: 66,
      label: 'High',
      sublabel: 'Engaged / continuous',
      color: '#f59e0b',
      detail: ['66.5% of audio is speech', '(33.5% silence / unvoiced)'],
    },
    {
      key: 'spectral',
      icon: '😔',
      title: 'Spectral Brightness',
      score: 0,
      label: 'Dull / Flat',
      sublabel: 'Monotone / depressed',
      color: '#6b7280',
      detail: ['HF/LF ratio: 0.077', 'Higher = more tense / brighter voice'],
    },
  ]);

  // ── 5. Pitch contour ────────────────────────────────────────
  pitchContour = {
    type: 'Variable',
    note: 'dynamic / emotional speech',
    range: '144.4–225.2 Hz',
    spread: '80.9 Hz',
    jitter: '2.141%',
    shimmer: '11.224%',
  };

  // ── 6. Productivity analytics (static) ──────────────────────
  readonly catColors: Record<string, string> = {
    productive: '#10b981',
    distracting: '#ef4444',
    neutral: '#8b5cf6',
    idle: '#f59e0b',
  };

  teamBreakdown: Breakdown = {
    productivePct: 58,
    distractingPct: 14,
    neutralPct: 19,
    idlePct: 9,
  };

  averageProductivity = 71;

  // ── 7. Team overview (static) ───────────────────────────────
  employees = signal<Employee[]>([
    {
      name: 'Maitha Khaled',
      role: 'owner',
      email: 'maitha@rem.io',
      productivityScore: 88,
      activeLabel: '6h 12m',
      idleLabel: '38m',
      breakdown: { productivePct: 72, distractingPct: 8, neutralPct: 14, idlePct: 6 },
      topApp: 'VS Code',
    },
    {
      name: 'Omar Hassan',
      role: 'admin',
      email: 'omar@rem.io',
      productivityScore: 76,
      activeLabel: '5h 40m',
      idleLabel: '52m',
      breakdown: { productivePct: 61, distractingPct: 12, neutralPct: 19, idlePct: 8 },
      topApp: 'Chrome',
    },
    {
      name: 'Sara Ahmed',
      role: 'member',
      email: 'sara@rem.io',
      productivityScore: 64,
      activeLabel: '5h 02m',
      idleLabel: '1h 08m',
      breakdown: { productivePct: 52, distractingPct: 18, neutralPct: 21, idlePct: 9 },
      topApp: 'Figma',
    },
    {
      name: 'Khaled Nabil',
      role: 'member',
      email: 'khaled@rem.io',
      productivityScore: 41,
      activeLabel: '3h 55m',
      idleLabel: '2h 05m',
      breakdown: { productivePct: 34, distractingPct: 29, neutralPct: 22, idlePct: 15 },
      topApp: 'Slack',
    },
  ]);

  // ── Chart helpers (SVG donut) ───────────────────────────────
  buildPie(b: Breakdown): PieSlice[] {
    const slices = [
      { label: 'Productive', pct: b.productivePct, color: this.catColors['productive'] },
      { label: 'Neutral', pct: b.neutralPct, color: this.catColors['neutral'] },
      { label: 'Distracting', pct: b.distractingPct, color: this.catColors['distracting'] },
      { label: 'Idle', pct: b.idlePct, color: this.catColors['idle'] },
    ].filter((s) => s.pct > 0);

    const C = 2 * Math.PI * 16;
    let acc = 0;
    return slices.map((s) => {
      const len = (s.pct / 100) * C;
      const slice: PieSlice = { ...s, dash: `${len} ${C - len}`, offset: -acc };
      acc += len;
      return slice;
    });
  }

  teamPie = computed<PieSlice[]>(() => this.buildPie(this.teamBreakdown));

  maxScore = computed(() =>
    Math.max(...this.employees().map((e) => e.productivityScore), 1),
  );

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  scoreClass(score: number): string {
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }
}
