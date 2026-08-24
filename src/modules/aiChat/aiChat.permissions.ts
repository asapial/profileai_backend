import type { ChatRole, SafeAiToolDefinition } from "./aiChat.types";

export const ADMIN_PERMISSION_ALIASES = {
  supportRead: ["*", "SUPER_ADMIN", "support:read", "tickets:read", "SUPPORT_READ"],
  userRead: ["*", "SUPER_ADMIN", "users:read", "USER_READ"],
  billingRead: ["*", "SUPER_ADMIN", "billing:read", "invoices:read", "BILLING_READ"],
  analyticsRead: ["*", "SUPER_ADMIN", "analytics:read", "ANALYTICS_READ"],
  contentRead: ["*", "SUPER_ADMIN", "content:read", "help:read", "CONTENT_READ"],
  auditRead: ["*", "SUPER_ADMIN", "audit:read", "AUDIT_READ"],
} as const;

export const hasAnyPermission = (
  granted: readonly string[],
  required: readonly string[],
): boolean => required.some((permission) => granted.includes(permission));

export const canReadAdminResource = (
  resourceType: string,
  permissions: readonly string[],
): boolean => {
  switch (resourceType) {
    case "support_ticket": return hasAnyPermission(permissions, ADMIN_PERMISSION_ALIASES.supportRead);
    case "user": return hasAnyPermission(permissions, ADMIN_PERMISSION_ALIASES.userRead);
    case "invoice": return hasAnyPermission(permissions, ADMIN_PERMISSION_ALIASES.billingRead);
    case "report": return hasAnyPermission(permissions, ADMIN_PERMISSION_ALIASES.analyticsRead);
    default: return true;
  }
};

const TOOL_DEFINITIONS: SafeAiToolDefinition[] = [
  { name: "search_published_help", description: "Search published ProFile AI help content.", operation: "READ", permittedRoles: ["VISITOR", "USER", "ADMIN"], confirmationRequired: false },
  { name: "read_current_resume", description: "Read the authenticated user's current resume context.", operation: "READ", permittedRoles: ["USER"], confirmationRequired: false },
  { name: "read_current_cover_letter", description: "Read the authenticated user's current cover letter context.", operation: "READ", permittedRoles: ["USER"], confirmationRequired: false },
  { name: "read_current_application", description: "Read the authenticated user's current application context.", operation: "READ", permittedRoles: ["USER"], confirmationRequired: false },
  { name: "read_billing_summary", description: "Read the authenticated user's local plan and usage summary.", operation: "READ", permittedRoles: ["USER"], confirmationRequired: false },
  { name: "read_admin_ticket", description: "Read a support ticket for an authorized administrator.", operation: "READ", permittedRoles: ["ADMIN"], requiredPermission: "support:read", confirmationRequired: false },
  { name: "create_support_ticket", description: "Create a support ticket from a reviewed draft.", operation: "WRITE", permittedRoles: ["USER"], confirmationRequired: true },
];

export const selectTools = (
  role: ChatRole,
  permissions: readonly string[],
  toolsEnabled: boolean,
  writesEnabled: boolean,
): SafeAiToolDefinition[] => {
  if (!toolsEnabled) return [];
  return TOOL_DEFINITIONS.filter((tool) => {
    if (!tool.permittedRoles.includes(role)) return false;
    if (tool.operation === "WRITE" && !writesEnabled) return false;
    if (tool.requiredPermission === "support:read") {
      return hasAnyPermission(permissions, ADMIN_PERMISSION_ALIASES.supportRead);
    }
    return true;
  });
};
