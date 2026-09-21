-- ============================================================
-- EngLear — configurable admin bootstrap + full dictionary.
-- Idempotent. Run after 0001 and 0002.
-- ============================================================

create extension if not exists pg_trgm;

-- ============================================================
-- 1) CONFIGURABLE ADMIN EMAIL (single source of truth in DB)
--    Change the email here to move the admin account.
-- ============================================================
create or replace function public.admin_email()
returns text language sql immutable as $$
  select lower('leracheshkaaa@gmail.com');
$$;

-- New users get admin only if their email matches admin_email(); everyone
-- else is a student. (Replaces the hard-coded email from 0002.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := 'student';
begin
  if lower(new.email) = public.admin_email() then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, full_name, role, avatar)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    v_role,
    coalesce(nullif(new.raw_user_meta_data->>'avatar',''), 'cat')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Self-heal: an authenticated caller whose email matches admin_email() can
-- promote their own profile to admin. Safe because it verifies the JWT email
-- server-side; nobody else can pass this check. Uses a transaction-local flag
-- so protect_role permits exactly this one promotion.
create or replace function public.claim_admin()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if v_email = '' or v_email <> public.admin_email() then
    return coalesce(public.is_admin(), false);
  end if;
  perform set_config('englear.claiming_admin', '1', true);
  update public.profiles set role = 'admin' where id = auth.uid() and role <> 'admin';
  perform set_config('englear.claiming_admin', '0', true);
  return true;
end $$;
grant execute on function public.claim_admin() to authenticated;

-- protect_role: block self role changes for non-admins, EXCEPT the admin
-- self-heal performed inside claim_admin() (guarded by the transaction flag).
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_admin()
     and coalesce(current_setting('englear.claiming_admin', true), '0') <> '1' then
    new.role := old.role;
  end if;
  return new;
end $$;

-- Promote an already-existing admin account right now (service role -> allowed).
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = public.admin_email()
   and p.role <> 'admin';

-- ============================================================
-- 2) DICTIONARY: extend the existing table (no duplicate system)
-- ============================================================
alter table public.dictionary_words add column if not exists definition text default '';
alter table public.dictionary_words add column if not exists examples jsonb not null default '[]'::jsonb;
alter table public.dictionary_words add column if not exists meanings jsonb not null default '[]'::jsonb;
alter table public.dictionary_words add column if not exists topic text not null default 'Other';
alter table public.dictionary_words add column if not exists related jsonb not null default '[]'::jsonb;
alter table public.dictionary_words add column if not exists word_type text not null default 'word';
alter table public.dictionary_words add column if not exists ielts_category text;

-- word_type allow-list. Drop-then-add (instead of "add ... exception when
-- duplicate_object") so a rerun always reasserts the CURRENT allow-list,
-- which includes 'verb' (used by academic-verb seed rows like "analyse").
alter table public.dictionary_words drop constraint if exists dictionary_words_word_type_chk;
alter table public.dictionary_words
  add constraint dictionary_words_word_type_chk
  check (word_type in ('word','collocation','phrasal_verb','verb'));

create index if not exists idx_dict_topic     on public.dictionary_words(topic);
create index if not exists idx_dict_cefr      on public.dictionary_words(cefr_level);
create index if not exists idx_dict_wordtype  on public.dictionary_words(word_type);
create index if not exists idx_dict_ielts     on public.dictionary_words(ielts_category);

-- Trigram indexes for fast ILIKE search. pg_trgm lives in the "extensions"
-- schema on Supabase (not on the SQL Editor search_path), so the gin_trgm_ops
-- operator class must be schema-qualified. Detect the real schema at runtime
-- so this works no matter where the extension was installed.
do $$
declare ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  if ext_schema is not null then
    execute format(
      'create index if not exists idx_dict_word_trgm on public.dictionary_words using gin (word %I.gin_trgm_ops)',
      ext_schema);
    execute format(
      'create index if not exists idx_dict_tr_trgm on public.dictionary_words using gin (translation %I.gin_trgm_ops)',
      ext_schema);
  end if;
end $$;

-- Dictionary is GLOBAL, admin-managed. Teachers may NOT edit it.
drop policy if exists dict_insert on public.dictionary_words;
create policy dict_insert on public.dictionary_words for insert with check (public.is_admin());
drop policy if exists dict_update on public.dictionary_words;
create policy dict_update on public.dictionary_words for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists dict_delete on public.dictionary_words;
create policy dict_delete on public.dictionary_words for delete using (public.is_admin());
-- dict_select stays: readable by everyone (incl. anon).

-- ============================================================
-- 3) USER LEVEL (translation-by-level UI setting)
-- ============================================================
alter table public.user_settings add column if not exists english_level text not null default 'A1';
do $$ begin
  alter table public.user_settings
    add constraint user_settings_level_chk
    check (english_level in ('A0','A1','A2','B1','B2','C1','C2'));
