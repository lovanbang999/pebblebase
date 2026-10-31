export interface FocusTarget {
  isConnected: boolean;
  focus: () => void;
}

export function restoreFindDialogFocus(target: FocusTarget | null): void {
  if (target?.isConnected) target.focus();
}
