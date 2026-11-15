// Conversation practice: what the learner's AI is told, and the rules the app keeps for itself.
// Shared by the desktop app, the phone and the web app. No screen code here (components/conversepanel.js).
//
// How one conversation works:
//   - The AI plays a person (a hotel clerk, a friend, an interviewer) and speaks only the language being
//     learned, at the level chosen. It never sees more than this file gives it.
//   - What the person knows (the next flight, the price, the Wi-Fi password) is chosen HERE, by the app, anew
//     for every run, and handed to the AI as facts. So the learner really has to find things out, two runs
//     are not the same, and the AI can't drift into making the answers up.
//   - The learner's goals are ticked by the app. The AI only reports which ones the last message achieved;
//     a tick is never taken back, and the app decides when the conversation takes its turn for the worse
//     ("the complication", as in an oral proficiency interview's role-play).
//   - Every learner message comes back with a quiet correction (the sentence put right, and one line on why),
//     a note on whether it was a real attempt for the level, and whether it wandered off the subject.
//   - One request per message, one for a hint, one for the debrief at the end. All through the learner's own
//     AI key (define-service.js askAi).
//
// Nothing in this file is shown to the learner as it is written (it is all instructions), so tools/i18n
// leaves the file out.

import { langInfo } from "./languages.js";
import { LEVELS, TWIST_GOAL, goalsOf, scenario } from "./conversedata.js";

// ------------------------------------------------------------------ who the AI plays, and what it knows
// `who`: the person. `ask`: what an interviewer is to do. `pool`: questions to choose one from.
// `facts`: what only that person knows; "{a|b|c}" is chosen by the app for each run. `twist`: what goes
// wrong partway through. `yield`: what the person may agree to if the learner handles it well.
const TESTER = "an interviewer in a relaxed speaking interview: warm, curious and probing. You ask one question at a time, listen, and follow up on what the learner actually said. You never lecture and never answer for them";
const PROBES = "Follow up as a good interviewer does: ask why they think so, ask for one specific example, put the opposite view to them and ask how they answer it, ask what it means for society as a whole.";

