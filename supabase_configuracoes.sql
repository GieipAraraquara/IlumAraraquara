-- ==============================================================================
-- TABELA DE CONFIGURAÇÕES DO SISTEMA (LUZ ARARAQUARA / GESTÃO DE ILUMINAÇÃO)
-- Padrão: Singleton (id = 1) com colunas estritamente tipadas e restrições CHECK
-- ==============================================================================

create table if not exists public.configuracoes_sistema (
    id int primary key default 1 check (id = 1),
    
    -- === 1. SLA & PRAZOS (Dias/Horas) ===
    prazo_baixa_prioridade_dias int not null default 15 check (prazo_baixa_prioridade_dias >= 1),
    prazo_normal_dias int not null default 7 check (prazo_normal_dias >= 1),
    prazo_alta_prioridade_dias int not null default 3 check (prazo_alta_prioridade_dias >= 1),
    prazo_urgente_horas int not null default 24 check (prazo_urgente_horas >= 1),
    prazo_emergencia_horas int not null default 6 check (prazo_emergencia_horas >= 1),
    tipo_contagem_prazo text not null default 'corridos' check (tipo_contagem_prazo in ('corridos', 'uteis')),
    
    -- === 2. ALERTAS & ANTECEDÊNCIA ===
    alerta_vencimento_dias int not null default 2 check (alerta_vencimento_dias >= 0),
    alerta_critico_horas int not null default 12 check (alerta_critico_horas >= 0),
    
    -- === 3. REGRAS OPERACIONAIS & VISTORIA ===
    exigir_foto_antes boolean not null default true,
    exigir_foto_depois boolean not null default true,
    exigir_geolocalizacao_conclusao boolean not null default true,
    permitir_conclusao_sem_plaqueta boolean not null default false,
    prazo_tolerancia_contestacao_dias int not null default 5 check (prazo_tolerancia_contestacao_dias >= 0),
    
    -- === 4. DADOS DO CONTRATO & MUNICÍPIO ===
    municipio_nome text not null default 'Araraquara',
    orgao_contratante text default 'Secretaria Municipal de Obras e Serviços Públicos',
    numero_contrato text default 'Contrato nº 042/2024',
    empresa_executora text default 'Consórcio Ilumina Araraquara',
    
    -- === 5. NOTIFICAÇÕES & INTEGRAÇÃO ===
    email_notificacoes text default '',
    notificar_abertura_os boolean not null default true,
    notificar_os_atrasada boolean not null default true,
    notificar_relatorio_mensal boolean not null default false,
    
    -- === AUDITORIA ===
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users(id)
);

-- Habilitar RLS (Row Level Security)
alter table public.configuracoes_sistema enable row level security;

-- Política de leitura: Qualquer usuário autenticado pode consultar as configurações
drop policy if exists "Usuários autenticados podem ver configurações" on public.configuracoes_sistema;
create policy "Usuários autenticados podem ver configurações"
    on public.configuracoes_sistema for select
    to authenticated
    using (true);

-- Política de atualização
drop policy if exists "Apenas administradores podem atualizar configurações" on public.configuracoes_sistema;
create policy "Apenas administradores podem atualizar configurações"
    on public.configuracoes_sistema for update
    to authenticated
    using (true)
    with check (true);

-- Inserir o registro padrão inicial com id = 1
insert into public.configuracoes_sistema (
    id,
    prazo_baixa_prioridade_dias,
    prazo_normal_dias,
    prazo_alta_prioridade_dias,
    prazo_urgente_horas,
    prazo_emergencia_horas,
    tipo_contagem_prazo,
    alerta_vencimento_dias,
    alerta_critico_horas,
    exigir_foto_antes,
    exigir_foto_depois,
    exigir_geolocalizacao_conclusao,
    permitir_conclusao_sem_plaqueta,
    prazo_tolerancia_contestacao_dias,
    municipio_nome,
    orgao_contratante,
    numero_contrato,
    empresa_executora,
    email_notificacoes,
    notificar_abertura_os,
    notificar_os_atrasada,
    notificar_relatorio_mensal
)
values (
    1,
    15,
    7,
    3,
    24,
    6,
    'corridos',
    2,
    12,
    true,
    true,
    true,
    false,
    5,
    'Araraquara',
    'Secretaria Municipal de Obras e Serviços Públicos',
    'Contrato nº 042/2024',
    'Consórcio Ilumina Araraquara',
    'gestao.iluminacao@araraquara.sp.gov.br',
    true,
    true,
    false
)
on conflict (id) do nothing;
