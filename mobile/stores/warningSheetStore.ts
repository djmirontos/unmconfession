import { create } from 'zustand';

/** The notice sheet (components/notifications/WarningSheet.tsx): which notification it shows. */
type WarningSheetState = { notificationId: string | null };

export const useWarningSheetStore = create<WarningSheetState>(() => ({ notificationId: null }));

/** Opens the sheet for one of my 'warning' notifications (the list row or a tapped push). */
export const openWarningSheet = (notificationId: string) => useWarningSheetStore.setState({ notificationId });
export const closeWarningSheet = () => useWarningSheetStore.setState({ notificationId: null });
