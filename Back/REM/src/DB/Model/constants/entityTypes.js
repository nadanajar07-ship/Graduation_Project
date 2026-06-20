/**
 * Canonical entity types across the platform.
 * Add new types here and nowhere else.
 */
export const EntityType = Object.freeze({
  Task: "Task",
  Comment: "Comment",
  Project: "Project",
  Team: "Team",
  Sprint: "Sprint",
  Space: "Space",
  Organization: "Organization",
  // Realtime/chat + calendar entities that notifications deep-link to.
  // These are real registered model names so Notification.entityId's
  // refPath populate resolves correctly.
  Message: "Message",
  ChatRoom: "ChatRoom",
  Meeting: "Meeting",
  Reminder: "Reminder",
  Invitation: "Invitation",
});

// Subset allowed in Notification.entityType.
// IMPORTANT: every notification type emitted in notification.event.js must
// have its entityType listed here, otherwise createNotification throws a
// (swallowed) ValidationError and the notification is silently dropped.
export const NotificationEntityTypes = Object.freeze({
  Task: EntityType.Task,
  Comment: EntityType.Comment,
  Project: EntityType.Project,
  Team: EntityType.Team,
  Sprint: EntityType.Sprint,
  Message: EntityType.Message,
  ChatRoom: EntityType.ChatRoom,
  Meeting: EntityType.Meeting,
  Reminder: EntityType.Reminder,
  Organization: EntityType.Organization,
  Invitation: EntityType.Invitation,
});

// Subset allowed in RecentActivity.entityType
export const ActivityEntityTypes = Object.freeze({
  Task: EntityType.Task,
  Space: EntityType.Space,
  Sprint: EntityType.Sprint,
  Comment: EntityType.Comment,
  Organization: EntityType.Organization,
});