const PLAY = {
  hello: { who: "a friendly new neighbour who has just moved into the learner's building; you meet on the stairs",
    facts: ["Your first name: choose a common one for a speaker of the language, and keep it.",
      "You come from {the capital|a small town in the north|a town by the sea}.",
      "You moved in {last week|two days ago|at the start of the month}."] },
  cafe: { who: "a waiter in a small café",
    facts: ["To eat there is only {cheese sandwiches and a chocolate cake|the soup of the day and fresh bread|two kinds of pastry and a fruit salad}.",
      "Prices are ordinary ones for a café where the language is spoken, in the local money. When asked what it all costs, give one clear total."] },
  market: { who: "a fruit seller at a market stall",
    facts: ["Today you have only {apples, oranges and grapes|bananas, peaches and figs|oranges, dates and pomegranates}.",
      "The price is an ordinary one per kilo, in the local money.",
      "The stall closes at {two o'clock|five o'clock|sunset}."] },
  taxi: { who: "a taxi driver waiting outside the railway station",
    facts: ["The ride takes about {ten|twenty|thirty-five} minutes.",
      "The fare is {on the meter, usually about the price of two coffees|a fixed price, about the price of a simple lunch|on the meter, with a small extra charge for luggage}; say it as an amount in the local money."] },
  family: { who: "a new colleague having coffee with the learner; warm and curious. You have a family of your own (make one up) and gladly answer when asked" },
  work: { who: "someone the learner has just met at a friend's dinner; interested in what people do. You have a job of your own (make one up)" },
  freetime: { who: "a classmate from an evening course, chatting before the lesson. You have hobbies of your own (make them up)" },
  trip: { who: "a friend who loves travelling and wants to hear every detail" },
  learning: { who: "a native speaker the learner has just met, pleasantly surprised that they are learning the language" },
  hotel: { who: "the receptionist of a mid-priced hotel",
    facts: ["The booking is there: a single room for {two|three|four} nights.",
      "Breakfast is {from half past six to half past nine|from seven to ten|from half past seven to half past ten}, {in the restaurant on the ground floor|in the room on the first floor}.",
      "The Wi-Fi password is {the hotel's name followed by 2024|the room number said twice|the word for 'welcome' followed by 123}.",
      "Guests must leave the room by {eleven|noon|ten} in the morning."] },
  train: { who: "a clerk at a railway ticket window",
    facts: ["The next train to where the learner wants to go leaves at {14:20|15:05|16:45}.",
      "It leaves from platform {2|5|7}.",
      "A single ticket costs an ordinary amount in the local money; a return costs a little less than twice that."] },
  clinic: { who: "the receptionist of a doctor's clinic, answering the phone",
    facts: ["The earliest appointment is {tomorrow at a quarter past nine|the day after tomorrow at half past four in the afternoon|this afternoon at a quarter to six}.",
      "They should bring {their identity card and insurance card|their identity card and any medicine they take|their insurance card, and come ten minutes early}."] },

  describe: { who: TESTER, ask: "Ask the learner to describe the room they work or study in so exactly that you could draw it. Ask about one thing you could not picture.",
    twist: "Ask them to compare this room with the room they had as a child." },
  story: { who: TESTER, ask: "Ask the learner to tell you about a day they will never forget. Follow up on what went wrong or was at stake, and on how it ended." },
  howto: { who: TESTER, ask: "Ask the learner to explain, step by step, how to make their favourite dish. You have never cooked it: ask about one step you did not follow." },
  news: { who: TESTER, ask: "Ask the learner to tell you about something that was in the news this week: what exactly happened. Then ask why it happened and what may come of it." },
  directions: { who: "a friend of the learner, visiting their city for the first time and phoning from the train station. You know nothing of the city: ask what to do next after each step",
    twist: "Say that you are carrying two heavy suitcases and cannot walk far.", yield: "a taxi with the address, a bus, or the learner coming to fetch you" },
  conference: { who: "the events manager of a hotel, on the phone",
    facts: ["The {Jasmine|Garden|Palm} Hall holds {sixty|eighty|fifty-five} people and has a projector, a screen and two microphones.",
      "The price per day is an ordinary one in the local money. It includes {one coffee break but not lunch|two coffee breaks but not lunch|lunch but no coffee breaks}.",
      "A discount, only if asked: {ten percent for booking two days|none on the room, but the coffee breaks free|five percent if a deposit is paid this week}."],
    twist: "Say you are sorry: you have just seen that the hall is already booked on the second day.", yield: "a smaller room for that day, or moving both days by one day" },
  flight: { who: "an airline agent at the service desk in the airport",
    facts: ["The next flight to the learner's destination leaves {this evening at 21:40|tonight at 23:15|in three hours, with a change of planes}.",
      "Changing the ticket costs {nothing|a fee of about a tenth of the ticket's price|only the small difference in fare}.",
      "The bag {stays in the system and goes on the new flight|must be collected at belt 4 and checked in again|already left on the earlier flight and will wait at the destination}."],
    twist: "Say that the flight you spoke of has just filled up: the only seats now are on tomorrow morning's flight.", yield: "the waiting list for tonight, or a hotel room for the night if the learner asks for one politely and firmly" },
  phone: { who: "a salesperson in a phone shop, answering the phone",
    facts: ["The phone costs an ordinary price for a good new phone, in the local money.",
      "In stock: {black and blue|black, white and green|only grey and gold}.",
      "The guarantee is {one year|two years|one year, or three for a little more money}."],
    twist: "Say you are sorry: the shop does not deliver to the learner's part of town.", yield: "collecting it in the shop, or sending it by post at the buyer's cost" },
  dinner: { who: "a friend of the learner who knows the city's restaurants well",
    facts: ["You recommend two places: {a grill house: generous, loud, cheap|a fish restaurant: quiet, pricey, by the water|a family-run place: home cooking, middling prices, small} and {a rooftop restaurant: a lovely view, expensive, must be booked|a vegetarian place: light, cheap, calm|a big traditional restaurant: music at weekends, middling prices}."],
    twist: "Say you have just remembered that the place the learner chose is closed on Fridays.", yield: "the other place, or another evening" },
  luggage: { who: "the airline's lost-luggage agent at the arrivals desk",
    facts: ["Bags like this usually arrive {on tonight's flight|tomorrow afternoon|within two days}.",
      "Bringing it to the hotel costs nothing.",
      "The reference number: make up a short code of letters and digits and say it slowly."],
    twist: "Say that you cannot promise the bag will be there before the learner's important meeting tomorrow morning.", yield: "the airline paying for what they must buy meanwhile, up to a limit, against receipts" },
  nocash: { who: "a waiter in a small family restaurant that takes only cash",
    facts: ["The nearest cash machine is {two streets away, beside the pharmacy|ten minutes' walk, at the bank on the main square|in the petrol station at the end of the road}."],
    twist: "Say that the manager has just told you he accepts neither something left as a guarantee nor a bank transfer.", yield: "a friend bringing the cash, a member of staff walking with them to the cash machine, or paying with a phone app the restaurant has" },
  accident: { who: "a police officer answering the emergency line; calm and exact",
    facts: ["You need to know: whether anyone is hurt, the exact place, what happened, the cars and the damage.",
      "What they should do: {wait by the cars; a patrol comes in about twenty minutes|if no one is hurt, move the cars aside, exchange insurance details and come to the station tomorrow|photograph everything, then move the cars; an officer will phone back}."],
    twist: "Say that the other driver has just told your colleague it was the learner who reversed into him.", yield: "taking the learner's account calmly once they tell it again clearly, and noting any witness or photograph" },
  borrowed: { who: "a close friend of the learner, who lent them a laptop. You do not know yet that it is broken",
    twist: "Say, upset, that the laptop was a present from your father and cannot be replaced.", yield: "a repair that keeps the same machine, once the learner shows they understand why it matters" },
  booking: { who: "the night receptionist of a full hotel; tired but professional",
    facts: ["There is no booking under the learner's name in the system.",
      "Your first answer is unhelpful: the hotel is full, they should try somewhere else.",
      "If the learner stays polite and firm, or has a confirmation to show, you can offer {a room at your sister hotel ten minutes away, with the taxi paid|a small staff room tonight at half price and a proper room tomorrow|to phone three hotels nearby for them}."] },
  faulty: { who: "an assistant in the shop where the learner bought the phone",
    facts: ["The shop's rule: within {seven|fourteen} days, with the receipt, a faulty phone is exchanged or the money returned."],
    twist: "Say that your manager says the shop can only send it away for repair, which takes three weeks.", yield: "an exchange, once the learner points to the shop's own rule or asks politely for the manager" },

  opinion: { who: TESTER, ask: `Put the question to the learner and ask where they stand. ${PROBES} At least once, disagree with them politely and see whether they can hold their position.`,
    pool: ["Has social media harmed society more than it has helped it?", "Should university education be free for everyone?",
      "Is working from home good for society, or does it harm it?", "Will artificial intelligence create more jobs than it destroys?",
      "Should governments put limits on the development of artificial intelligence?", "Who is responsible for fighting false news: governments, companies or each of us?",
      "Who bears more of the responsibility for climate change: rich countries or developing ones?", "Can economic growth and protecting the environment go together?",
      "Does immigration help the countries that receive it, or weigh on them?", "Should an immigrant give up their own culture to fit into the new society?",
      "Do schools today prepare pupils for life, or only for exams?", "Should the rich pay higher taxes?",
      "Is creating jobs the state's responsibility or the individual's?", "Can laws alone change the position of women, or must attitudes change too?",
      "Is democracy a system that suits every society?", "Are economic sanctions a good way to change how a state behaves?",
      "Does globalisation threaten local identities or enrich them?", "Is health care a right of every citizen or a service to be paid for?",
      "May a government make vaccination compulsory during an epidemic?", "Who should care for the old: the family or the state?"] },
  suppose: { who: TESTER, ask: "Put the question to the learner. Follow the consequences with them: ask what would happen next, and then what that would lead to.",
    pool: ["If you were minister of education in your country, what would you change?", "What would have happened if the internet had never been invented?",
      "If the borders between countries disappeared, how would the world change?", "If the government raised taxes sharply, what would happen?",
      "If exams were abolished in schools, what would the result be?", "If the language you are learning became the world's first language, how would your life change?",
      "If you could change one decision in your country's history, which would it be?", "If a machine could do all of your work, what would you do with your time?",
      "If you were in charge of your country's energy, what is the first decision you would take?", "If private cars were banned from city centres tomorrow, what would follow?"] },
  abstract: { who: TESTER, ask: `Put the question to the learner. Keep them on the idea itself, not on their own life. ${PROBES}`,
    pool: ["What does success mean, and does it mean the same in every society?", "What is the relationship between freedom and responsibility?",
      "Does progress in technology necessarily mean progress for people?", "Which matters more: stability or freedom?",
      "Where does the right to say what you think end, and hate speech begin?", "Is a just society one that makes outcomes equal, or chances equal?",
      "Is identity something we inherit or something we make?"] },
  explain: { who: "an interviewer who knows nothing about the subject and wants to understand it properly. You ask one question at a time and say honestly when a step was not clear",
    ask: "Put the question to the learner. Ask about one stage you did not follow, and ask what causes what.",
    pool: ["How are elections run in your country, from start to finish?", "How does health insurance work in your country?",
      "How does inflation affect people's daily lives? What is the mechanism?", "How does artificial intelligence work, for someone who is not a specialist?",
      "How does a law get made in your country?", "How does a vaccine protect the body?"] },
  surprise: { who: TESTER, ask: "Put the question to the learner without warning. If they say they do not know, encourage them to reason it out aloud rather than stop.",
    pool: ["Is exploring space an investment in the future or a waste of money?", "Do animals have rights, and where do they end?",
      "Why is football so popular all over the world?", "Should private cars be banned from city centres?",
      "Should the state pay a wage to people who stay at home to bring up their children?", "What do you think of keeping bees on the roofs of city buildings?",
      "Should museums give back objects taken from other countries long ago?", "Is it right to keep animals in zoos?"] },
  partner: { who: "the senior representative of a partner company at a formal meeting: courteous, cool, and unhappy about a project that is months late. You speak formally and expect the same",
    twist: "Say that a competitor has offered your company the same work, sooner and for less.", yield: "carrying on, if the learner offers firm dates and something concrete in return for the delay" },
  neighbour: { who: "the learner's neighbour, who has loud parties every night: friendly, but quick to feel accused",
    twist: "Say that nobody else in the building has complained, so you do not see the problem.", yield: "a compromise on the hours or the days, if the learner stays friendly and specific" },

  persuade: { who: "a senior government official in charge of the education budget: polite, short of time, and wary of new spending. You expect formal, respectful speech",
    facts: ["Your objection, raised once the learner has given an argument: the budget is tight, and other subjects need the money more.",
      "You can be moved by evidence, by what it costs not to act, and by a small first step that is cheap to try."] },
  condolence: { who: "a colleague of the learner whose {father|mother|brother} died last week: grieving, dignified, glad of the visit. You speak little" },
  speech: { who: "the host of the occasion. You invite the learner to speak, listen without interrupting, and afterwards thank them warmly and ask one question about something they said",
    ask: "Open by setting the scene in one sentence and inviting the learner to say a few words.",
    pool: ["a delegation is visiting the learner's organisation, and the learner is to welcome it", "a colleague is retiring after thirty years, and the learner is to say farewell",
      "a friend is getting married, and the learner is to congratulate the couple", "students are graduating, and the learner is to address them"] },
  proverb: { who: "an educated native speaker who loves the sayings of the language",
    ask: "Give the learner one real, well-known proverb or saying of the language, quoted exactly, and ask what they make of it. Later ask whether it still holds true today." },
};

