-- The first two full lessons (library, published). Written by hand; they use library tasks and practice.
-- Idempotent by title.
insert into public.study_lessons (author_id, scope, status, title, description, cefr, topic, duration_min, source, content)
select (select id from public.profiles where role = 'admin' order by created_at limit 1), 'library', 'published', v.title, v.description, v.cefr, v.topic, v.duration, 'manual', v.content::jsonb
from (values
(
  'Me and my family', 'Talk about yourself and your family with the verb “to be”: am, is, are.', 'A1', 'Family', 45,
  $json${"stages": [
    {"kind": "warmup", "title": "Hello!", "minutes": 5,
     "teacher": "Greet the students and ask each of them 2–3 questions. Help them answer with full sentences, not one word.",
     "body": "Answer the questions:\n• What’s your name?\n• How old are you?\n• Where are you from?",
     "examples": ["My name is Anna.", "I am ten years old.", "I am from Ukraine."], "task_id": null},
    {"kind": "presentation", "title": "The verb “to be”", "minutes": 10,
     "teacher": "Write the table on the board. Show that “am” goes only with I, “is” with he / she / it, and “are” with you / we / they. Practise the short forms aloud.",
     "body": "**I am** (I’m) a student.\n**He / She / It is** (he’s, she’s, it’s) at home.\n**You / We / They are** (you’re, we’re, they’re) friends.\n\n**Negative:** add **not** — I am not, she is not (isn’t), they are not (aren’t).\n**Question:** put the verb first — **Are** you happy? **Is** she at home?",
     "examples": ["I am Tom. I’m eleven.", "My sister is a doctor.", "We are friends.", "Is your dog big? — Yes, it is.", "They aren’t at school today."], "task_id": null},
    {"kind": "tasks", "title": "Practice: am, is, are", "minutes": 12,
     "teacher": "Students do the exercises one by one. After each answer, ask why it is am, is or are.",
     "body": "Choose or write the right form of “to be”.", "examples": [], "task_id": "38de26ca-4c33-4c2a-b59f-d75bb7c353da"},
    {"kind": "practice", "title": "Listening: Meet my family", "minutes": 10,
     "teacher": "Play the recording twice. First time: just listen. Second time: answer the questions. Then look at the script together.",
     "body": "Listen to a boy talking about his family and answer the questions.", "examples": [], "task_id": "94c75c1d-1aae-4d64-a3ad-fc7df948614b"},
    {"kind": "production", "title": "Your family", "minutes": 6,
     "teacher": "Each student tells about 3 family members with is / are. The others listen and ask one question each.",
     "body": "Tell about your family in 3–4 sentences.\nMy mum is … My brother is … years old. We are …",
     "examples": ["My mum is a teacher.", "My brother is twelve years old.", "My grandparents are from Lviv."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 2,
     "teacher": "Explain the homework and show an example.",
     "body": "Write 5 sentences about your family or friends with am / is / are. You can draw a family tree too!",
     "examples": [], "task_id": null}
  ]}$json$
),
(
  'My weekend', 'Tell what you did last weekend with the Past Simple: regular and irregular verbs, didn’t and Did …?', 'A2', 'Travel', 50,
  $json${"stages": [
    {"kind": "warmup", "title": "Weekend talk", "minutes": 5,
     "teacher": "Students talk in pairs for 2–3 minutes. Walk around and note mistakes with past forms — use them in the next stage.",
     "body": "Talk in pairs:\n• What did you do last weekend?\n• Did you go anywhere?\n• What was the best moment?",
     "examples": ["I visited my grandma.", "We went to the park.", "The best moment was the football match."], "task_id": null},
    {"kind": "presentation", "title": "Past Simple", "minutes": 10,
     "teacher": "Show regular and irregular verbs. Remind them: after did / didn’t the verb has no -ed and no past form — “Did you go?”, not “Did you went?”.",
     "body": "**Regular verbs:** add **-ed** — visit → visited, watch → watched, play → played.\n**Irregular verbs** have their own past form — go → went, buy → bought, see → saw, have → had.\n**Negative:** didn’t + verb — I **didn’t call** him.\n**Question:** Did + person + verb — **Did** you **see** my message?\nTime words: yesterday, last night, last week, on Saturday, two days ago.",
     "examples": ["Yesterday I watched a film.", "We went to the cinema last night.", "She didn’t buy the dress.", "Did you see Tom on Saturday? — Yes, I did."], "task_id": null},
    {"kind": "tasks", "title": "Practice: Past Simple", "minutes": 12,
     "teacher": "Do the exercises together. Ask students to say if each verb is regular or irregular.",
     "body": "Match, choose and write the right past forms.", "examples": [], "task_id": "8a0861c7-0d35-48e9-be8a-52b9af34840f"},
    {"kind": "practice", "title": "Reading: A weekend in Edinburgh", "minutes": 13,
     "teacher": "Read the email together. Students underline every Past Simple verb on the board, then answer the questions.",
     "body": "Read Jess’s email and answer the questions.", "examples": [], "task_id": "d88b3cca-4a71-4013-bfa2-2ff98ecc0107"},
    {"kind": "production", "title": "Your weekend", "minutes": 8,
     "teacher": "Students tell or write 5 sentences. Ask follow-up questions with “Did you …?”.",
     "body": "Tell about your last weekend in 5 sentences. Use at least 3 irregular verbs.",
     "examples": ["On Saturday I went to the cinema.", "I didn’t do my homework on Sunday!", "We had pizza for dinner."], "task_id": null},
    {"kind": "homework", "title": "Homework", "minutes": 2,
     "teacher": "Explain the homework; Jess’s email is the model.",
     "body": "Write a short email (60–80 words) to a friend about your last weekend, like Jess’s email.",
     "examples": [], "task_id": null}
  ]}$json$
)
) as v(title, description, cefr, topic, duration, content)
where not exists (select 1 from public.study_lessons s where s.title = v.title and s.scope = 'library');
