import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SpaceService, Space } from '../services/space.service';
import { AuthService } from '../services/auth.service';
import { RoleService } from '../services/role.service';
import { CreateSpaceComponent } from '../createSpaceComponent/create-space.component';

interface NavItem { label: string; route: string; icon: string; admin?: boolean; }
interface NavGroup { title: string; items: NavItem[]; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLinkActive, FormsModule, CreateSpaceComponent],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css'],
})
export class SidebarComponent implements OnInit {
  private spaceService = inject(SpaceService);
  private auth = inject(AuthService);
  private roleService = inject(RoleService);

  collapsed = signal(false);
  toggleSidebar() { this.collapsed.update(v => !v); }

  searchQuery = signal('');
  searchOpen  = signal(false);
  toggleSearch() { this.searchOpen.update(v => !v); if (!this.searchOpen()) this.searchQuery.set(''); }

  hiddenItems   = signal<string[]>([]);
  customizeOpen = signal(false);
  toggleCustomize() { this.customizeOpen.update(v => !v); }
  toggleHide(label: string) {
    this.hiddenItems.update(h => h.includes(label) ? h.filter(x => x !== label) : [...h, label]);
  }
  isHidden(label: string) { return this.hiddenItems().includes(label); }

  createSpaceOpen = signal(false);
  openCreateSpace() { this.createSpaceOpen.set(true); }
  closeCreateSpace() { this.createSpaceOpen.set(false); }

  spaces  = this.spaceService.spaces;
  starred = this.spaceService.starred;
  recent  = this.spaceService.recent;

  forYouOpen  = signal(true);
  recentOpen  = signal(true);
  starredOpen = signal(true);
  spacesOpen  = signal(true);

  toggleForYou()  { this.forYouOpen.update(v => !v);  }
  toggleRecent()  { this.recentOpen.update(v => !v);  }
  toggleStarred() { this.starredOpen.update(v => !v); }
  toggleSpaces()  { this.spacesOpen.update(v => !v);  }

  // Check if user has an org (show org-settings only if they do)
  get hasOrg(): boolean { return !!this.auth.currentUser()?.orgId; }
  get isAdminOrOwner(): boolean { return this.roleService.isAdmin(); }

  // Icon path constants (Heroicons outline)
  private readonly ic = {
    dashboard:     'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
    employees:     'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    tasks:         'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z',
    reports:       'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
    messages:      'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
    notifications: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
    profile:       'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    spaces:        'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
    calendar:      'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
    teams:         'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
    projects:      'M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z',
    meetings:      'M15.75 10.5l4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z',
    mentions:      'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 1 0-2.636 6.364M16.5 12V8.25',
    saved:         'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z',
    webhooks:      'M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244',
    notifPrefs:    'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75',
    reminders:     'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    activity:      'M2.25 12h2.25l3-7.5 4.5 15 3-9 1.5 3h3.75',
    aiAnalytics:   'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z',
    auditLogs:     'M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM9 12.75l2.25 2.25L15 9.75',
    webhookDeliv:  'M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z',
    account:       'M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    security:      'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    org:           'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
  };

  // Org Settings icon path (kept for template reference)
  readonly orgSettingsIcon = this.ic.org;

  navGroups: NavGroup[] = [
    { title: 'Workspace', items: [
      { label: 'Dashboard',     route: '/dashboard/home',          icon: this.ic.dashboard },
      { label: 'Messages',      route: '/dashboard/messages',      icon: this.ic.messages },
      { label: 'Notifications', route: '/dashboard/notifications', icon: this.ic.notifications },
      { label: 'Calendar',      route: '/dashboard/calendar',      icon: this.ic.calendar },
    ]},
    { title: 'People', items: [
      { label: 'Employees',     route: '/dashboard/employees',     icon: this.ic.employees },
      { label: 'Teams',         route: '/dashboard/teams',         icon: this.ic.teams },
    ]},
    { title: 'Work Management', items: [
      { label: 'Projects',      route: '/dashboard/projects',      icon: this.ic.projects },
      { label: 'Spaces',        route: '/dashboard/spaces',        icon: this.ic.spaces },
      { label: 'Tasks',         route: '/dashboard/tasks',         icon: this.ic.tasks },
      { label: 'Reports',       route: '/dashboard/reports',       icon: this.ic.reports },
    ]},
    { title: 'Communication', items: [
      { label: 'Meetings',      route: '/dashboard/meetings',      icon: this.ic.meetings },
      { label: 'Mentions',      route: '/dashboard/mentions',      icon: this.ic.mentions },
      { label: 'Saved',         route: '/dashboard/saved',         icon: this.ic.saved },
    ]},
    { title: 'Administration', items: [
      { label: 'AI Analytics',         route: '/dashboard/ai-analytics',            icon: this.ic.aiAnalytics, admin: true },
      { label: 'AI Speech Analysis',   route: '/dashboard/ai-speech-analysis',      icon: this.ic.aiAnalytics, admin: true },
      { label: 'Activity',             route: '/dashboard/activity',                icon: this.ic.activity },
      { label: 'Audit Logs',           route: '/dashboard/audit-logs',              icon: this.ic.auditLogs,  admin: true },
      { label: 'Organization',         route: '/dashboard/org-settings',            icon: this.ic.org,        admin: true },
      { label: 'Webhooks',             route: '/dashboard/webhooks',                icon: this.ic.webhooks,   admin: true },
      { label: 'Webhook Deliveries',   route: '/dashboard/webhook-deliveries',      icon: this.ic.webhookDeliv, admin: true },
      { label: 'Notification Prefs',   route: '/dashboard/notification-preferences', icon: this.ic.notifPrefs },
      { label: 'Reminders',            route: '/dashboard/reminders',               icon: this.ic.reminders },
    ]},
    { title: 'Profile', items: [
      { label: 'Profile',       route: '/dashboard/profile',       icon: this.ic.profile },
      { label: 'Account',       route: '/dashboard/account',       icon: this.ic.account },
      { label: 'Security',      route: '/dashboard/security',      icon: this.ic.security },
    ]},
  ];

  // Flattened list (search + customize panel)
  get allNavItems(): NavItem[] {
    return this.navGroups.reduce<NavItem[]>((acc, g) => acc.concat(g.items), []);
  }

  // Groups with admin items filtered out for non-admins
  get visibleNavGroups(): NavGroup[] {
    const admin = this.isAdminOrOwner;
    return this.navGroups
      .map(g => ({ title: g.title, items: g.items.filter(i => !i.admin || admin) }))
      .filter(g => g.items.length > 0);
  }

  ngOnInit() {
    // Load role so isAdminOrOwner works
    if (this.hasOrg) {
      this.roleService.loadMyRole();
    }
  }

  get filteredNavItems(): NavItem[] {
    const q = this.searchQuery().toLowerCase();
    if (!q) return [];
    return this.allNavItems.filter(i => i.label.toLowerCase().includes(q));
  }

  get filteredSpaces(): Space[] {
    const q = this.searchQuery().toLowerCase();
    if (!q) return [];
    return this.spaces().filter(s => s.name.toLowerCase().includes(q));
  }

  toggleStar(id: string, e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.spaceService.toggleStar(id);
  }
}