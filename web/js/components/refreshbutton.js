// The refresh button in the top bar, on every version (the owner: "there should be a refresh
// button on every app"). A tap syncs now: what is waiting here goes to Drive, then whatever the
// other devices sent comes back; the icon turns meanwhile, and a short toast says "Up to date" or
// how many changes came. Each app says how to sync (`run`): it resolves to the number of changes
// received, or null when it handled things itself (offered sign-in, left for Google's page).

import { toast } from "../app.js";
import { icon } from "../icons.js";
import { refreshMessage } from "../syncpace.js";

export function refreshButton(run) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "top-refresh";
  b.setAttribute("aria-label", "Sync now");
  b.title = "Sync now";
  b.innerHTML = icon("refresh", 17);
  b.onclick = async () => {
    if (b.classList.contains("spinning")) return;
    b.classList.add("spinning");
    b.setAttribute("aria-busy", "true");
    try {
      const received = await run();
      if (received !== null && received !== undefined) toast(refreshMessage(received), { timeout: 2500 });
    } catch (e) {
      toast(e.message || "Couldn't sync.", { error: true });
    } finally {
      b.classList.remove("spinning");
      b.removeAttribute("aria-busy");
    }
  };
  return b;
}