exception when duplicate_object then null; end $$;

-- ============================================================
-- 4) SEED: large starter dictionary (reproducible, no duplicates)
--    Columns: word, translation, pronunciation, part_of_speech,
--             definition, examples, cefr_level, topic, word_type
-- ============================================================
insert into public.dictionary_words
  (word, translation, pronunciation, part_of_speech, definition, examples, cefr_level, topic, word_type)
values
-- ---- Family / People ----
('mother','мама','/ˈmʌðər/','noun','A female parent.','["My mother is a teacher.","She looks like her mother."]','A1','Family','word'),
('father','папа','/ˈfɑːðər/','noun','A male parent.','["His father works at a bank."]','A1','Family','word'),
('sister','сестра','/ˈsɪstər/','noun','A girl or woman with the same parents as you.','["I have two sisters."]','A1','Family','word'),
('brother','брат','/ˈbrʌðər/','noun','A boy or man with the same parents as you.','["My brother is older than me."]','A1','Family','word'),
('parent','родитель','/ˈpeərənt/','noun','A mother or father.','["Both parents came to the meeting."]','A2','Family','word'),
('child','ребёнок','/tʃaɪld/','noun','A young human being.','["The child is playing outside."]','A1','Family','word'),
('neighbour','сосед','/ˈneɪbər/','noun','A person who lives near you.','["Our neighbours are very friendly."]','A2','People','word'),
('friend','друг','/frend/','noun','A person you like and know well.','["She is my best friend."]','A1','People','word'),
('adult','взрослый','/ˈædʌlt/','noun','A fully grown person.','["Tickets are cheaper for adults."]','A2','People','word'),
('colleague','коллега','/ˈkɒliːɡ/','noun','A person you work with.','["My colleague helped me finish the report."]','B1','People','word'),
-- ---- Home ----
('house','дом','/haʊs/','noun','A building where people live.','["This is my house.","They bought a new house."]','A1','Home','word'),
('room','комната','/ruːm/','noun','A part of a building with walls.','["My room is small but cosy."]','A1','Home','word'),
('kitchen','кухня','/ˈkɪtʃɪn/','noun','A room where you cook food.','["She is cooking in the kitchen."]','A1','Home','word'),
('window','окно','/ˈwɪndəʊ/','noun','An opening in a wall with glass.','["Open the window, please."]','A1','Home','word'),
('door','дверь','/dɔːr/','noun','A movable part you open to enter a room.','["Close the door quietly."]','A1','Home','word'),
('furniture','мебель','/ˈfɜːnɪtʃər/','noun','Tables, chairs and other movable objects in a home.','["We bought new furniture for the living room."]','B1','Home','word'),
('ceiling','потолок','/ˈsiːlɪŋ/','noun','The top inner surface of a room.','["The ceiling is very high."]','B1','Home','word'),
-- ---- Food / Cooking ----
('bread','хлеб','/bred/','noun','A basic food made from flour.','["I bought fresh bread."]','A1','Food','word'),
('water','вода','/ˈwɔːtər/','noun','A clear liquid you drink.','["I drink a lot of water."]','A1','Food','word'),
('apple','яблоко','/ˈæpl/','noun','A round fruit that is red or green.','["An apple a day keeps you healthy."]','A1','Food','word'),
('vegetable','овощ','/ˈvedʒtəbl/','noun','A plant used as food.','["Eat more vegetables."]','A2','Food','word'),
('breakfast','завтрак','/ˈbrekfəst/','noun','The first meal of the day.','["I have breakfast at seven."]','A1','Food','word'),
('recipe','рецепт','/ˈresəpi/','noun','Instructions for cooking a dish.','["This recipe is easy to follow."]','B1','Cooking','word'),
('boil','кипятить','/bɔɪl/','verb','To heat a liquid until it bubbles.','["Boil the water before adding pasta."]','A2','Cooking','word'),
('fry','жарить','/fraɪ/','verb','To cook food in hot oil.','["Fry the onions for two minutes."]','A2','Cooking','word'),
('delicious','вкусный','/dɪˈlɪʃəs/','adjective','Having a very pleasant taste.','["The soup was delicious."]','A2','Food','word'),
-- ---- Animals / Nature ----
('cat','кот','/kæt/','noun','A small animal often kept as a pet.','["The cat is sleeping."]','A0','Animals','word'),
('dog','собака','/dɒɡ/','noun','A common animal kept as a pet.','["The dog is very friendly."]','A0','Animals','word'),
('bird','птица','/bɜːd/','noun','An animal with wings and feathers.','["A bird is singing outside."]','A1','Animals','word'),
('tree','дерево','/triː/','noun','A tall plant with a trunk and branches.','["There is a big tree in the garden."]','A1','Nature','word'),
('river','река','/ˈrɪvər/','noun','A large natural stream of water.','["We swam in the river."]','A2','Nature','word'),
('mountain','гора','/ˈmaʊntən/','noun','A very high area of land.','["They climbed the mountain."]','A2','Nature','word'),
('forest','лес','/ˈfɒrɪst/','noun','A large area covered with trees.','["The forest is quiet at night."]','A2','Nature','word'),
-- ---- Body / Health ----
('head','голова','/hed/','noun','The top part of the body.','["My head hurts."]','A1','Body','word'),
('hand','рука','/hænd/','noun','The part of the body at the end of the arm.','["Wash your hands before eating."]','A1','Body','word'),
('heart','сердце','/hɑːt/','noun','The organ that pumps blood.','["Running is good for your heart."]','A2','Body','word'),
('doctor','врач','/ˈdɒktər/','noun','A person trained to treat sick people.','["You should see a doctor."]','A1','Health','word'),
('medicine','лекарство','/ˈmedsn/','noun','A substance used to treat illness.','["Take this medicine twice a day."]','A2','Health','word'),
('healthy','здоровый','/ˈhelθi/','adjective','In good health; good for you.','["She lives a healthy life."]','A2','Health','word'),
-- ---- Clothes / Shopping / Money ----
('shirt','рубашка','/ʃɜːt/','noun','A piece of clothing for the upper body.','["He wore a white shirt."]','A1','Clothes','word'),
('shoes','обувь','/ʃuːz/','noun','Things you wear on your feet.','["These shoes are too small."]','A1','Clothes','word'),
('shop','магазин','/ʃɒp/','noun','A place where you buy things.','["The shop opens at nine."]','A1','Shopping','word'),
('price','цена','/praɪs/','noun','The amount of money for something.','["The price is too high."]','A2','Money','word'),
('money','деньги','/ˈmʌni/','noun','Coins and notes used to buy things.','["I do not have much money."]','A1','Money','word'),
('expensive','дорогой','/ɪkˈspensɪv/','adjective','Costing a lot of money.','["This phone is very expensive."]','A2','Shopping','word'),
('afford','позволить себе','/əˈfɔːd/','verb','To have enough money for something.','["We cannot afford a new car."]','B1','Money','word'),
-- ---- City / Places / Transport / Travel ----
('city','город','/ˈsɪti/','noun','A large town.','["London is a big city."]','A1','City','word'),
('street','улица','/striːt/','noun','A road in a town with houses.','["Cross the street carefully."]','A1','City','word'),
('station','станция','/ˈsteɪʃn/','noun','A place where trains or buses stop.','["The station is near the hotel."]','A2','Transport','word'),
('airport','аэропорт','/ˈeəpɔːt/','noun','A place where planes take off and land.','["We arrived at the airport early."]','A2','Travel','word'),
('ticket','билет','/ˈtɪkɪt/','noun','A paper that allows you to travel or enter.','["I bought a ticket to Paris."]','A2','Travel','word'),
('journey','поездка','/ˈdʒɜːni/','noun','An act of travelling from one place to another.','["The journey took six hours."]','B1','Travel','word'),
('luggage','багаж','/ˈlʌɡɪdʒ/','noun','Bags and cases for travelling.','["Do not leave your luggage alone."]','B1','Travel','word'),
-- ---- Weather / Time ----
('rain','дождь','/reɪn/','noun','Water that falls from the sky.','["The rain stopped in the afternoon."]','A1','Weather','word'),
('sun','солнце','/sʌn/','noun','The star that gives light to Earth.','["The sun is very bright today."]','A1','Weather','word'),
('cold','холодный','/kəʊld/','adjective','Having a low temperature.','["It is cold outside."]','A1','Weather','word'),
('morning','утро','/ˈmɔːnɪŋ/','noun','The early part of the day.','["I run every morning."]','A1','Time','word'),
('week','неделя','/wiːk/','noun','A period of seven days.','["See you next week."]','A1','Time','word'),
('early','рано','/ˈɜːli/','adverb','Before the usual time.','["She arrived early."]','A2','Time','word'),
-- ---- Emotions / Relationships ----
('happy','счастливый','/ˈhæpi/','adjective','Feeling or showing pleasure.','["We are a happy family."]','A1','Emotions','word'),
('sad','грустный','/sæd/','adjective','Feeling unhappy.','["She felt sad after the film."]','A1','Emotions','word'),
('afraid','испуганный','/əˈfreɪd/','adjective','Feeling fear.','["He is afraid of dogs."]','A2','Emotions','word'),
('proud','гордый','/praʊd/','adjective','Feeling pleased about something you did.','["I am proud of my team."]','B1','Emotions','word'),
('trust','доверять','/trʌst/','verb','To believe someone is honest.','["I trust my friends."]','B1','Relationships','word'),
-- ---- Daily Life / School / Education / University ----
('sleep','спать','/sliːp/','verb','To rest with your eyes closed.','["I sleep eight hours."]','A1','Daily Life','word'),
('clean','убирать','/kliːn/','verb','To remove dirt.','["I clean my room on Sunday."]','A1','Daily Life','word'),
('teacher','учитель','/ˈtiːtʃər/','noun','A person who teaches.','["Our teacher is very kind."]','A1','School','word'),
('lesson','урок','/ˈlesn/','noun','A period of learning.','["The lesson starts at nine."]','A1','School','word'),
('homework','домашнее задание','/ˈhəʊmwɜːk/','noun','School work done at home.','["I finished my homework."]','A1','School','word'),
('exam','экзамен','/ɪɡˈzæm/','noun','An official test of knowledge.','["She passed the exam."]','A2','Education','word'),
('degree','степень','/dɪˈɡriː/','noun','A qualification from a university.','["He has a degree in biology."]','B1','University','word'),
('research','исследование','/rɪˈsɜːtʃ/','noun','Careful study to find new facts.','["Her research is about clean energy."]','B2','University','word'),
-- ---- Work / Business ----
('job','работа','/dʒɒb/','noun','Work that you do for money.','["She found a new job."]','A1','Work','word'),
('office','офис','/ˈɒfɪs/','noun','A place where people work at desks.','["The office is on the third floor."]','A2','Work','word'),
('meeting','встреча','/ˈmiːtɪŋ/','noun','An event where people come together.','["The meeting is at noon."]','A2','Work','word'),
('salary','зарплата','/ˈsæləri/','noun','Money you receive for your job.','["He earns a good salary."]','B1','Work','word'),
('customer','клиент','/ˈkʌstəmər/','noun','A person who buys goods or services.','["The customer asked for a refund."]','B1','Business','word'),
('profit','прибыль','/ˈprɒfɪt/','noun','Money gained in business.','["The company made a large profit."]','B2','Business','word'),
-- ---- Technology / Internet / Media ----
('computer','компьютер','/kəmˈpjuːtər/','noun','An electronic machine for data.','["I work on my computer all day."]','A1','Technology','word'),
('phone','телефон','/fəʊn/','noun','A device used to talk to people.','["My phone is out of battery."]','A1','Technology','word'),
('website','сайт','/ˈwebsaɪt/','noun','A set of pages on the internet.','["Visit our website for details."]','A2','Internet','word'),
('download','скачивать','/ˌdaʊnˈləʊd/','verb','To copy data from the internet.','["Download the app for free."]','A2','Internet','word'),
('software','программное обеспечение','/ˈsɒftweər/','noun','Programs used by a computer.','["The software needs an update."]','B1','Technology','word'),
('device','устройство','/dɪˈvaɪs/','noun','A machine made for a purpose.','["This device saves energy."]','B1','Technology','word'),
-- ---- Society / Science / Culture / Environment ----
('law','закон','/lɔː/','noun','A rule made by a government.','["Everyone must obey the law."]','B1','Society','word'),
('government','правительство','/ˈɡʌvənmənt/','noun','The group that controls a country.','["The government raised taxes."]','B1','Society','word'),
('experiment','эксперимент','/ɪkˈsperɪmənt/','noun','A scientific test.','["They ran a careful experiment."]','B1','Science','word'),
('theory','теория','/ˈθɪəri/','noun','An idea used to explain something.','["The theory explains the results."]','B2','Science','word'),
('tradition','традиция','/trəˈdɪʃn/','noun','A custom passed through generations.','["It is a family tradition."]','B1','Culture','word'),
('pollution','загрязнение','/pəˈluːʃn/','noun','Harmful substances in the environment.','["Air pollution is a serious problem."]','B1','Environment','word')
on conflict (word) do nothing;