// ------------------------------------------------------------------------------ levels and languages
// How the AI is to speak at each level, and what counts as not really trying (the "effort" mark).
const LEVEL_TALK = {
  0: { speak: "Use only the most common words and very short, simple sentences (CEFR A1). One idea per reply, at most two short sentences.",
    effort: "A word or a short phrase is enough at this level. Mark effort low only for an empty message, one in another language, or one that is no attempt at all." },
  1: { speak: "Use common everyday words and short, simple sentences (CEFR A2).",
    effort: "A short full sentence is expected. Mark effort low for a bare word or two where a sentence was called for, or a message in another language." },
  2: { speak: "Speak naturally at an intermediate level (CEFR B1 to B2): everyday words, ordinary sentences, normal speed.",
    effort: "Several connected sentences are expected when telling, describing or explaining, and full sentences elsewhere. Mark effort low for one short sentence where a paragraph was called for, or a message in another language." },
  3: { speak: "Speak as an educated native speaker does with a capable foreign colleague (CEFR C1).",
    effort: "An organised, extended answer with reasons and an example is expected. Mark effort low for a short or unsupported answer, or a message in another language." },
  4: { speak: "Speak as an educated native speaker does in this setting, in the register the occasion calls for (CEFR C2).",
    effort: "Extended, polished speech fitted to the listener is expected. Mark effort low for anything brief or casual, or a message in another language." },
};

