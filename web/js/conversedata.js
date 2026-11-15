// Conversation practice (Library → Conversation): the list of conversations and what the learner is told
// about each. Shared by the desktop app, the phone and the web app.
//
// The list follows the shape of an oral proficiency interview (the owner's MSA OPI Trainer): a warm-up
// about yourself, then the tasks each level is tested on, then role-plays that go wrong halfway through
// ("the complication"), up to formal situations, opinion, hypothesis and short speeches. Every one is
// written once, in English, and played by the learner's AI in whatever language is being learned.
//
// Everything in THIS file is shown to the learner, so it is translated with the rest of the interface
// (tools/i18n). What only the AI is told (who it plays, what it knows, the complication) is in converse.js.

/** The levels, easiest first. `scale`: the same level on the two scales learners know (CEFR · ILR). */
export const LEVELS = [
  { id: "0", name: "Starter", scale: "A1", about: "First words: greet, ask for things, understand a short answer." },
  { id: "1", name: "Level 1", scale: "A2 · ILR 1", about: "Everyday needs, and simple talk about yourself." },
  { id: "2", name: "Level 2", scale: "B2 · ILR 2", about: "Tell, describe, explain, and sort out a problem." },
  { id: "3", name: "Level 3", scale: "C1 · ILR 3", about: "Argue a view, suppose, and handle formal moments." },
  { id: "4", name: "Level 4", scale: "C2 · ILR 4", about: "Persuade, fit your words to the listener, speak at an occasion." },
];

/** What each kind of task is called, and the one piece of advice that helps most with it. */
export const TASKS = {
  ask: { name: "Find out", tip: "Ask one thing at a time, and say back what you heard to check it." },
  chat: { name: "About you", tip: "Answer in full sentences, add one detail nobody asked for, and ask a question back." },
  problem: { name: "Something goes wrong", tip: "Greet, say the problem, turn down a poor first offer politely, suggest your own way out, confirm it, and say thanks." },
  describe: { name: "Describe", tip: "Go from the general to the detail, or walk through the place in order. Compare things." },
  narrate: { name: "Tell a story", tip: "Give it a beginning, a problem and an ending, and keep to the past." },
  instruct: { name: "Give instructions", tip: "Give the steps in order: first, after that, then, finally." },
  report: { name: "Report the news", tip: "Facts first: who, what, where, when, why. Then one sentence on what it leads to." },
  opinion: { name: "Defend a view", tip: "Position, reason, example, a point for the other side, conclusion. Talk about the issue, not about yourself." },
  suppose: { name: "What if", tip: "Keep the “if… would…” pattern all the way through, and follow the results two steps out." },
  abstract: { name: "An idea", tip: "Define the idea, set two views of it against each other, give one real example, then come back to the idea." },
  explain: { name: "Explain how it works", tip: "Name the stages, say what causes what, then give one comparison." },
  surprise: { name: "The unexpected", tip: "Say it is new to you, put the question in your own words, tie it to something you know, then commit to a view." },
  formal: { name: "A formal moment", tip: "Use the polite forms of address, soften what you ask for, and never slip into casual speech." },
  persuade: { name: "Persuade", tip: "Decide who you are talking to before you start, and let that choose your tone and your arguments." },
  speech: { name: "A few words", tip: "Warm and formal: greet, say why you are gathered, thank people by name, add a saying, give your wishes, close." },
};

/** The goal added to the list when the conversation takes its turn for the worse. */
export const TWIST_GOAL = "Deal with the surprise";

