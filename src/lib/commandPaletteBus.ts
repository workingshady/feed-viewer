/** Cross-page hook to open the command palette without prop drilling (`AppCommandPalette` listens). */

export const OPEN_COMMAND_PALETTE_EVENT = "feedview:open-command-palette";

export function dispatchOpenCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}
