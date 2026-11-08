import { esc } from "./format.ts";

/** A button that copies `text`, such as an install command. It says Copied for a moment after. */
export const copyButton = (text: string) =>
  `<button type="button" class="copy" data-copy="${esc(text)}"><span>Copy</span><span>Copied</span></button>`;

/** Wires every copy button: `[data-copied]` shows Copied instead of Copy, see style.css. */
export function mountCopyButtons() {
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-copy]");
    if (!button?.dataset.copy) return;
    navigator.clipboard?.writeText(button.dataset.copy).then(() => {
      button.dataset.copied = "";
      clearTimeout(timers.get(button));
      timers.set(
        button,
        setTimeout(() => delete button.dataset.copied, 1500),
      );
    });
  });
}