-- ---- IELTS / higher-level academic vocabulary (with ielts_category) ----
insert into public.dictionary_words
  (word, translation, pronunciation, part_of_speech, definition, examples, cefr_level, topic, word_type, ielts_category)
values
('significant','значительный','/sɪɡˈnɪfɪkənt/','adjective','Large enough to be noticed or important.','["There was a significant increase in sales."]','B2','Society','word','Academic Vocabulary'),
('consequence','последствие','/ˈkɒnsɪkwəns/','noun','A result of an action.','["Pollution has serious consequences."]','B2','Environment','word','Environment'),
('sustainable','устойчивый','/səˈsteɪnəbl/','adjective','Able to continue without harming the environment.','["We need sustainable energy sources."]','C1','Environment','word','Environment'),
('efficient','эффективный','/ɪˈfɪʃnt/','adjective','Working well without wasting resources.','["Electric cars are more efficient."]','B2','Technology','word','Technology'),
('curriculum','учебный план','/kəˈrɪkjələm/','noun','The subjects studied in a course.','["The curriculum includes science and art."]','C1','Education','word','Education'),
('economy','экономика','/ɪˈkɒnəmi/','noun','The system of money and trade in a country.','["The economy is growing slowly."]','B2','Society','word','Economy'),
('unemployment','безработица','/ˌʌnɪmˈplɔɪmənt/','noun','The state of not having a job.','["Unemployment fell last year."]','B2','Society','word','Economy'),
('infrastructure','инфраструктура','/ˈɪnfrəstrʌktʃər/','noun','Basic systems like roads and power.','["The country invested in infrastructure."]','C1','Society','word','Global Issues'),
('phenomenon','явление','/fəˈnɒmɪnən/','noun','A fact or event that can be observed.','["Global warming is a worrying phenomenon."]','C1','Science','word','Academic Vocabulary'),
('hypothesis','гипотеза','/haɪˈpɒθəsɪs/','noun','An idea to be tested by research.','["The data supported their hypothesis."]','C1','Science','word','Academic Vocabulary'),
('analyse','анализировать','/ˈænəlaɪz/','verb','To examine something in detail.','["Scientists analyse the samples carefully."]','B2','Science','verb','Academic Verbs'),
('demonstrate','демонстрировать','/ˈdemənstreɪt/','verb','To show clearly by giving proof.','["The study demonstrates a clear link."]','B2','Science','verb','Academic Verbs'),
('emphasise','подчёркивать','/ˈemfəsaɪz/','verb','To give special importance to something.','["The report emphasises the need for change."]','C1','Media','verb','Academic Verbs'),
('nevertheless','тем не менее','/ˌnevəðəˈles/','adverb','In spite of what was just said.','["The plan is risky; nevertheless, it may work."]','C1','Society','word','Essay Vocabulary'),
('furthermore','более того','/ˈfɜːðəmɔː/','adverb','In addition; besides.','["Furthermore, the results were consistent."]','B2','Society','word','Essay Vocabulary'),
('crime','преступление','/kraɪm/','noun','An illegal act.','["Crime has fallen in the city."]','B1','Society','word','Crime'),
('immigration','иммиграция','/ˌɪmɪˈɡreɪʃn/','noun','The act of moving to live in another country.','["Immigration affects the labour market."]','B2','Society','word','Global Issues'),
('media','СМИ','/ˈmiːdiə/','noun','Ways of mass communication.','["Social media shapes public opinion."]','B2','Media','word','Media'),
('tourism','туризм','/ˈtʊərɪzm/','noun','The business of holidays and travel.','["Tourism supports the local economy."]','B2','Travel','word','Travel'),
('obesity','ожирение','/əʊˈbiːsəti/','noun','The state of being very overweight.','["Obesity is rising among young people."]','C1','Health','word','Health')
on conflict (word) do nothing;

