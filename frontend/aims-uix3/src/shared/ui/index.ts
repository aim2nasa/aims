/**
 * AIMS UIX-3 Shared UI Components
 * @since 2025-09-15
 * @version 1.0.0
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { LoadingSkeleton, TextSkeleton, CardSkeleton } from './LoadingSkeleton';
export type {
  LoadingSkeletonProps,
  TextSkeletonProps,
  CardSkeletonProps,
} from './LoadingSkeleton';

export { Dropdown } from './Dropdown';
export type { DropdownProps, DropdownOption } from './Dropdown';

export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export { Input } from './Input';
export type { InputProps, InputType } from './Input';

export { FormField } from './FormField';
export type { FormFieldProps } from './FormField';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { DraggableModal } from './DraggableModal';
export type { DraggableModalProps } from './DraggableModal';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

export { QuickActionButton } from './QuickActionButton';
export type { QuickActionButtonProps } from './QuickActionButton';

export { RecentActivityList } from './RecentActivityList';
export type { RecentActivityListProps, RecentActivityItem } from './RecentActivityList';

export { UsageGuide } from './UsageGuide';
export type { UsageGuideProps, GuideSection } from './UsageGuide';

export { Breadcrumb } from './Breadcrumb';
export type { BreadcrumbItem } from './Breadcrumb';

export { ContextMenu, ContextMenuItem, ContextMenuDivider, useContextMenu } from './ContextMenu';
export type {
  ContextMenuProps,
  ContextMenuSection,
  ContextMenuItemType,
  ContextMenuPosition,
  UseContextMenuReturn
} from './ContextMenu';

export { CloseButton } from './CloseButton';
export type { CloseButtonProps, CloseButtonSize } from './CloseButton';

export { useToast, ToastContainer, ToastProvider, useToastContext } from './Toast';
export type { Toast, ToastType, ToastOptions, UseToastReturn } from './Toast';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './EmptyState';

export { DocumentTypeCell } from './DocumentTypeCell';
export type { DocumentTypeCellProps } from './DocumentTypeCell';

export { DocumentTypeBadge } from './DocumentTypeBadge';

export { InitialFilterBar } from './InitialFilterBar';
export type { InitialFilterBarProps, InitialType } from './InitialFilterBar';
export {
  extractInitial,
  calculateInitialCounts,
  filterByInitial,
  KOREAN_INITIALS,
  ALPHABET_INITIALS,
  NUMBER_INITIALS,
} from './InitialFilterBar';

// Pagination (CSS만 제공)
import './Pagination';
