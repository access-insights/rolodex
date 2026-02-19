-- Prompt 12: add Accelerator and Governement contact attribute options.

do $$
begin
  alter type contact_attribute_enum add value if not exists 'Accelerator';
  alter type contact_attribute_enum add value if not exists 'Governement';
exception
  when undefined_object then
    null;
end
$$;
