// Admin UI Primitives — Enterprise-grade components for the admin panel
// Re-exports all admin-specific UI components for convenient imports.

export {
  AdminTable,
  type AdminTableColumn,
  type AdminTableProps,
  type SortDirection,
} from "./AdminTable";
export { AdminTabs, type AdminTab, type AdminTabsProps } from "./AdminTabs";
export { AdminBreadcrumb, type BreadcrumbItem, type AdminBreadcrumbProps } from "./AdminBreadcrumb";
export { AdminDropdown, type AdminDropdownItem, type AdminDropdownProps } from "./AdminDropdown";
export { AdminEmptyState, type AdminEmptyStateProps } from "./AdminEmptyState";
export { AdminSkeleton, Skeleton } from "./AdminSkeleton";
export {
  AdminDialog,
  AdminConfirmDialog,
  type AdminDialogProps,
  type AdminConfirmDialogProps,
} from "./AdminDialog";
export { AdminSearchInput, type AdminSearchInputProps } from "./AdminSearchInput";
export { AdminPageHeader, type AdminPageHeaderProps } from "./AdminPageHeader";
