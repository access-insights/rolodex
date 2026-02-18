-- Prompt 11: normalize Adative Sports attribute label to Adaptive Sports.

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'contact_attribute_enum'
      and e.enumlabel = 'Adative Sports'
  ) then
    alter type contact_attribute_enum rename value 'Adative Sports' to 'Adaptive Sports';
  elsif exists (
    select 1
    from pg_type
    where typname = 'contact_attribute_enum'
  ) then
    alter type contact_attribute_enum add value if not exists 'Adaptive Sports';
  end if;
exception
  when undefined_object then
    null;
end
$$;