-- ---- Collocations ----
insert into public.dictionary_words
  (word, translation, pronunciation, part_of_speech, definition, examples, cefr_level, topic, word_type)
values
('make a decision','принять решение','/meɪk ə dɪˈsɪʒn/','collocation','To decide something.','["You must make a decision soon."]','B1','Daily Life','collocation'),
('heavy rain','сильный дождь','/ˈhevi reɪn/','collocation','A large amount of rain.','["Heavy rain caused floods."]','B1','Weather','collocation'),
('highly recommended','настоятельно рекомендуется','/ˈhaɪli ˌrekəˈmendɪd/','collocation','Strongly advised.','["This restaurant is highly recommended."]','B2','Daily Life','collocation'),
('take a break','сделать перерыв','/teɪk ə breɪk/','collocation','To stop working for a short time.','["Let us take a break."]','A2','Work','collocation'),
('pay attention','обращать внимание','/peɪ əˈtenʃn/','collocation','To watch or listen carefully.','["Please pay attention in class."]','A2','Education','collocation'),
('save time','экономить время','/seɪv taɪm/','collocation','To do something faster.','["This app saves time."]','B1','Technology','collocation'),
('do research','проводить исследование','/duː rɪˈsɜːtʃ/','collocation','To study a subject carefully.','["She did research on sleep."]','B2','University','collocation'),
('strong economy','сильная экономика','/strɒŋ ɪˈkɒnəmi/','collocation','A country with good trade and growth.','["A strong economy creates jobs."]','B2','Society','collocation'),
('make progress','делать успехи','/meɪk ˈprəʊɡres/','collocation','To improve or move forward.','["He is making good progress."]','B1','Education','collocation'),
('reach a conclusion','прийти к выводу','/riːtʃ ə kənˈkluːʒn/','collocation','To decide after thinking.','["The team reached a clear conclusion."]','B2','Science','collocation')
on conflict (word) do nothing;

