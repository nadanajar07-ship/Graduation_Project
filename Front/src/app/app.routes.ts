import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { adminGuard } from './admin.guard';
import { onboardingGuard, onboardingDeactivateGuard } from './onboarding.guard';
import { CheckEmailComponent } from './check-email-component/check-email-component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landingComponent/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./loginComponent/login').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./sign-upComponent/sign-up').then((m) => m.SignUpComponent),
  },
  { path: 'confirm-email', component: CheckEmailComponent },
  { path: 'reset-password', component: CheckEmailComponent },
  { path: 'check-email', component: CheckEmailComponent },
  {
    path: 'forget-password',
    loadComponent: () =>
      import('./forgot-passwordComponent/forgot-password').then((m) => m.ForgetPasswordComponent),
  },
  {
    path: 'onboarding',
    canActivate: [onboardingGuard],
    canDeactivate: [onboardingDeactivateGuard],
    loadComponent: () =>
      import('./onboardingComponent/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'accept-invite',
    loadComponent: () =>
      import('./acceptInviteComponent/accept-invite').then((m) => m.AcceptInviteComponent),
  },
  {
    // Backend invitation emails link to /invite/accept?token=...
    path: 'invite',
    children: [
      {
        path: 'accept',
        loadComponent: () =>
          import('./acceptInviteComponent/accept-invite').then((m) => m.AcceptInviteComponent),
      },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboardLayoutComponent/dashboard-layout').then((m) => m.DashboardLayoutComponent),
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () =>
          import('./dashboardHomeComponent/dashboard-home.component').then(
            (m) => m.DashboardHomeComponent,
          ),
      },
      {
        path: 'recent',
        loadComponent: () => import('./recentComponent/recent').then((m) => m.RecentComponent),
      },
      {
        path: 'starred',
        loadComponent: () => import('./starredComponent/starred').then((m) => m.StarredComponent),
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./employee-listComponent/employee-list').then((m) => m.EmployeeListComponent),
      },
      {
        path: 'employees/:id',
        loadComponent: () =>
          import('./employee-detailComponent/employee-detail').then(
            (m) => m.EmployeeDetailComponent,
          ),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./task-listComponent/task-list').then((m) => m.TaskListComponent),
      },
      {
        path: 'tasks/:id',
        loadComponent: () =>
          import('./task-detailComponent/task-detail').then((m) => m.TaskDetailComponent),
      },
      {
        path: 'reports',
        loadComponent: () => import('./reportsComponent/reports').then((m) => m.ReportsComponent),
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./messagesComponent/messages').then((m) => m.MessagesComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notificationsComponent/notifications').then((m) => m.NotificationsComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./profileComponent/profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'account',
        loadComponent: () => import('./accountComponent/account').then((m) => m.AccountComponent),
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./securityComponent/security').then((m) => m.SecurityComponent),
      },
      {
        path: 'org-settings',
        loadComponent: () =>
          import('./orgSettingsComponent/org-settings').then((m) => m.OrgSettingsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settingsComponent/settings').then((m) => m.SettingsComponent),
      },
      {
        path: 'faq',
        loadComponent: () => import('./faqComponent/faq').then((m) => m.FaqComponent),
      },
      {
        path: 'spaces',
        loadComponent: () =>
          import('./spacesListComponent/spaces-list').then((m) => m.SpacesListComponent),
      },
      {
        path: 'spaces/:id',
        loadComponent: () =>
          import('./spaceDetailComponent/space-detail').then((m) => m.SpaceDetailComponent),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./calendarComponent/calendar').then((m) => m.CalendarComponent),
      },
      {
        path: 'teams',
        loadComponent: () =>
          import('./teamsComponent/teams').then((m) => m.TeamsComponent),
      },
      {
        path: 'meetings',
        loadComponent: () =>
          import('./meetingsComponent/meetings').then((m) => m.MeetingsComponent),
      },
      {
        path: 'webhooks',
        loadComponent: () =>
          import('./webhooksComponent/webhooks').then((m) => m.WebhooksComponent),
      },
      {
        path: 'webhook-deliveries',
        loadComponent: () =>
          import('./webhookDeliveriesComponent/webhook-deliveries').then(
            (m) => m.WebhookDeliveriesComponent,
          ),
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./auditLogsComponent/audit-logs').then((m) => m.AuditLogsComponent),
      },
      {
        path: 'notification-preferences',
        loadComponent: () =>
          import('./notifPrefsComponent/notif-prefs').then((m) => m.NotifPrefsComponent),
      },
      {
        path: 'reminders',
        loadComponent: () =>
          import('./remindersComponent/reminders').then((m) => m.RemindersComponent),
      },
      {
        path: 'mentions',
        loadComponent: () =>
          import('./mentionsComponent/mentions').then((m) => m.MentionsComponent),
      },
      {
        path: 'saved',
        loadComponent: () =>
          import('./savedMessagesComponent/saved-messages').then((m) => m.SavedMessagesComponent),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./projectsComponent/projects').then((m) => m.ProjectsComponent),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./activityComponent/activity').then((m) => m.ActivityComponent),
      },
      {
        path: 'ai-analytics',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./aiAnalyticsComponent/ai-analytics').then((m) => m.AiAnalyticsComponent),
      },
      {
        path: 'ai-speech-analysis',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./aiSpeechAnalysisComponent/ai-speech-analysis').then(
            (m) => m.AiSpeechAnalysisComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./notFoundComponent/not-found').then((m) => m.NotFoundComponent),
  },
];
