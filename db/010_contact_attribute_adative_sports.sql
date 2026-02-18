-- Prompt 10: add Adative Sports contact attribute option.

do $$
begin
  alter type contact_attribute_enum add value if not exists 'Adative Sports';
exception
  when undefined_object then
    null;
end
$$;