// The kinds of Arabic: [its name, what the AI is told about it once].
const SPOKEN = "Write it in Arabic letters the way it is really spoken there, not in Standard Arabic.";
const ARABIC = {
  "": ["Modern Standard Arabic", "Use Standard Arabic (fuṣḥā) only, with no dialect words."],
  lev: ["Levantine Arabic", `Speak as people do in Damascus and Beirut. ${SPOKEN}`],
  egy: ["Egyptian Arabic", `Speak as people do in Cairo. ${SPOKEN}`],
  glf: ["Gulf Arabic", `Speak as people do in Riyadh and the Gulf. ${SPOKEN}`],
  mor: ["Moroccan Arabic (Darija)", `Speak as people do in Casablanca and Rabat. ${SPOKEN}`],
  irq: ["Iraqi Arabic", `Speak as people do in Baghdad. ${SPOKEN}`],
};
const NAMES = { zh: "Mandarin Chinese", ceb: "Cebuano (Bisaya)", tl: "Tagalog (Filipino)", fa: "Persian (Farsi)" };

/** The language as the AI is told it: "Spanish", "Levantine Arabic". */
export function languageName(lang, variety = "") {
  if (lang === "ar") return (ARABIC[variety] || ARABIC[""])[0];
  return NAMES[lang] || langInfo(lang).name || "the language";
}
/** What more the AI is told about it, once ("" for most languages). */
const languageNote = (lang, variety = "") => (lang === "ar" ? ` ${(ARABIC[variety] || ARABIC[""])[1]}` : "");

