// "I'm stuck": a step-by-step walkthrough for getting an API key from each AI provider. It opens
// on the provider that is selected in Settings; the tabs at the top show the others.

import { esc, h } from "../app.js";
import { PROVIDERS } from "../definer.js";
import { openModal } from "./modal.js";

// One entry per provider in definer.js PROVIDERS. `steps` are [what to do, how], in order;
// `starts` is what a real key begins with, so the user can tell they copied the right thing.
export const KEY_GUIDES = {
  claude: {
    site: "the Claude Console",
    starts: "sk-ant-",
    cost: "About $5 of credit is enough for well over ten thousand word lookups with the recommended model.",
    steps: [
      ["Open the Claude Console", "Press the button below. It opens console.anthropic.com in your web browser. This is a different site from the Claude chat app."],
      ["Sign in, or make an account", "Use your email address or “Continue with Google”. A Claude Pro or Max chat subscription does not cover this: keys are paid for separately."],
      ["Add some credit", "Open <b>Settings → Billing</b>, add a payment card and buy a small amount of credit. Keys don't work until the account has credit."],
      ["Create the key", "Open <b>Settings → API keys</b> and press <b>Create Key</b>. Give it a name you'll recognise, such as “Tamkeen”."],
      ["Copy it straight away", "The key is a long line of letters that starts with <code>sk-ant-</code>. It is shown only once, so press <b>Copy</b> before closing the box."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box in Settings, and press <b>Test with an example</b>."],
    ],
  },
  gemini: {
    site: "Google AI Studio",
    starts: "AIza",
    cost: "Gemini has a free allowance, so you can start without a payment card. On the free allowance Google may use what is sent to improve its products; adding billing in AI Studio turns that off.",
    steps: [
      ["Open Google AI Studio", "Press the button below. It opens aistudio.google.com in your web browser."],
      ["Sign in with your Google account", "Any Google (Gmail) account works. Agree to the terms if it asks."],
      ["Create the key", "Press <b>Create API key</b>. If it asks which project to use, let it create a new one."],
      ["Copy the key", "It is a long line of letters that starts with <code>AIza</code>. Press the copy button beside it. You can come back to this page and copy it again later."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box in Settings, and press <b>Test with an example</b>."],
    ],
  },
  openai: {
    site: "the OpenAI platform",
    starts: "sk-",
    cost: "About $5 of credit is enough for well over ten thousand word lookups with the recommended model.",
    steps: [
      ["Open the OpenAI platform", "Press the button below. It opens platform.openai.com in your web browser. This is a different site from ChatGPT."],
      ["Sign in, or make an account", "Your ChatGPT login works here too, but a ChatGPT Plus subscription does not cover this: keys are paid for separately. It may ask you to confirm a phone number."],
      ["Add some credit", "Open <b>Settings</b> (the cog) <b>→ Billing</b>, add a payment card and buy a small amount of credit. Keys don't work until the account has credit."],
      ["Create the key", "Open <b>API keys</b> and press <b>Create new secret key</b>. Give it a name you'll recognise, such as “Tamkeen”."],
      ["Copy it straight away", "The key is a long line of letters that starts with <code>sk-</code>. It is shown only once, so press <b>Copy</b> before closing the box."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box in Settings, and press <b>Test with an example</b>."],
    ],
  },
  grok: {
    site: "the xAI Console",
    starts: "xai-",
    cost: "Grok costs more per lookup than the others' recommended models: about $5 of credit covers a couple of thousand lookups.",
    steps: [
      ["Open the xAI Console", "Press the button below. It opens console.x.ai in your web browser."],
      ["Sign in, or make an account", "Use your X account, Google, or an email address. An X Premium or SuperGrok subscription does not cover this: keys are paid for separately."],
      ["Add some credit", "Open <b>Billing</b>, add a payment card and buy a small amount of credit. Keys don't work until the account has credit."],
      ["Create the key", "Open <b>API Keys</b> and press <b>Create API key</b>. Give it a name you'll recognise, such as “Tamkeen”."],
      ["Copy it straight away", "The key is a long line of letters that starts with <code>xai-</code>. Copy it before closing the box."],
      ["Paste it into Tamkeen", "Come back here, paste it into the <b>API key</b> box in Settings, and press <b>Test with an example</b>."],
    ],
  },
};

const PROBLEMS = [
  ["It says the key was rejected", "Check that the provider chosen in Settings is the one whose website gave you the key (a Claude key doesn't work with Gemini selected). Then copy the key again and paste it fresh: a missing letter at the end is the usual cause."],
  ["It says quota, billing or rate limit", "The account has no credit yet, or the credit hasn't arrived. Add credit on the provider's Billing page and try again in a few minutes."],
  ["It says it doesn't recognise the model", "Set <b>Model</b> in Settings back to the one marked “recommended”."],
  ["I closed the box before copying the key", "Make a new key the same way, and delete the old one from the provider's list."],
  ["Is my key safe?", "Treat it like a password: don't share it or post it anywhere. Tamkeen keeps it only on this device and sends it only to the provider you chose."],
];

/** Open the walkthrough on `provider` (one of PROVIDERS' names). */
export function showKeyHelp(provider) {
  const modal = openModal({ title: "How to get an API key", wide: true });
  let current = KEY_GUIDES[provider] ? provider : "claude";

  function paint() {
    const info = PROVIDERS[current];
    const g = KEY_GUIDES[current];
    modal.body.innerHTML = "";
    modal.body.append(h(`<div class="key-help stack">
      <p class="small muted" style="margin:0">An API key is a kind of password that lets Tamkeen ask an AI service to explain words for you.
        You get it from the service's own website; it takes a few minutes.</p>
      <div class="key-tabs" role="tablist">${Object.entries(PROVIDERS).map(([k, p]) =>
        `<button type="button" role="tab" data-p="${k}" aria-selected="${k === current}">${esc(p.short)}</button>`).join("")}</div>
      <ol class="key-steps">${g.steps.map(([what, how]) => `<li><strong>${what}</strong><div>${how}</div></li>`).join("")}</ol>
      <div class="row"><a class="btn primary big" href="${esc(info.keyUrl)}" target="_blank" rel="noopener">Open ${esc(g.site)} ↗</a></div>
      <p class="small muted" style="margin:0">${esc(g.cost)}</p>
      <details class="key-problems"><summary>Something went wrong?</summary>
        <dl>${PROBLEMS.map(([q, a]) => `<dt>${q}</dt><dd>${a}</dd>`).join("")}</dl></details>
    </div>`));
    for (const b of modal.body.querySelectorAll("[data-p]")) b.onclick = () => { current = b.dataset.p; paint(); };
  }
  paint();
  return modal;
}
