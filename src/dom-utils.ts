export type ButtonLikeElement = HTMLElement & { disabled: boolean };
export type InputLikeElement = HTMLElement & {
  value: string;
  min?: string;
  max?: string;
  files?: FileList | null;
  click: () => void;
  setSelectionRange?: (selectionStart: number, selectionEnd: number) => void;
};

export function queryHtmlElement(
  root: ParentNode,
  selector: string,
): HTMLElement | null {
  const element = root.querySelector(selector);
  return element instanceof HTMLElement ? element : null;
}

export function queryButtonElement(
  root: ParentNode,
  selector: string,
): ButtonLikeElement | null {
  const element = root.querySelector(selector);
  return isButtonLikeElement(element) ? element : null;
}

export function queryInputElement(
  root: ParentNode,
  selector: string,
): InputLikeElement | null {
  const element = root.querySelector(selector);
  return isInputLikeElement(element) ? element : null;
}

export function queryInputElements(
  root: ParentNode,
  selector: string,
): InputLikeElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(
    (element): element is InputLikeElement => isInputLikeElement(element),
  );
}

export function isButtonLikeElement(
  element: Element | null,
): element is ButtonLikeElement {
  return element instanceof HTMLElement && "disabled" in element;
}

export function isInputLikeElement(
  element: Element | null,
): element is InputLikeElement {
  return element instanceof HTMLElement && "value" in element;
}

export function currentTargetElement(event: Event): Element | null {
  return event.currentTarget instanceof Element ? event.currentTarget : null;
}

export function targetElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export function isPointerEvent(event: Event): event is PointerEvent {
  return typeof PointerEvent !== "undefined" && event instanceof PointerEvent;
}

export function isDragEvent(event: Event): event is DragEvent {
  return typeof DragEvent !== "undefined" && event instanceof DragEvent;
}

export function isKeyboardEvent(event: Event): event is KeyboardEvent {
  return typeof KeyboardEvent !== "undefined" && event instanceof KeyboardEvent;
}

export function isClipboardEvent(event: Event): event is ClipboardEvent {
  return (
    typeof ClipboardEvent !== "undefined" && event instanceof ClipboardEvent
  );
}