const levelOf = (s) => Number(s.level) || 0;

// ---------------------------------------------------------------------------------- one conversation
/** "{a|b|c}" in a fact, chosen with `rand` (0..1). */
export function choose(text, rand = Math.random) {
  return String(text).replace(/\{([^{}]*\|[^{}]*)\}/g, (all, list) => {
    const options = list.split("|");
    return options[Math.min(options.length - 1, Math.floor(rand() * options.length))];
  });
}

/**
 * A new conversation for scenario `id`: what the person knows is chosen now. `lang` is the language being
 * learned, `variety` the kind of Arabic ("" = Standard), `explain` the language the learner is spoken to in
 * about their mistakes ("English"). Null for an unknown id.
 */
export function newTalk(id, { lang, variety = "", explain = "English", rand = Math.random } = {}) {
  const s = scenario(id);
  const play = PLAY[id];
  if (!s || !play) return null;
  const pool = play.pool || [];
  return {
    id, lang, variety, explain,
    who: choose(play.who, rand),
    ask: play.ask || "",
    question: pool.length ? pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))] : "",
    facts: (play.facts || []).map((f) => choose(f, rand)),
    twistText: s.twist && play.twist ? play.twist : "",
    twistYield: s.twist && play.yield ? play.yield : "",
    twist: s.twist && play.twist ? "waiting" : "none", // "waiting" → "given" (the goal joins the list)
    goals: goalsOf(s),
    done: [],          // ids of goals ticked, in the order they were
    turns: [],         // {who: "partner", text, meaning} | {who: "you", text, fix, note, effort, off}
    ended: false,      // the AI said the conversation reached its natural end
  };
}

/** How many messages the learner has sent. */
export const said = (talk) => talk.turns.filter((t) => t.who === "you").length;

/** Is it time for the complication? After the learner has had a fair start: two messages and half the
 * goals, or four messages whatever happened. Never once it has been given. */
export function twistDue(talk) {
  if (talk.twist !== "waiting") return false;
  const n = said(talk) + 1; // the message being sent now
  const base = talk.goals.filter((g) => g.id !== "tw").length;
  return n >= 4 || (n >= 3 && talk.done.length * 2 >= base);
}

/** {done, total}: goals ticked and goals in all. */
export function score(talk) {
  return { done: talk.goals.filter((g) => talk.done.includes(g.id)).length, total: talk.goals.length };
}
/** Is everything ticked (and the complication, if there is one, already dealt with)? */
export const allDone = (talk) => talk.twist !== "waiting" && score(talk).done === score(talk).total;

/** The longest a conversation runs before the app suggests finishing. */
export const LONG_TALK = 14;

// ----------------------------------------------------------------------------------- the requests
const str = { type: "string" };
export const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Your next line, in role, in the language being practised. Nothing else: no translation, no notes." },
    reply_meaning: { type: "string", description: "What your reply means, in the learner's own language." },
    correction: { type: "string", description: "The learner's last message rewritten correctly and naturally in the language being practised, changing as little as possible. Empty when the message needs no correction, and on the opening line." },
    note: { type: "string", description: "With a correction: one short sentence, in the learner's own language, on what was changed and why. Otherwise empty." },
    done: { type: "array", items: str, description: "The ids of the goals the learner has achieved so far, including ones achieved earlier." },
    effort: { type: "string", description: "\"low\" when the last message was not a real attempt for this level; otherwise \"ok\"." },
    off: { type: "boolean", description: "True when the last message left the subject of the conversation." },
    end: { type: "boolean", description: "True when the conversation has reached its natural end." },
  },
  required: ["reply", "reply_meaning", "correction", "note", "done", "effort", "off", "end"],
  additionalProperties: false,
};

