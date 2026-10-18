-- C1 plan (4 lessons) and C2 plan (2 lessons), library, published. Written by hand; each lesson uses library tasks and practice.
-- Idempotent by title; position = order in the level's plan.
insert into public.study_lessons (author_id, scope, status, title, description, cefr, topic, duration_min, source, position, content)
select (select id from public.profiles where role = 'admin' order by created_at limit 1), 'library', 'published', v.title, v.description, v.cefr, v.topic, v.duration, 'manual', v.pos, v.content::jsonb
from (values
(
  'If I hadn’t…, I wouldn’t be…', 'Connect past choices with present results (and present traits with past events) using mixed conditionals.', 'C1', 'Health', 55, 0,
  $json${"stages": [
    {"kind": "warmup", "title": "Habit check", "minutes": 6,
     "teacher": "Ask: What is the first thing you do in the morning? How did that habit start? Lead students to talk about a past choice and its effect today.",
     "body": "What’s the first thing you do every morning? When and how did that habit start?",
     "examples": ["I check my phone first — I started doing it when I got my first smartphone.", "If I hadn’t got that phone, I probably wouldn’t do it now."], "task_id": null},
    {"kind": "presentation", "title": "Mixed conditionals", "minutes": 12,
     "teacher": "Put the two patterns on a timeline. Pattern 1: past condition → present result. Pattern 2: present (permanent) condition → past result. Contrast with the third conditional, where both halves are past.",
     "body": "**Past condition → present result:**\nIf + **had + past participle**, **would + verb** (now)\nIf I **had studied** medicine, I **would be** a doctor now.\nIf we **hadn’t missed** the flight, we**’d be** in Rome right now.\n\n**Present condition → past result:**\nIf + **past simple** (a permanent fact), **would have + past participle**\nIf I **weren’t** so shy, I **would have spoken** to her at the party.\nIf she **spoke** French, she **would have got** the job.\n\n**Compare:** third conditional — both halves past: If I had studied, I would have passed.\n**Signals:** now, today, these days (present result); then, last year, at the party (past result).",
     "examples": ["If I hadn’t stayed up so late, I wouldn’t be so tired now.", "If he were more organised, he wouldn’t have missed the deadline.", "If they had booked earlier, they would be on holiday now.", "If I weren’t afraid of heights, I would have gone skydiving."], "task_id": null},
    {"kind": "tasks", "title": "Practice: mixed conditionals", "minutes": 12,
     "teacher": "Students do the exercises. For each one, ask them to say what is true in reality.",
     "body": "Choose or write the right forms.", "examples": [], "task_id": "eb8061d0-a045-4d78-a91c-319fac1723d4"},
    {"kind": "practice", "title": "Listening: Why habits are hard to break", "minutes": 12,
     "teacher": "Play the talk twice. Students summarise the habit loop (cue, routine, reward) and write two mixed conditionals about a habit of their own.",
     "body": "Listen to the radio talk and answer the questions. Then write two mixed conditionals about one of your habits.", "examples": [], "task_id": "f3ce99e0-5eae-4cf1-89c9-a5a419b044c2"},
    {"kind": "production", "title": "Life map", "minutes": 10,
     "teacher": "Students draw three turning points of their lives on a line and explain each in two directions: what would be different now, and how their personality changed what happened.",
     "body": "Choose three turning points in your life. For each, say how your life would be different now — and how your personality affected what happened.",
     "examples": ["If I hadn’t moved to Kyiv, I wouldn’t know half of my friends.", "If I were less stubborn, I would have given up the guitar years ago."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework.",
     "body": "Write an opinion paragraph (150 words): “One decision that shaped who I am today.” Use at least three mixed conditionals.",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'Never have I ever…', 'Add drama and emphasis with inversion after negative and limiting expressions: never, rarely, not only, no sooner…', 'C1', 'Culture', 50, 1,
  $json${"stages": [
    {"kind": "warmup", "title": "Movie trailer voice", "minutes": 6,
     "teacher": "Read a dramatic trailer line in a deep voice: “Never before has a hero faced such danger…”. Students guess the genre and try their own trailer line.",
     "body": "Listen to the trailer line. What kind of film is it? Try to say your own dramatic line.",
     "examples": ["Never before has a hero faced such danger.", "Little did they know what was waiting for them."], "task_id": null},
    {"kind": "presentation", "title": "Inversion", "minutes": 12,
     "teacher": "Show that after a negative or limiting phrase at the start, the auxiliary comes before the subject, as in a question. If there is no auxiliary, add do / does / did. Explain the register: formal, dramatic or humorous.",
     "body": "**Negative / limiting phrase at the start + auxiliary + subject:**\nI have never seen such a mess. → **Never have I seen** such a mess.\nShe rarely posts photos. → **Rarely does she post** photos.\n**Common starters:** Never (before), Rarely, Seldom, Hardly… when, No sooner… than, Not only… but also, Only then, Not until, Little, Under no circumstances.\n**No sooner had we left than** it started to rain.\n**Not only did he forget** the tickets, **but** he **also** lost his phone.\n**Not until** midnight **did** he finish.\nNo negative phrase at the start → no inversion: I have never seen…\n**Register:** formal writing, speeches, storytelling — or for fun in speech.",
     "examples": ["Little did she know about the surprise party.", "Under no circumstances should you share your password.", "Hardly had I got home when my friend called.", "Only then did we understand the problem."], "task_id": null},
    {"kind": "tasks", "title": "Practice: inversion", "minutes": 14,
     "teacher": "Students do the exercises. Ask them to say the neutral version of each sentence too.",
     "body": "Choose or write the inverted form.", "examples": [], "task_id": "4ed8ca4f-c854-4bf6-bb7d-b51a2afdc53d"},
    {"kind": "production", "title": "Dramatic reviews", "minutes": 15,
     "teacher": "Groups write an over-the-top dramatic review of something ordinary (the school canteen, a bus ride, a rainy Monday) using at least four inversions. They perform it like a movie trailer.",
     "body": "Write a dramatic review of something ordinary (the canteen, a bus ride, a Monday) with at least four inversions. Perform it like a trailer.",
     "examples": ["Never have I tasted soup so… brave.", "Not only was the bus late, but it also took us to the wrong city."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework.",
     "body": "Write the opening paragraph of a thriller or fantasy story (120 words) that uses at least three different inversions.",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'What I really mean is…', 'Put the focus where you want it with cleft sentences: It was… that…, What I need is…, All I did was…', 'C1', 'Daily Life', 50, 2,
  $json${"stages": [
    {"kind": "warmup", "title": "That’s not what I said!", "minutes": 6,
     "teacher": "Say a false statement about a student playfully (“Max ate all the cookies yesterday”). The student corrects it with stress: “It wasn’t me, it was Anna!” Repeat a few times; point out how the correction is built.",
     "body": "Correct the teacher’s “facts” with the right information.",
     "examples": ["It wasn’t me who ate the cookies — it was Anna!", "It was on Friday that we met, not on Monday."], "task_id": null},
    {"kind": "presentation", "title": "Cleft sentences", "minutes": 12,
     "teacher": "Show how one neutral sentence becomes several cleft sentences, each putting the focus on a different part. Practise the stress in speech.",
     "body": "**Neutral:** Tom broke the window on Friday.\n**It-cleft** — It + be + focus + that / who:\n**It was Tom who** broke the window. (not someone else)\n**It was on Friday that** he broke it. (not another day)\n**What-cleft** — What + clause + be + focus:\n**What I need is** a long holiday.\n**What annoys me is** people talking during films.\n**All-cleft** — something small or simple:\n**All I did was** ask a question!\n**The thing / The reason / The place…**: **The reason I’m late is** that the bus broke down.\nIt-clefts use **that / who**, never what: It is the noise ~~what~~ **that** bothers me.",
     "examples": ["What I love about summer is the long evenings.", "It was my sister who told everyone, not me.", "All I want is some peace and quiet.", "The place where I feel calm is the library."], "task_id": null},
    {"kind": "tasks", "title": "Practice: cleft sentences", "minutes": 14,
     "teacher": "Students do the exercises. Then ask them to say the neutral version of each sentence.",
     "body": "Choose or write the cleft sentence.", "examples": [], "task_id": "3191b892-b660-4658-b717-9a1734eddc99"},
    {"kind": "production", "title": "Rumour control", "minutes": 15,
     "teacher": "Give pairs a card with a light, invented “rumour” about a fictional school or celebrity (“The band split because the drummer lost the van keys”). Pairs prepare a “press statement” correcting it with cleft sentences.",
     "body": "Read the rumour and write a short press statement that corrects it. Use it-clefts, what-clefts and all-clefts.",
     "examples": ["It wasn’t the drummer who lost the keys — it was the manager.", "What really happened is that we decided to take a break.", "All we did was postpone one concert."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework.",
     "body": "Write about your hobby or favourite place (120 words) using at least four cleft sentences: What I love about…, It was … that…, The reason…, All I…",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'Having read the review…', 'Write and speak more fluently with participle clauses: -ing, -ed and having done.', 'C1', 'Culture', 55, 3,
  $json${"stages": [
    {"kind": "warmup", "title": "Shorter, please", "minutes": 6,
     "teacher": "Write a long, clumsy sentence on the board: “Because I felt tired and because I wanted to rest, I went home and I went to bed.” Ask students to make it shorter and more elegant.",
     "body": "Make this sentence shorter and more elegant: “Because I felt tired, I went home, and then I went to bed.”",
     "examples": ["Feeling tired, I went home and straight to bed."], "task_id": null},
    {"kind": "presentation", "title": "Participle clauses", "minutes": 12,
     "teacher": "Show the three forms and what they mean. Stress the rule that the subject of both parts must be the same (otherwise the sentence becomes funny or wrong).",
     "body": "**-ing (active, at the same time / reason):**\n**Opening** the door, she saw a huge spider.\n**Not knowing** what to say, he stayed silent.\n**-ed (passive meaning):**\n**Built** in 1889, the Eiffel Tower is now a symbol of Paris.\n**Shocked** by the news, he called his mum.\n**Having + past participle (one action before another):**\n**Having finished** her homework, she went out.\n**Reduced relative clauses:** The girl **sitting** next to Sam… / The film **directed** by her…\n**Same subject!** ~~Walking home, the rain started.~~ → Walking home, **I** got caught in the rain.",
     "examples": ["Grabbing my bag, I ran to the bus.", "Released in 2020, the album became a huge hit.", "Having lost my keys, I had to wait outside.", "Most of the people invited to the party were students."], "task_id": null},
    {"kind": "tasks", "title": "Practice: participle clauses", "minutes": 12,
     "teacher": "Students do the exercises. For each one ask: active or passive? at the same time or before?",
     "body": "Choose or write the participle clause.", "examples": [], "task_id": "07e0e5f4-eb9b-48ee-98e7-be0260646bf1"},
    {"kind": "practice", "title": "Reading: The Glass Orchard", "minutes": 12,
     "teacher": "Read the review. Students find every participle clause and rewrite two of them as full clauses to see the difference in style.",
     "body": "Read the book review and answer the questions. Then find the participle clauses.", "examples": [], "task_id": "5c6e5b56-10ea-4ae4-ad95-2b83b4f3a5dd"},
    {"kind": "production", "title": "Mini-review", "minutes": 10,
     "teacher": "Students write and read a 5-sentence review of a series, game or album they love, using at least three participle clauses. The class guesses what it is before the title is revealed.",
     "body": "Write a 5-sentence review of a series, game or album (don’t say the title). Use at least three participle clauses. Can the class guess it?",
     "examples": ["Set in a small town in the 80s, the series follows a group of friends…", "Having watched every season twice, I can say…"], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework. The review from the lesson is the model.",
     "body": "Write a full review (180–200 words) of a book, film or game, using participle clauses to make the text concise.",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'I insist that he be on time', 'Use the subjunctive in formal English: after suggest, insist, recommend, it is essential that — and in fixed phrases.', 'C2', 'Basic Words', 50, 0,
  $json${"stages": [
    {"kind": "warmup", "title": "Official rules", "minutes": 6,
     "teacher": "Show (or read) two versions of a rule: “Students should bring their ID” and “It is essential that every student bring their ID.” Ask: Where would you see each one? What is strange about “bring” in the second?",
     "body": "Compare: “Students should bring their ID.” and “It is essential that every student bring their ID.” Where would you see each? What is unusual in the second one?",
     "examples": ["The second one sounds like an official letter.", "It says “bring”, not “brings”."], "task_id": null},
    {"kind": "presentation", "title": "The subjunctive", "minutes": 12,
     "teacher": "Show that the subjunctive is simply the base form for every subject, used after verbs and adjectives of demand, suggestion and importance. Show the negative without do, the past subjunctive were, and the British alternative with should.",
     "body": "**Base form for every subject** after verbs of demand / suggestion:\nsuggest, insist, recommend, demand, request, propose, ask + **that**\nThe doctor recommended that he **drink** more water. (not drinks)\nShe insisted that he **leave** immediately.\n**After adjectives of importance:** It is **essential / vital / important / crucial** that…\nIt is vital that she **be** informed.\n**Negative:** not + base form, no do: We demand that the company **not raise** prices.\n**Past subjunctive:** If I **were** you…, I wish it **were** Friday.\n**Fixed phrases:** Be that as it may · Come what may · God save the King · So be it.\n**British alternative:** I suggest that he **should apply** / that he **applies** (informal).",
     "examples": ["The coach insisted that every player be on time.", "I suggest that she apply for the scholarship.", "It is crucial that the data not be shared.", "Come what may, I’ll finish this project."], "task_id": null},
    {"kind": "tasks", "title": "Practice: the subjunctive", "minutes": 14,
     "teacher": "Students do the exercises. Ask: which word triggers the subjunctive?",
     "body": "Choose or write the subjunctive form.", "examples": [], "task_id": "f7cc98ad-252c-4461-aff6-f4eae52520ea"},
    {"kind": "production", "title": "The council meeting", "minutes": 15,
     "teacher": "Role-play a youth council meeting about a local problem (no skatepark, the library closes too early, too little green space). Each “member” makes formal proposals with the subjunctive; the group votes on a final resolution read aloud.",
     "body": "Role-play a youth council meeting. Make formal proposals and write a final resolution using the subjunctive.",
     "examples": ["I propose that the library stay open until nine.", "It is essential that young people be consulted.", "We therefore recommend that the council build a skatepark."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework.",
     "body": "Write a formal letter (150–180 words) to a school, club or local council recommending a change. Use the subjunctive at least four times.",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'It would seem that…', 'Sound careful, polite and academic with hedging: it seems, tend to, may suggest, arguably, somewhat.', 'C2', 'Culture', 55, 1,
  $json${"stages": [
    {"kind": "warmup", "title": "Too direct?", "minutes": 6,
     "teacher": "Read very direct statements: “Your essay is bad.” “Teenagers are lazy.” “This study proves that phones cause stress.” Ask: How do they sound? How could you say them more carefully?",
     "body": "How do these sentences sound? Say them more carefully: “Your essay is bad.” “Teenagers are lazy.” “This study proves that phones cause stress.”",
     "examples": ["Your essay could be a little stronger.", "Some studies suggest that phones may be linked to stress."], "task_id": null},
    {"kind": "presentation", "title": "Hedging", "minutes": 12,
     "teacher": "Group the hedging tools: verbs, modals, adverbs, quantifiers, introductory phrases and softening negatives. Explain when NOT to hedge: instructions, emergencies, facts you are sure of. Warn about over-hedging.",
     "body": "**Verbs:** seem, appear, tend, suggest, indicate — The data **appear to indicate** a link.\n**Modals:** may, might, could, would — This **may** explain the result.\n**Introductory phrases:** It would seem that… · It could be argued that… · There is some evidence that…\n**Adverbs:** arguably, possibly, apparently, largely, relatively\n**Quantifiers:** some, many, a number of — **Many** (not all) teenagers…\n**Softening:** somewhat, a bit, slightly · not entirely / not quite: That’s **not quite** right.\n**When not to hedge:** instructions, safety, facts you know.\n**Too much is evasive:** ~~It might perhaps possibly seem that…~~",
     "examples": ["It would seem that the results are not as good as we expected.", "Teenagers tend to spend more time online than adults.", "This may suggest that the theory needs revising.", "Your argument is somewhat convincing, but the ending isn’t quite clear."], "task_id": null},
    {"kind": "tasks", "title": "Practice: hedging and softening", "minutes": 12,
     "teacher": "Students do the exercises. For each answer ask: does it make the claim stronger or softer?",
     "body": "Choose or write the softer, more careful version.", "examples": [], "task_id": "0062d21d-f422-4aa4-9d91-2566698e63d8"},
    {"kind": "practice", "title": "Reading: Why bad news sticks", "minutes": 12,
     "teacher": "Read the article. Students underline every hedge and discuss why the writer chose to be careful in each place.",
     "body": "Read the article and answer the questions. Then find the phrases the writer uses to sound careful.", "examples": [], "task_id": "e855536b-c680-4dac-87bb-07b8918e29c3"},
    {"kind": "production", "title": "Kind feedback", "minutes": 10,
     "teacher": "Students exchange a short piece of writing (homework or a paragraph written now) and give feedback using hedging: one strength, two careful suggestions. Then they rewrite one blunt sentence of their own as a hedged one.",
     "body": "Give a classmate feedback on their paragraph: one strength and two careful suggestions. Use hedging to stay kind and clear.",
     "examples": ["The introduction is really engaging.", "The second paragraph could perhaps be a little shorter.", "I’m not entirely sure the example fits the point."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 3,
     "teacher": "Explain the homework.",
     "body": "Write a short academic-style paragraph (150 words) on a debatable topic (e.g. “Social media makes us lonely”). Present the evidence carefully using at least six hedges.",
     "examples": [], "task_id": null}
  ]}$json$
)
) as v(title, description, cefr, topic, duration, pos, content)
where not exists (select 1 from public.study_lessons s where s.title = v.title and s.scope = 'library');
