-- Prompt 9: add Investor contact attribute option.

do $$
begin
  alter type contact_attribute_enum add value if not exists 'Investor';
exception
  when undefined_object then
    null;
end
$$;