function system(talk) {
  const s = scenario(talk.id);
  const L = languageName(talk.lang, talk.variety);
  const level = LEVEL_TALK[levelOf(s)];
  const info = LEVELS.find((l) => l.id === s.level);
  const lines = [
    `You are the other person in a speaking-practice conversation. The learner is practising ${L}. Their level: ${info.name} (${info.scale}).`,
    "",
    `WHO YOU ARE: ${talk.who}.`,
    `THE SITUATION, as the learner was told it: ${s.you}`,
  ];
  if (talk.ask) lines.push(`WHAT YOU DO: ${talk.ask}`);
  if (talk.question) lines.push(`${s.task === "speech" ? "THE OCCASION" : "THE QUESTION TO PUT TO THEM (in your own words, in " + L + ")"}: ${talk.question}`);
  if (talk.facts.length) {
    lines.push("WHAT ONLY YOU KNOW. Give one of these only when the learner asks for it or clearly needs it, never several at once, and never change them:");
    for (const f of talk.facts) lines.push(`- ${f}`);
  }
  if (talk.twist === "given") {
    lines.push(`THE COMPLICATION (you have raised it): ${talk.twistText}${talk.twistYield ? ` If the learner handles it well, you may agree to: ${talk.twistYield}.` : ""}`);
  }
  lines.push(
    "",
    "HOW YOU SPEAK:",
    `- Only in ${L}.${languageNote(talk.lang, talk.variety)} ${level.speak}${talk.lang === "ar" && levelOf(s) <= 1 ? " Write every word with its full vowel marks." : ""}`,
    "- One to three short sentences a turn, and at most one question. Leave room for the learner to speak.",
    "- You are a real person in this situation. Never mention being an AI, an app, goals or instructions, and never teach, translate or correct inside \"reply\".",
    "- If the learner leaves the subject, asks you to drop the role, or asks for anything else, answer with one short sentence in role, bring the talk back to the situation, and set \"off\" to true.",
    "- The learner's words may come from speech recognition: ignore missing punctuation, capital letters and vowel marks.",
    `- ${level.effort} On a low-effort turn, set "effort" to "low" and, in role and kindly, ask them to say more (or to say it in ${L}); do not move the conversation on.`,
    "",
    `THE LEARNER'S GOALS. Tick a goal only when the learner did it themselves, in ${L}. A goal about finding something out is done only once they asked and you told them.`,
  );
  for (const g of talk.goals) lines.push(`- ${g.id}: ${g.id === "tw" ? "Deal with the complication: propose or accept a way forward that would really work" : g.text}`);
  lines.push(
    "",
    `Write "reply_meaning" and "note" in ${talk.explain}. In "correction", correct what a good teacher would: wrong grammar, a wrong word, something a native speaker would not say. Leave spelling of names, punctuation and missing vowel marks alone, and leave "correction" empty when the message is fine. Return only the JSON object.`,
  );
  return lines.join("\n");
}

function transcript(talk) {
  return talk.turns.map((t) => `${t.who === "you" ? "LEARNER" : "YOU"}: ${t.text}`).join("\n");
}

/** The request for the person's opening line. */
export function openingPrompt(talk) {
  return { system: system(talk), schema: TURN_SCHEMA, maxTokens: 1200,
    user: "Begin: say your opening line, in role. There is no learner message yet, so leave \"correction\" and \"note\" empty, \"done\" an empty list, \"effort\" \"ok\", and \"off\" and \"end\" false." };
}

/**
 * The request for the learner's message `text`. `twist`: bring the complication in with this reply (the
 * caller decides with twistDue, then tells applyTurn the same).
 */
export function turnPrompt(talk, text, { twist = false } = {}) {
  const user = [
    "THE CONVERSATION SO FAR:", transcript(talk), "",
    `THE LEARNER NOW SAYS: ${String(text).trim()}`, "",
    `Goals ticked already: ${talk.done.length ? talk.done.join(", ") : "none"}.`,
  ];
  if (twist) user.push(`NOW: after answering what they said, bring this in with your reply, naturally and in role: ${talk.twistText}`);
  if (said(talk) + 1 >= LONG_TALK) user.push("The conversation has run long: bring it to a friendly close in this reply.");
  return { system: system(talk), user: user.join("\n"), schema: TURN_SCHEMA, maxTokens: 1500 };
}

