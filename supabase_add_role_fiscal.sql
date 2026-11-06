-- Adição do novo papel 'fiscal' na constraint profiles_role_check
-- Execute este script no SQL Editor do Supabase se a sua tabela 'profiles' tiver restrição de CHECK ativa.

ALTER TABLE "public"."profiles" 
DROP CONSTRAINT IF EXISTS "profiles_role_check";

ALTER TABLE "public"."profiles" 
ADD CONSTRAINT "profiles_role_check" 
CHECK (("role" = ANY (ARRAY[
    'campo'::text, 
    'executor'::text, 
    'tecnico'::text, 
    'operador'::text, 
    'admin'::text, 
    'gestor'::text, 
    'manutentor'::text, 
    'cidadao'::text, 
    'ouvidoria'::text, 
    'fiscal'::text, 
    'pendente'::text, 
    'CAMPO'::text, 
    'ADMIN'::text, 
    'OPERADOR'::text, 
    'OUVIDORIA'::text, 
    'FISCAL'::text, 
    'PENDENTE'::text
])));
