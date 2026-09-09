export function confirmWithFocusRestore(message: string): boolean {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const result = globalThis.confirm(message);

  // El diálogo nativo le devuelve el foco del SO a la ventana de Electron
  // (ver infra/windows/electron/main.js), pero no al elemento que estaba
  // enfocado antes de abrir el confirm — hay que restaurarlo a mano.
  if (previouslyFocused?.focus) {
    setTimeout(() => previouslyFocused.focus(), 0);
  }

  return result;
}
