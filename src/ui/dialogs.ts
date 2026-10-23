import { t } from "../i18n";
import { inOwlbear, notify } from "../obr/table";

// Owlbear runs extensions in sandboxed frames where alert() and confirm() may be blocked,
// so messages and questions are drawn by the page itself.

type Tone = "INFO" | "SUCCESS" | "ERROR";

export function say(message: string, tone: Tone = "INFO") {
  if (inOwlbear) {
    void notify(message, tone);
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone.toLowerCase()}`;
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.classList.add("hide"), 3500);
  setTimeout(() => toast.remove(), 4000);
}

export function ask(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    const dialog = document.createElement("div");
    dialog.className = "dialog";
    const text = document.createElement("p");
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const no = document.createElement("button");
    no.textContent = t("cancel");
    const yes = document.createElement("button");
    yes.className = "primary";
    yes.textContent = t("ok");
    actions.append(no, yes);
    dialog.append(text, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    yes.focus();
    const done = (answer: boolean) => {
      backdrop.remove();
      window.removeEventListener("keydown", onKey, true);
      resolve(answer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(false);
      else if (e.key === "Enter") done(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    no.addEventListener("click", () => done(false));
    yes.addEventListener("click", () => done(true));
    backdrop.addEventListener("click", (e) => e.target === backdrop && done(false));
  });
}
