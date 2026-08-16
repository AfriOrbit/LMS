-- =============================================================================
-- AfriOrbit LMS — 0003 Assessment & Certification
--
-- Threat model for assessments:
--  * Correct answers are NEVER exposed to the client. They live in
--    quiz_questions.answer_key, which no RLS policy grants to learners.
--  * Grading happens in a SECURITY DEFINER function inside Postgres, so the
--    score cannot be forged by calling PostgREST directly.
--  * Attempts are server-timed: expires_at is set at start, not by the client.
-- =============================================================================

create table if not exists public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  lesson_id      uuid references public.lessons(id) on delete set null,
  slug           text not null,
  title          text not null,
  instructions   text not null default '',
  -- 'practice' quizzes never gate a certificate; 'graded' ones do.
  is_graded      boolean not null default true,
  pass_threshold int not null default 70 check (pass_threshold between 0 and 100),
  time_limit_minutes int,           -- null = untimed
  max_attempts   int not null default 3 check (max_attempts >= 1),
  -- Draw N questions at random from the bank; 0 = serve all.
  questions_per_attempt int not null default 0 check (questions_per_attempt >= 0),
  shuffle_questions boolean not null default true,
  shuffle_options   boolean not null default true,
  -- Show which items were wrong after submission?
  reveal_feedback boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (course_id, slug)
);

create table if not exists public.quiz_questions (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  kind         question_kind not null default 'single_choice',
  prompt_md    text not null,
  -- Options for choice questions: [{ "id": "a", "text": "..." }, ...]
  options      jsonb not null default '[]'::jsonb,
  -- Answer key. Shape depends on kind:
  --   single_choice / true_false : { "correct": "a" }
  --   multi_choice               : { "correct": ["a","c"] }
  --   numeric                    : { "value": 12.5, "tolerance": 0.5, "unit": "dB" }
  --   short_text                 : { "accept": ["ax.25","ax25"] }  (case-folded)
  answer_key   jsonb not null default '{}'::jsonb,
  explanation_md text not null default '',
  points       numeric(6,2) not null default 1 check (points > 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

-- A learner-safe projection: everything except the answer key.
create or replace view public.quiz_questions_public
with (security_invoker = true) as
  select id, quiz_id, kind, prompt_md, options, points, sort_order
    from public.quiz_questions;

create table if not exists public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  attempt_no   int not null,
  status       attempt_status not null default 'in_progress',
  -- Question ids served for this attempt, in served order.
  question_ids uuid[] not null default '{}',
  -- Learner responses keyed by question id.
  responses    jsonb not null default '{}'::jsonb,
  -- Per-question grading detail, written only by app.grade_attempt().
  breakdown    jsonb not null default '[]'::jsonb,
  score_pct    numeric(5,2),
  points_earned numeric(8,2),
  points_possible numeric(8,2),
  passed       boolean,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz,
  submitted_at timestamptz,
  graded_at    timestamptz,
  ip_hash      text,          -- salted hash, for integrity review only
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (quiz_id, user_id, attempt_no)
);

create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id);

-- ---------------------------------------------------------------------------
-- Start an attempt. Enforces enrollment, attempt cap, and server-side timing.
-- ---------------------------------------------------------------------------
create or replace function app.start_quiz_attempt(p_quiz uuid)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz    public.quizzes%rowtype;
  v_used    int;
  v_ids     uuid[];
  v_attempt public.quiz_attempts%rowtype;
begin
  if not app.is_active_member() then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'quiz_not_found' using errcode = '42704';
  end if;

  if not exists (
    select 1 from public.enrollments
     where user_id = auth.uid() and course_id = v_quiz.course_id
       and status in ('active', 'completed')
  ) then
    raise exception 'not_enrolled' using errcode = '42501';
  end if;

  -- Resume an unexpired in-progress attempt rather than burning a new one.
  select * into v_attempt from public.quiz_attempts
   where quiz_id = p_quiz and user_id = auth.uid() and status = 'in_progress'
     and (expires_at is null or expires_at > now())
   order by attempt_no desc limit 1;
  if found then
    return v_attempt;
  end if;

  -- Expire any stale in-progress attempts so they count against the cap.
  update public.quiz_attempts
     set status = 'abandoned'
   where quiz_id = p_quiz and user_id = auth.uid() and status = 'in_progress';

  select count(*) into v_used from public.quiz_attempts
   where quiz_id = p_quiz and user_id = auth.uid();
  if v_used >= v_quiz.max_attempts then
    raise exception 'attempt_limit_reached' using errcode = '42501';
  end if;

  select array_agg(id order by
           case when v_quiz.shuffle_questions then random() else sort_order end)
    into v_ids
    from (
      select id, sort_order from public.quiz_questions where quiz_id = p_quiz
       order by case when v_quiz.shuffle_questions then random() else sort_order end
       limit case when v_quiz.questions_per_attempt > 0
                  then v_quiz.questions_per_attempt else null end
    ) q;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'quiz_has_no_questions' using errcode = '22023';
  end if;

  insert into public.quiz_attempts
    (quiz_id, user_id, course_id, attempt_no, question_ids, expires_at)
  values
    (p_quiz, auth.uid(), v_quiz.course_id, v_used + 1, v_ids,
     case when v_quiz.time_limit_minutes is not null
          then now() + make_interval(mins => v_quiz.time_limit_minutes) end)
  returning * into v_attempt;

  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grade an attempt. All comparison logic is server-side.