const text = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
/** Letters and digits only, small, without vowel marks: for telling whether two sentences are the same. */
export function bare(s) {
  return String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")       // Arabic vowel marks and the stretching line
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The AI's answer, tidied: what is missing or odd becomes its harmless value. Throws when there is no reply. */
export function cleanTurn(answer, talk, learnerText = "") {
  const a = answer && typeof answer === "object" ? answer : {};
  const reply = text(a.reply);
  if (!reply) throw new Error("The AI sent back no reply.");
  let correction = text(a.correction).replace(/^["“«]+|["”»]+$/g, "");
  if (!learnerText || !correction || bare(correction) === bare(learnerText)) correction = "";
  const ids = new Set(talk.goals.map((g) => g.id));
  return {
    reply, meaning: text(a.reply_meaning),
    correction, note: correction ? text(a.note) : "",
    done: (Array.isArray(a.done) ? a.done : []).map((x) => String(x).trim()).filter((x) => ids.has(x)),
    effort: learnerText && text(a.effort).toLowerCase() === "low" ? "low" : "ok",
    off: !!learnerText && a.off === true,
    end: a.end === true,
  };
}

/** Add the person's opening line to the conversation. Returns the tidied answer. */
export function applyOpening(talk, answer) {
  const a = cleanTurn(answer, talk);
  talk.turns.push({ who: "partner", text: a.reply, meaning: a.meaning });
  return a;
}

/**
 * Add the learner's message and the answer to it. `twist`: the complication was asked for with this
 * request (its goal joins the list now). Ticks are only ever added. Returns the tidied answer with
 * `ticked`: the goals this message newly achieved.
 */
export function applyTurn(talk, learnerText, answer, { twist = false } = {}) {
  const a = cleanTurn(answer, talk, learnerText);
  talk.turns.push({ who: "you", text: String(learnerText).trim(), fix: a.correction, note: a.note, effort: a.effort, off: a.off });
  talk.turns.push({ who: "partner", text: a.reply, meaning: a.meaning });
  const ticked = [];
  // (A low-effort or off-subject message earns nothing: the "effort lock".)
  if (a.effort !== "low" && !a.off) {
    for (const id of a.done) if (!talk.done.includes(id)) { talk.done.push(id); ticked.push(id); }
  }
  if (twist && talk.twist === "waiting") {
    talk.twist = "given";
    talk.goals.push({ id: "tw", text: TWIST_GOAL });
  }
  if (a.end && allDone(talk)) talk.ended = true;
  return { ...a, ticked };
}

// ----- a hint: a clue, then how to start, then a whole sentence -----
export const HINT_SCHEMA = {
  type: "object",
  properties: {
    clue: { type: "string", description: "One short sentence in the learner's own language on WHAT to say next, without giving the words." },
    starter: { type: "string", description: "The first two to four words of a good next message, in the language being practised." },
    full: { type: "string", description: "A complete good next message, in the language being practised, at the learner's level." },
    full_meaning: { type: "string", description: "What the complete message means, in the learner's own language." },
  },
  required: ["clue", "starter", "full", "full_meaning"],
  additionalProperties: false,
};

/** The request for a hint on what the learner could say next. */
export function hintPrompt(talk) {
  const s = scenario(talk.id);
  const L = languageName(talk.lang, talk.variety);
  const left = talk.goals.filter((g) => !talk.done.includes(g.id));
  const sys = [
    `You are a kind ${L} speaking teacher sitting beside a learner (${LEVELS.find((l) => l.id === s.level).scale}) during a practice conversation. They are stuck and asked what they could say NEXT.`,
    `The situation: ${s.you}`,
    `Their goals still open: ${left.length ? left.map((g) => g.text).join("; ") : "none; they can bring the conversation to a friendly close"}.`,
    `Suggest one next message for the LEARNER (not for the other person) that answers the last line and moves towards an open goal.${languageNote(talk.lang, talk.variety)} ${LEVEL_TALK[levelOf(s)].speak}${talk.lang === "ar" && levelOf(s) <= 1 ? " Write it with full vowel marks." : ""}`,
    `Write "clue" and "full_meaning" in ${talk.explain}; "starter" and "full" in ${L}. "starter" must be exactly how "full" begins. Return only the JSON object.`,
  ].join("\n");
  return { system: sys, user: `THE CONVERSATION SO FAR:\n${transcript(talk)}`, schema: HINT_SCHEMA, maxTokens: 1000 };
}

/** A hint, tidied; null when the AI gave nothing usable. */
export function cleanHint(answer) {
  const a = answer && typeof answer === "object" ? answer : {};
  const full = text(a.full);
  if (!full) return null;
  let starter = text(a.starter);
  if (!starter || !bare(full).startsWith(bare(starter))) starter = full.split(/\s+/).slice(0, 3).join(" ");
  return { clue: text(a.clue), starter, full, meaning: text(a.full_meaning) };
}

// ----- the debrief -----
const fix = { type: "object",
  properties: { point: str, said: str, better: str, why: str },
  required: ["point", "said", "better", "why"], additionalProperties: false };
const phrase = { type: "object", properties: { text: str, meaning: str }, required: ["text", "meaning"], additionalProperties: false };
export const DEBRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two sentences in the learner's own language: how it went, and the single most useful thing to work on next." },
    best: { type: "string", description: "The learner's best line, copied exactly as they wrote it. Empty if they wrote nothing usable." },
    best_why: { type: "string", description: "One sentence in the learner's own language on why it is good." },
    fixes: { type: "array", items: fix, description: "Up to three things to work on, the most important first: point (a short label in the learner's own language), said (the learner's line, copied exactly), better (it said well, in the language practised), why (one sentence in the learner's own language)." },
    reached: { type: "string", description: "\"below\", \"at\" or \"above\": the learner's language against what this level asks for." },
    culture: { type: "string", description: "One short note in the learner's own language on how this situation is really handled where the language is spoken; empty if there is nothing worth saying." },
    phrases: { type: "array", items: phrase, description: "Up to three ready-made phrases for this situation that the learner did not use: text (in the language practised), meaning (in the learner's own language)." },
  },
  required: ["summary", "best", "best_why", "fixes", "reached", "culture", "phrases"],
  additionalProperties: false,
};