// `title`: its name in the list. `you`: the situation, as the learner is told it. `goals`: what to get
// done, ticked off as the conversation goes (ids are g1, g2… in this order). `twist`: something goes wrong
// partway through (what, only the AI knows).
export const SCENARIOS = [
  // ----- Starter -----
  { id: "hello", level: "0", task: "ask", icon: "smile", title: "Meeting a neighbour",
    you: "You meet a new neighbour on the stairs of your building.",
    goals: ["Greet them and say your name", "Find out their name", "Find out where they are from", "Say goodbye politely"] },
  { id: "cafe", level: "0", task: "ask", icon: "food", title: "Ordering at a café",
    you: "You are at a café and want something to drink and something to eat.",
    goals: ["Order a drink", "Find out what there is to eat", "Find out how much it all costs"] },
  { id: "market", level: "0", task: "ask", icon: "food", title: "At the market",
    you: "You want to buy fruit at a market stall.",
    goals: ["Ask for the fruit you want", "Find out the price", "Find out when the stall closes"] },
  { id: "taxi", level: "0", task: "ask", icon: "travel", title: "Taking a taxi",
    you: "You get into a taxi outside the station.",
    goals: ["Tell the driver where you are going", "Find out how long it takes", "Find out what it will cost"] },

  // ----- Level 1: the warm-up every interview starts with, and everyday needs -----
  { id: "family", level: "1", task: "chat", icon: "home", title: "Your family",
    you: "A new colleague asks about your family over coffee.",
    goals: ["Describe two people in your family", "Say what one of them does", "Ask about their family too"] },
  { id: "work", level: "1", task: "chat", icon: "computer", title: "Your work or studies",
    you: "Someone you have just met asks what you do.",
    goals: ["Say what you do and where", "Describe an ordinary day", "Say what you like about it"] },
  { id: "freetime", level: "1", task: "chat", icon: "music", title: "Your free time",
    you: "A classmate asks what you do when you are not working.",
    goals: ["Say what you do in your free time", "Say how often and who with", "Ask what they like to do"] },
  { id: "trip", level: "1", task: "chat", icon: "travel", title: "A trip you took",
    you: "A friend asks about a trip you took.",
    goals: ["Say where you went and when", "Say what you did there", "Say what you liked most"] },
  { id: "learning", level: "1", task: "chat", icon: "learn", title: "Why you are learning this language",
    you: "Someone is curious about why you are learning their language.",
    goals: ["Say when you started and why", "Say what you find hard", "Say what you want to do with it"] },
  { id: "hotel", level: "1", task: "ask", icon: "home", title: "Checking in",
    you: "You arrive at a hotel where you have a booking.",
    goals: ["Give your name and say you have a booking", "Find out when breakfast is", "Find out the Wi-Fi password", "Find out when you must leave the room"] },
  { id: "train", level: "1", task: "ask", icon: "travel", title: "Buying a train ticket",
    you: "You are at a station ticket window and want to travel today.",
    goals: ["Say where you want to go", "Find out when the next train leaves", "Find out which platform", "Find out the price and buy a ticket"] },
  { id: "clinic", level: "1", task: "ask", icon: "calendar", title: "Making an appointment",
    you: "You phone a clinic because you feel ill.",
    goals: ["Say what is wrong", "Find out the earliest appointment", "Find out what to bring", "Repeat the day and time to confirm"] },

  // ----- Level 2: the tasks you must do every time, and role-plays with a complication -----
  { id: "describe", level: "2", task: "describe", icon: "image", title: "Describe a room",
    you: "Describe the room you work or study in, so the listener can picture it exactly.",
    goals: ["Move through the room in order", "Give sizes, colours and what is in it", "Say what you like and what you would change"], twist: true },
  { id: "story", level: "2", task: "narrate", icon: "book", title: "A day you won't forget",
    you: "Tell the listener about a day you will never forget.",
    goals: ["Give it a beginning, a problem and an ending", "Keep to the past", "Say how you felt and why"] },
  { id: "howto", level: "2", task: "instruct", icon: "list", title: "How to make it",
    you: "Explain how to make your favourite dish to someone who has never cooked it.",
    goals: ["Say what is needed", "Give the steps in order", "Check that the listener followed"] },
  { id: "news", level: "2", task: "report", icon: "news", title: "In the news",
    you: "Tell the listener about something that was in the news this week.",
    goals: ["Say who, what, where and when", "Say why it happened", "Say what may happen next"] },
  { id: "directions", level: "2", task: "problem", icon: "travel", title: "Giving directions",
    you: "A friend has arrived in your city for the first time and is at the train station. Explain how to get to your home.",
    goals: ["Give the route step by step", "Name landmarks they can't miss", "Say how far it is or how long it takes"], twist: true },
  { id: "conference", level: "2", task: "problem", icon: "calendar", title: "Booking a room for a conference",
    you: "You phone a hotel to book a room for a two-day conference for fifty people next month.",
    goals: ["Give the dates and the number of people", "Find out how many the room holds and what equipment it has", "Find out what the price includes", "Ask for a discount"], twist: true },
  { id: "flight", level: "2", task: "problem", icon: "travel", title: "Missed flight",
    you: "You missed your flight and are at the airline's desk in the airport.",
    goals: ["Say briefly what happened", "Find out when the next flight leaves", "Find out what it costs to change", "Find out what happens to your bag"], twist: true },
  { id: "phone", level: "2", task: "problem", icon: "message", title: "Buying by phone",
    you: "You phone a shop about buying a new mobile phone.",
    goals: ["Find out the price", "Find out which colours they have", "Find out about the guarantee", "Arrange how to get it"], twist: true },
  { id: "dinner", level: "2", task: "problem", icon: "food", title: "Planning a dinner",
    you: "You are planning a dinner with colleagues on Friday and ask a friend to recommend a restaurant.",
    goals: ["Explain the occasion and who is coming", "Find out about the food and the price", "Compare two places and choose"], twist: true },
  { id: "luggage", level: "2", task: "problem", icon: "travel", title: "Lost luggage",
    you: "You have landed after a long flight, but your bag never came out. You are at the airline's desk.",
    goals: ["Give your flight and where you flew from", "Describe the bag", "Give your hotel and how long you are staying", "Get a reference number and find out when it will come"], twist: true },
  { id: "nocash", level: "2", task: "problem", icon: "food", title: "No cash at the restaurant",
    you: "You have finished your meal and find the restaurant takes cash only. You have only a card.",
    goals: ["Apologise and explain", "Find out where the nearest cash machine is", "Offer something as a guarantee while you fetch the money"], twist: true },
  { id: "accident", level: "2", task: "problem", icon: "bolt", title: "A car accident",
    you: "You phone the police to report a small car accident you were in.",
    goals: ["Say whether anyone is hurt", "Give the exact place", "Tell what happened, in order", "Find out what to do next"], twist: true },
  { id: "borrowed", level: "2", task: "problem", icon: "computer", title: "You broke what you borrowed",
    you: "You borrowed a friend's laptop and broke it. Now you have to tell them.",
    goals: ["Apologise sincerely", "Tell how it happened", "Offer two or three ways to put it right"], twist: true },
  { id: "booking", level: "2", task: "problem", icon: "home", title: "The booking that isn't there",
    you: "You arrive at a hotel late at night. They can't find your booking, and the hotel is full.",
    goals: ["Explain that you booked, and when", "Turn down the first answer politely", "Agree a way out that you can accept"] },
  { id: "faulty", level: "2", task: "problem", icon: "message", title: "It stopped working",
    you: "The phone you bought two days ago has stopped working. You go back to the shop.",
    goals: ["Say what is wrong and when you bought it", "Ask for a new one or your money back", "Agree what happens next"], twist: true },

  // ----- Level 3: the world, not you -----
  { id: "opinion", level: "3", task: "opinion", icon: "target", title: "Defend an opinion",
    you: "You are asked for your view on a question people disagree about. The listener will push back.",
    goals: ["State your position", "Give a reason and an example", "Grant the other side a point, then answer it", "Sum up in one sentence"] },
  { id: "suppose", level: "3", task: "suppose", icon: "question", title: "What if…",
    you: "You are asked to imagine something that isn't so, and say what would follow.",
    goals: ["Say what would happen first", "Follow it to what that would lead to", "Sum up in one sentence"] },
  { id: "abstract", level: "3", task: "abstract", icon: "sparkle", title: "An idea",
    you: "You are asked about an idea, not a thing: what it means and how people see it differently.",
    goals: ["Say what the idea means", "Set two views of it against each other", "Give one example from real life"] },
  { id: "explain", level: "3", task: "explain", icon: "science", title: "Explain how it works",
    you: "You are asked to explain something complicated to someone who knows nothing about it.",
    goals: ["Name the stages in order", "Say what causes what", "Give a comparison that makes it clear"] },
  { id: "surprise", level: "3", task: "surprise", icon: "bolt", title: "A question you didn't expect",
    you: "You are asked about something you have probably never thought about.",
    goals: ["Put the question in your own words", "Tie it to something you know", "Commit to a view and give a reason"] },
  { id: "partner", level: "3", task: "formal", icon: "calendar", title: "Apologising to a business partner",
    you: "You represent your company at a formal meeting. Your project is months late, and the partner is unhappy.",
    goals: ["Apologise formally for the delay", "Explain what caused it", "Offer a new plan with dates", "Persuade them to carry on working with you"], twist: true },
  { id: "neighbour", level: "3", task: "formal", icon: "home", title: "The noisy neighbour",
    you: "Your neighbour has loud parties every night. You knock on their door to talk about it.",
    goals: ["Raise the problem politely", "Explain how it affects you", "Suggest a compromise", "Leave on good terms"], twist: true },

  // ----- Level 4 -----
  { id: "persuade", level: "4", task: "persuade", icon: "target", title: "Persuade an official",
    you: "You have ten minutes with a government official. Persuade them to pay for foreign-language teaching in schools.",
    goals: ["Open in a way that suits who they are", "Give two arguments that matter to them", "Answer their objection", "Ask for a clear decision"] },
  { id: "condolence", level: "4", task: "formal", icon: "message", title: "Offering condolences",
    you: "A colleague has lost someone in their family. You go to see them.",
    goals: ["Offer your condolences in the proper words", "Speak warmly without prying", "Offer help with something real"] },
  { id: "speech", level: "4", task: "speech", icon: "speak", title: "Say a few words",
    you: "You are asked to stand up and say a few words at an occasion.",
    goals: ["Greet everyone and say why you are gathered", "Thank someone by name", "Add a saying or a quotation", "Close with good wishes"] },
  { id: "proverb", level: "4", task: "abstract", icon: "book", title: "Explain a saying",
    you: "The listener gives you a well-known saying and asks what you make of it.",
    goals: ["Say what the saying means", "Give an example from life", "Say whether you agree, and why"] },
];

const byId = new Map(SCENARIOS.map((s) => [s.id, s]));
/** The conversation with this id, or null. */
export const scenario = (id) => byId.get(id) || null;
/** The conversations of one level, in the list's order. */
export const scenariosOf = (level) => SCENARIOS.filter((s) => s.level === level);
export const levelInfo = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
/** A conversation's goals as the app tracks them: [{id: "g1", text}, …]. */
export const goalsOf = (s) => (s ? s.goals.map((text, i) => ({ id: `g${i + 1}`, text })) : []);
