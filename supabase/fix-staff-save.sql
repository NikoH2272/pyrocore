-- Corrección de "DELETE requires a WHERE clause" al guardar desde el panel.
-- Ejecutar este archivo completo en el SQL Editor del proyecto Supabase.
-- Solo reemplaza prc_staff_save; no ejecuta guardados ni modifica datos al instalarse.

begin;

create or replace function prc_staff_save(p_token text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user json;
  v_touched uuid[];
  v_g jsonb;
  v_r jsonb;
  v_m jsonb;
  v_s jsonb;
  i integer;
begin
  v_user := prc_staff_me(p_token);

  -- settings
  update prc_settings set
    tournament = coalesce(p_data->'tournament', '{}'),
    links      = coalesce(p_data->'links', '{}'),
    prizes     = coalesce(p_data->'prizes', '[]')
  where id = 1;

  -- schedule
  -- Reemplazo completo intencional; pg-safeupdate exige un WHERE explícito.
  delete from prc_schedule where id is not null;
  i := 0;
  for v_m in select * from jsonb_array_elements(coalesce(p_data->'schedule','[]')) loop
    insert into prc_schedule(id, phase, group_name, date, time, rooms, status, visible, note, position)
    values (
      (v_m->>'id')::uuid,
      v_m->>'phase',
      coalesce(v_m->>'group', ''),
      nullif(v_m->>'date','')::date,
      nullif(v_m->>'time',''),
      coalesce((v_m->>'rooms')::integer, 1),
      coalesce(v_m->>'status','proximo'),
      coalesce((v_m->>'visible')::boolean, false),
      coalesce(v_m->>'note',''),
      i
    );
    i := i + 1;
  end loop;

  -- touched group ids
  select array_agg(x::uuid) into v_touched
  from jsonb_array_elements_text(coalesce(p_data->'touched','[]')) x;

  -- result groups & rows (only touched groups get rows updated)
  i := 0;
  for v_g in select * from jsonb_array_elements(coalesce(p_data->'results','[]')) loop
    insert into prc_result_groups(id, phase, title, kind, qualify, position, updated_at)
    values (
      (v_g->>'id')::uuid,
      v_g->>'phase',
      coalesce(v_g->>'title',''),
      coalesce(v_g->>'kind','grupo'),
      coalesce((v_g->>'qualify')::integer, 0),
      i,
      case when (v_g->>'id')::uuid = any(v_touched) then now() else null end
    )
    on conflict(id) do update set
      phase      = excluded.phase,
      title      = excluded.title,
      kind       = excluded.kind,
      qualify    = excluded.qualify,
      position   = excluded.position,
      updated_at = case when (v_g->>'id')::uuid = any(v_touched) then now() else prc_result_groups.updated_at end;

    if (v_g->>'id')::uuid = any(v_touched) then
      delete from prc_result_rows where group_id = (v_g->>'id')::uuid;
      declare j integer := 0;
      begin
        for v_r in select * from jsonb_array_elements(coalesce(v_g->'rows','[]')) loop
          insert into prc_result_rows(id, group_id, team, kills, placement, penalty, position)
          values (
            (v_r->>'id')::uuid,
            (v_g->>'id')::uuid,
            coalesce(v_r->>'team',''),
            coalesce((v_r->>'kills')::integer, 0),
            coalesce((v_r->>'placement')::integer, 0),
            coalesce((v_r->>'penalty')::integer, 0),
            j
          );
          j := j + 1;
        end loop;
      end;
    end if;

    i := i + 1;
  end loop;

  -- remove groups no longer in the list
  delete from prc_result_groups
  where id not in (
    select (x->>'id')::uuid
    from jsonb_array_elements(coalesce(p_data->'results','[]')) x
  );

  -- sponsors
  delete from prc_sponsors where id is not null;
  i := 0;
  for v_s in select * from jsonb_array_elements(coalesce(p_data->'sponsors','[]')) loop
    if coalesce(v_s->>'name','') <> '' or coalesce(v_s->>'logo_url', v_s->>'logo', '') <> '' then
      insert into prc_sponsors(id, name, logo_url, url, position)
      values (
        (v_s->>'id')::uuid,
        coalesce(v_s->>'name',''),
        coalesce(v_s->>'logo_url', v_s->>'logo', ''),
        coalesce(v_s->>'url',''),
        i
      );
    end if;
    i := i + 1;
  end loop;

end;
$$;

notify pgrst, 'reload schema';

commit;

