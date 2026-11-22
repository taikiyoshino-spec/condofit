-- 有酸素に「負荷」（任意の数値。バイクの負荷レベル・ランニングマシンの傾斜など）を足す
alter table public.exercise_entries
  add column load numeric(5, 1) check (load >= 0);

-- p_exercises: [{"exercise_id": uuid, "entries": [{"weight_kg","reps","duration_min","distance_km","load"}]}]
create or replace function public.save_training_session(
  p_session_id uuid, p_performed_at timestamptz, p_exercises jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid := p_session_id;
  ex jsonb;
  en jsonb;
  se_id uuid;
  ex_idx int := 0;
  en_idx int;
begin
  if sid is null then
    insert into public.training_sessions (user_id, performed_at)
    values (auth.uid(), p_performed_at)
    returning id into sid;
  else
    update public.training_sessions set performed_at = p_performed_at
     where id = sid and user_id = auth.uid();
    if not found then
      raise exception 'forbidden';
    end if;
    delete from public.session_exercises where session_id = sid;
  end if;

  for ex in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb)) loop
    insert into public.session_exercises (session_id, exercise_id, display_order)
    values (sid, (ex ->> 'exercise_id')::uuid, ex_idx)
    returning id into se_id;
    ex_idx := ex_idx + 1;

    en_idx := 0;
    for en in select * from jsonb_array_elements(coalesce(ex -> 'entries', '[]'::jsonb)) loop
      insert into public.exercise_entries
        (session_exercise_id, display_order, weight_kg, reps, duration_min, distance_km, load)
      values (se_id, en_idx,
        nullif(en ->> 'weight_kg', '')::numeric,
        nullif(en ->> 'reps', '')::int,
        nullif(en ->> 'duration_min', '')::numeric,
        nullif(en ->> 'distance_km', '')::numeric,
        nullif(en ->> 'load', '')::numeric);
      en_idx := en_idx + 1;
    end loop;
  end loop;

  return sid;
end;
$$;