/** The request for the debrief of a finished (or abandoned) conversation. */
export function debriefPrompt(talk) {
  const s = scenario(talk.id);
  const L = languageName(talk.lang, talk.variety);
  const info = LEVELS.find((l) => l.id === s.level);
  const ticks = talk.goals.map((g) => `- [${talk.done.includes(g.id) ? "x" : " "}] ${g.text}`).join("\n");
  const sys = [
    `You are an experienced, encouraging ${L} speaking teacher. A learner has just finished a practice conversation at ${info.name} (${info.scale}).`,
    `The situation: ${s.you}`,
    `Their goals (x = achieved):\n${ticks}`,
    "Judge ONLY the lines marked LEARNER. Choose mistakes that repeat or that would confuse a listener; leave typing slips, punctuation and missing vowel marks alone. Quote the learner exactly. Be specific and kind, and never invent a mistake: an empty list is a good answer when there is nothing to fix.",
    `Write "summary", "best_why", "point", "why", "culture" and every "meaning" in ${talk.explain}; "better" and every phrase's "text" in ${L}.${languageNote(talk.lang, talk.variety)} Return only the JSON object.`,
  ].join("\n");
  return { system: sys, user: `THE CONVERSATION:\n${transcript(talk).replace(/^YOU:/gm, "OTHER:")}`, schema: DEBRIEF_SCHEMA, maxTokens: 2500 };
}

/** The debrief, tidied. Quotes that are not the learner's own lines are dropped. */
export function cleanDebrief(answer, talk) {
  const a = answer && typeof answer === "object" ? answer : {};
  const mine = talk.turns.filter((t) => t.who === "you").map((t) => bare(t.text));
  const isMine = (line) => { const b = bare(line); return !!b && mine.some((m) => m.includes(b) || b.includes(m)); };
  const best = text(a.best);
  const reached = text(a.reached).toLowerCase();
  return {
    summary: text(a.summary),
    best: isMine(best) ? best : "", bestWhy: isMine(best) ? text(a.best_why) : "",
    fixes: (Array.isArray(a.fixes) ? a.fixes : [])
      .map((f) => ({ point: text(f && f.point), said: text(f && f.said), better: text(f && f.better), why: text(f && f.why) }))
      .filter((f) => f.better && isMine(f.said) && bare(f.better) !== bare(f.said)).slice(0, 3),
    reached: ["below", "at", "above"].includes(reached) ? reached : "",
    culture: text(a.culture),
    phrases: (Array.isArray(a.phrases) ? a.phrases : [])
      .map((p) => ({ text: text(p && p.text), meaning: text(p && p.meaning) })).filter((p) => p.text).slice(0, 3),
  };
}

// ----- saying a line again: how close was it? -----
/**
 * How much of `target` is in what was `heard`, in order: {score: 0..1, missed: [words of the target not
 * heard]}. Words for languages written with spaces; single characters for the others. Vowel marks,
 * punctuation and capitals don't count.
 */
export function closeness(heard, target, lang) {
  const split = (s) => (langInfo(lang).unspaced ? [...bare(s).replace(/\s+/g, "")] : bare(s).split(" ").filter(Boolean));
  const a = split(heard), b = split(target);
  if (!b.length) return { score: 0, missed: [] };
  // longest common run of words in order (a small table: lines are short)
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const missed = [];
  let i = 0, j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) { i++; j++; }
    else if (i < a.length && table[i + 1][j] >= table[i][j + 1]) i++;
    else missed.push(b[j++]);
  }
  return { score: table[0][0] / b.length, missed };
}

// ----- what has been done, kept on this device -----
/** The record after a conversation: the best number of goals reached for each one, and how many times it
 * was played. `saved` is the record so far ({id: {best, total, times}}). */
export function withResult(saved, talk) {
  const out = { ...(saved && typeof saved === "object" ? saved : {}) };
  const { done, total } = score(talk);
  const was = out[talk.id] || { best: 0, total, times: 0 };
  out[talk.id] = { best: Math.max(Number(was.best) || 0, done), total, times: (Number(was.times) || 0) + 1 };
  return out;
}