-- ---------------------------------------------------------------------------
create or replace function app.grade_attempt(p_attempt uuid, p_responses jsonb)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt  public.quiz_attempts%rowtype;
  v_quiz     public.quizzes%rowtype;
  v_q        public.quiz_questions%rowtype;
  v_qid      uuid;
  v_given    jsonb;
  v_correct  boolean;
  v_earned   numeric := 0;
  v_possible numeric := 0;
  v_break    jsonb := '[]'::jsonb;
  v_expected jsonb;
  v_num      numeric;
  v_tol      numeric;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt;
  if not found or v_attempt.user_id <> auth.uid() then
    raise exception 'attempt_not_found' using errcode = '42704';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_already_submitted' using errcode = '22023';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- A late submission still grades, but only the answers already recorded
  -- server-side count; we accept the payload only if within grace.
  if v_attempt.expires_at is not null and now() > v_attempt.expires_at + interval '30 seconds' then
    p_responses := v_attempt.responses;
  end if;

  foreach v_qid in array v_attempt.question_ids loop
    select * into v_q from public.quiz_questions where id = v_qid;
    continue when not found;

    v_possible := v_possible + v_q.points;
    v_given    := p_responses -> v_qid::text;
    v_correct  := false;

    if v_given is not null then
      case v_q.kind
        when 'single_choice', 'true_false' then
          v_correct := lower(coalesce(v_given #>> '{}', '')) =
                       lower(coalesce(v_q.answer_key ->> 'correct', '\x00'));

        when 'multi_choice' then
          -- Exact set match; partial credit is intentionally not awarded.
          v_expected := v_q.answer_key -> 'correct';
          v_correct := (
            select coalesce(
              (select array_agg(x order by x) from jsonb_array_elements_text(v_given) x)
              =
              (select array_agg(y order by y) from jsonb_array_elements_text(v_expected) y),
            false)
          );

        when 'numeric' then
          begin
            v_num := (v_given #>> '{}')::numeric;
            v_tol := coalesce((v_q.answer_key ->> 'tolerance')::numeric, 0);
            v_correct := abs(v_num - (v_q.answer_key ->> 'value')::numeric) <= v_tol;
          exception when others then
            v_correct := false;
          end;

        when 'short_text' then
          v_correct := exists (
            select 1 from jsonb_array_elements_text(v_q.answer_key -> 'accept') a
             where lower(trim(a)) = lower(trim(coalesce(v_given #>> '{}', '')))
          );
      end case;
    end if;

    if v_correct then
      v_earned := v_earned + v_q.points;
    end if;

    v_break := v_break || jsonb_build_object(
      'question_id', v_qid,
      'correct', v_correct,
      'points', case when v_correct then v_q.points else 0 end,
      'explanation_md', case when v_quiz.reveal_feedback then v_q.explanation_md else '' end
    );
  end loop;

  update public.quiz_attempts
     set responses    = p_responses,
         breakdown    = v_break,
         points_earned = v_earned,
         points_possible = v_possible,
         score_pct    = case when v_possible > 0
                             then round((v_earned / v_possible) * 100, 2) else 0 end,
         passed       = case when v_possible > 0
                             then round((v_earned / v_possible) * 100, 2) >= v_quiz.pass_threshold
                             else false end,
         status       = 'graded',
         submitted_at = now(),
         graded_at    = now()
   where id = p_attempt
  returning * into v_attempt;

  return v_attempt;
end;
$$;

grant execute on function app.start_quiz_attempt(uuid), app.grade_attempt(uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- certificates
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  -- Human-shareable verification code, e.g. AO-2026-7Q4KX2M9
  code            text not null unique,
  -- Snapshot of identity at issue time so later profile edits cannot rewrite
  -- what a certificate claims.
  recipient_name  text not null,
  course_title    text not null,
  final_score_pct numeric(5,2),
  hours           numeric(6,2),
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  revoked_reason  text,
  -- sha256 over the canonical claim string; printed on the PDF so a verifier
  -- can detect an altered document.
  integrity_hash  text not null,
  created_at      timestamptz not null default now(),
  unique (user_id, course_id)
);

create index if not exists certificates_code_idx on public.certificates (code);

-- Public, non-enumerable verification projection (no user_id, no email).
create or replace view public.certificate_verification
with (security_invoker = false) as
  select c.code,
         c.recipient_name,
         c.course_title,
         c.final_score_pct,
         c.issued_at,
         c.expires_at,
         (c.revoked_at is null) as is_valid,
         c.integrity_hash
    from public.certificates c;

create or replace function app.generate_certificate_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
  out_code text := '';
  i int;
begin
  for i in 1..8 loop
    out_code := out_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'AO-' || to_char(now(), 'YYYY') || '-' || out_code;
end;
$$;

-- Issue a certificate if — and only if — the learner actually finished the
-- course and cleared every graded quiz. Called by the app after completion.
create or replace function app.issue_certificate(p_course uuid)
returns public.certificates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course public.courses%rowtype;
  v_enr    public.enrollments%rowtype;
  v_prof   public.profiles%rowtype;
  v_cert   public.certificates%rowtype;
  v_score  numeric;
  v_failed int;
  v_code   text;
  v_hours  numeric;
begin
  select * into v_prof from public.profiles where id = auth.uid();
  if not found or v_prof.status <> 'active' then
    raise exception 'account_not_active' using errcode = '42501';
  end if;

  select * into v_course from public.courses where id = p_course;
  if not found or not v_course.issues_certificate then
    raise exception 'certificate_not_offered' using errcode = '22023';
  end if;

  select * into v_enr from public.enrollments
   where user_id = auth.uid() and course_id = p_course;
  if not found or v_enr.progress_pct < 100 then
    raise exception 'course_incomplete' using errcode = '42501';
  end if;

  -- Every graded quiz in the course must have at least one passing attempt.
  select count(*) into v_failed
    from public.quizzes q
   where q.course_id = p_course and q.is_graded
     and not exists (
       select 1 from public.quiz_attempts a
        where a.quiz_id = q.id and a.user_id = auth.uid() and a.passed
     );
  if v_failed > 0 then
    raise exception 'assessments_outstanding' using errcode = '42501';
  end if;

  select round(avg(best), 2) into v_score from (
    select max(a.score_pct) as best
      from public.quiz_attempts a
      join public.quizzes q on q.id = a.quiz_id
     where q.course_id = p_course and q.is_graded and a.user_id = auth.uid()
     group by q.id
  ) s;

  select round(coalesce(sum(l.estimated_minutes), 0) / 60.0, 2) into v_hours
    from public.lessons l where l.course_id = p_course;

  select * into v_cert from public.certificates
   where user_id = auth.uid() and course_id = p_course;
  if found then
    return v_cert;
  end if;

  loop
    v_code := app.generate_certificate_code();
    exit when not exists (select 1 from public.certificates where code = v_code);
  end loop;

  insert into public.certificates
    (user_id, course_id, code, recipient_name, course_title,
     final_score_pct, hours, integrity_hash)
  values
    (auth.uid(), p_course, v_code,
     coalesce(nullif(v_prof.full_name, ''), split_part(v_prof.email::text, '@', 1)),
     v_course.title, v_score, v_hours,
     encode(digest(
       v_code || '|' || coalesce(v_prof.full_name, '') || '|' || v_course.title ||
       '|' || coalesce(v_score::text, '') || '|' || now()::text, 'sha256'), 'hex'))
  returning * into v_cert;

  return v_cert;
end;
$$;

grant execute on function app.issue_certificate(uuid) to authenticated;

drop trigger if exists quizzes_touch on public.quizzes;
create trigger quizzes_touch before update on public.quizzes for each row execute function app.touch_updated_at();
drop trigger if exists quiz_questions_touch on public.quiz_questions;
create trigger quiz_questions_touch before update on public.quiz_questions for each row execute function app.touch_updated_at();
drop trigger if exists quiz_attempts_touch on public.quiz_attempts;
create trigger quiz_attempts_touch before update on public.quiz_attempts for each row execute function app.touch_updated_at();