-- ---- Phrasal verbs ----
insert into public.dictionary_words
  (word, translation, pronunciation, part_of_speech, definition, examples, cefr_level, topic, word_type)
values
('give up','сдаваться','/ɡɪv ʌp/','phrasal verb','To stop trying.','["Do not give up on your dreams."]','B1','Daily Life','phrasal_verb'),
('look after','заботиться','/lʊk ˈɑːftər/','phrasal verb','To take care of someone.','["She looks after her grandmother."]','B1','Family','phrasal_verb'),
('come across','натолкнуться','/kʌm əˈkrɒs/','phrasal verb','To find by chance.','["I came across an old photo."]','B2','Daily Life','phrasal_verb'),
('find out','выяснить','/faɪnd aʊt/','phrasal verb','To learn information.','["I want to find out the truth."]','A2','Daily Life','phrasal_verb'),
('turn off','выключить','/tɜːn ɒf/','phrasal verb','To stop a machine or light.','["Turn off the lights, please."]','A2','Home','phrasal_verb'),
('grow up','взрослеть','/ɡrəʊ ʌp/','phrasal verb','To become an adult.','["I grew up in a small town."]','B1','People','phrasal_verb'),
('carry on','продолжать','/ˈkæri ɒn/','phrasal verb','To continue.','["Carry on with your work."]','B1','Work','phrasal_verb'),
('put off','откладывать','/pʊt ɒf/','phrasal verb','To postpone something.','["They put off the meeting."]','B2','Work','phrasal_verb'),
('set up','создавать','/set ʌp/','phrasal verb','To start or arrange something.','["She set up her own company."]','B2','Business','phrasal_verb'),
('deal with','справляться','/diːl wɪð/','phrasal verb','To handle a problem.','["We must deal with this issue."]','B2','Work','phrasal_verb')
on conflict (word) do nothing;
