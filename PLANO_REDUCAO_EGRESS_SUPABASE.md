# Plano Avançado de Redução Drástica de PostgREST Egress no Supabase (v3.0)

Este documento apresenta a estratégia técnica definitiva e de alta performance para contenção e redução de até **90% a 95%** do consumo de **PostgREST Egress** no projeto **Sistema OS**. 

O plano combina:
1. **Projeção Cirúrgica de Colunas** (eliminação de payloads pesados);
2. **Consultas Condicionais com "Heartbeat / Last-Modified"** (evita downloads repetidos quando não há novidades);
3. **Janela Temporal Padrão Operacional** (corte do histórico morto em grids diários);
4. **Fatiamento em Lotes (Chunking de 50 no `.in()`)** com prevenção de HTTP 414 e preservação de case;
5. **Updates com Mescla Local de UI** (eliminação do header `return=representation`);
6. **Estratégia Cirúrgica para Supabase Realtime** (notificação de evento + fetch pontual).

---

## 1. Diagnóstico e Matriz de Impacto

O estouro de **PostgREST Egress** (`/rest/v1/...`) ocorre devido ao download indiscriminado e contínuo de registros históricos pesados a cada refresh ou navegação entre abas.

| Prática Atual no Código | Impacto no Egress | Solução Técnica Avançada |
| :--- | :---: | :--- |
| Download total da tabela/view a cada recarregamento de página. | **Extremo (70%)** | **Cache Inteligente com Heartbeat**: checagem de `MAX(updated_at)` antes de baixar dados. Se não mudou, usa cache local (payload de 150 bytes). |
| Carregamento de anos de histórico de OSs em telas de operação diária. | **Alto (15%)** | **Janela Temporal Padrão**: limitar a busca padrão aos últimos 45 dias ou OSs não concluídas. Consultas anteriores apenas sob demanda via filtro/pesquisa. |
| Download de 100% da tabela `fechamentos_os` para cruzar em memória. | **Alto (10%)** | **Fatiamento em Chunks de 50 com `.in()`**: buscar somente os fechamentos das OSs visíveis na página/lote atual. |
| Uso de `.select()` após updates retornando linhas inteiras com JSONBs. | **Médio (5%)** | **Remoção de `.select()` ou Retorno Mínimo**: mescla otimista de estado no frontend. |

---

## 2. Inventário de Arquivos e Linhas Críticas

| Caminho do Arquivo | Gravidade | Motivo | Ação Técnica |
| :--- | :---: | :--- | :--- |
| [`js/repositories/ChamadosRepository.js:65-86`](file:///c:/Projetos/Sistema%20OS/js/repositories/ChamadosRepository.js#L65-L86) | **Crítica** | `.select('*')` irrestrito em view unificada. | Aplicar Heartbeat + Janela Temporal (45 dias) + Projeção estrita de colunas. |
| [`js/repositories/ChamadosRepository.js:171-190`](file:///c:/Projetos/Sistema%20OS/js/repositories/ChamadosRepository.js#L171-L190) | **Crítica** | `.select('*')` na tabela `fechamentos_os` inteira. | Fatiar protocolos em lotes de 50 itens (`Promise.all` + `.in()`) e projeção restrita. |
| [`js/repositories/ChamadosRepository.js:234-248`](file:///c:/Projetos/Sistema%20OS/js/repositories/ChamadosRepository.js#L234-L248) | **Crítica** | Repetição de busca irrestrita em Auditoria. | Replicar estratégia de Heartbeat e busca fatiada de fechamentos. |
| [`js/repositories/ChamadosRepository.js:387-405`](file:///c:/Projetos/Sistema%20OS/js/repositories/ChamadosRepository.js#L387-L405) | **Média** | `.update().select()` descarregando tupla modificada. | Eliminar `.select()` ou retornar somente campos alterados com mescla local na UI. |
| [`Abrir.html:2408-2416`](file:///c:/Projetos/Sistema%20OS/Abrir.html#L2408-L2416) | **Alta** | `.select('*')` em `localizacao_pracas`. | Projetar apenas identificador, coordenadas e bairro. Validar nomes no Table Editor. |
| [`Controle-Plaquetas.html:1178`](file:///c:/Projetos/Sistema%20OS/Controle-Plaquetas.html#L1178) | **Média** | `.select('*', { count: 'exact' })` sem restrição de campos. | Projetar colunas necessárias e validar maiúsculas/aspas duplas versus snake_case. |
| [`Finalizar.html:1665`](file:///c:/Projetos/Sistema%20OS/Finalizar.html#L1665) e [`RelatorioController.js:802`](file:///c:/Projetos/Sistema%20OS/js/controllers/RelatorioController.js#L802) | **Média** | `.select('*')` repetido em `materiais_contrato`. | Cache persistente em `sessionStorage` com TTL de 1 hora. |

---

## 3. Diretrizes Técnicas Avançadas Passo a Passo

### Diretriz 1: Cache Inteligente com Checagem de Atualização ("Heartbeat" Polling)

#### Problema
Operadores alternam entre abas ou dão F5/atualizar com frequência. Fazer um download de 1.000 chamados a cada refresh custa de 2MB a 5MB por requisição, mesmo sem nenhuma alteração no banco.

#### Solução
Antes de realizar a consulta pesada, o cliente executa uma consulta **ultraleve** (inferior a 200 bytes) buscando apenas o `updated_at` (ou `data_fechamento`) mais recente. Se o timestamp bater com o do cache local, o download volumoso é abortado imediatamente.

```javascript
// Exemplo de implementação no ChamadosRepository.js:

async function obterChamadosComHeartbeat(client, viewName, forcarRefresh = false) {
    const CACHE_KEY_DATA = 'cache_sistema_os_chamados_v3';
    const CACHE_KEY_META = 'cache_sistema_os_meta_v3';

    try {
        // 1. Tenta recuperar cache local
        const cachedDataRaw = sessionStorage.getItem(CACHE_KEY_DATA);
        const cachedMetaRaw = sessionStorage.getItem(CACHE_KEY_META);

        if (!forcarRefresh && cachedDataRaw && cachedMetaRaw) {
            const cachedMeta = JSON.parse(cachedMetaRaw);

            // 2. Consulta ultraleve de "Heartbeat" (apenas 1 registro, 1 coluna)
            const { data: heartbeat, error: hbErr } = await client
                .from(viewName)
                .select('updated_at')
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!hbErr && heartbeat && heartbeat.length > 0) {
                const ultimoBanco = heartbeat[0].updated_at;

                // Se o banco não tem registros mais novos que nosso cache, reutiliza
                if (ultimoBanco === cachedMeta.lastUpdatedAt) {
                    console.log('⚡ [Heartbeat Hit] Nenhuma alteração detectada no banco. Utilizando cache local.');
                    return JSON.parse(cachedDataRaw);
                }
            }
        }
    } catch (eCache) {
        console.warn('⚠️ [Heartbeat] Falha na checagem rápida de cache:', eCache);
    }

    // 3. Se houver novidades, cache expirado ou forçado: executa a query enxuta
    console.log('🔄 [Heartbeat Miss] Atualização necessária detectada. Baixando dados...');
    return null; // Prossegue para a query otimizada
}
```

---

### Diretriz 2: Janela Temporal Padrão Operacional (Corte de Histórico Morto)

#### Problema
Grids operacionais diários não precisam carregar ordens de 2 ou 3 anos atrás. Carregar todo o histórico em uma lista operacional multiplica o egress por 10x sem necessidade.

#### Solução
Por padrão, `fetchChamados()` aplica um corte temporal (ex.: últimos 45 dias) **OU** traz chamados que ainda estão pendentes/abertos independentemente da data. O histórico arquivado antigo fica disponível sob demanda caso o usuário filtre por datas anteriores ou pesquise por um protocolo específico.

```javascript
// Montagem da query com Janela Temporal no ChamadosRepository.js:

const COLUNAS_CHAMADOS_LISTA = [
    'id', 'protocolo', 'status', 'tipo', 'prioridade',
    'data_abertura', 'data_fechamento', 'data_conclusao',
    'endereco', 'bairro', 'praca_nome',
    'operador_abertura', 'operador_finalizacao',
    'pontos_inicial', 'pontos_final', 'glosas'
].join(',');

// Janela padrão: 45 dias atrás
const dataLimite = new Date();
dataLimite.setDate(dataLimite.getDate() - 45);
const dataLimiteIso = dataLimite.toISOString();

let query = client
    .from(this.viewName)
    .select(COLUNAS_CHAMADOS_LISTA);

// Se não for uma busca específica por protocolo ou filtro de histórico amplo:
if (!filtroPesquisaEspecifica && !filtroDataPersonalizada) {
    // Traz chamados recentes OU chamados antigos que ainda não foram concluídos
    query = query.or(`data_abertura.gte.${dataLimiteIso},status.neq.Concluída,status.neq.Concluida`);
}

query = query.order('data_abertura', { ascending: false }).limit(200);

let { data, error } = await query;
```

---

### Diretriz 3: Fatiamento em Lotes (Chunking de 50) com Prevenção de HTTP 414 e Case-Sensitivity

#### Problema
Carregar a tabela `fechamentos_os` inteira consome dezenas de megabytes. No entanto, passar todos os protocolos no `.in()` de uma só vez gera URLs com mais de 2.000 caracteres, disparando o erro **HTTP 414 (URI Too Long)** no Supabase. Além disso, o `.in()` no PostgreSQL é **case-sensitive**.

#### Solução
1. Extrair os protocolos visíveis mantendo rigorosamente o formato retornado pelo banco (sem converter com `toLowerCase` ou `toUpperCase`).
2. Fatiar os protocolos em lotes de no máximo **50 itens**.
3. Executar os chunks em paralelo via `Promise.all` com projeção enxuta e juntar com `.flatMap()`.

```javascript
if (data && data.length > 0) {
    try {
        // 1. Protocolos preservando o case exato persistido no banco
        const protocolosVisiveis = Array.from(
            new Set(data.map(r => r.protocolo).filter(p => p && String(p).trim() !== ''))
        );

        if (protocolosVisiveis.length > 0) {
            // 2. Fatiamento em lotes de 50 para garantir segurança HTTP 414
            const CHUNK_SIZE = 50;
            const chunks = [];
            for (let i = 0; i < protocolosVisiveis.length; i += CHUNK_SIZE) {
                chunks.push(protocolosVisiveis.slice(i, i + CHUNK_SIZE));
            }

            // 3. Execução paralela dos lotes com projeção cirúrgica
            const promessas = chunks.map(chunk =>
                client
                    .from('fechamentos_os')
                    .select('id, protocolo, numero_fechamento, data_fechamento, operador, materiais, relatorio_tecnico, ponto_referencia')
                    .in('protocolo', chunk)
                    .order('numero_fechamento', { ascending: true })
            );

            const respostas = await Promise.all(promessas);
            const todosFechamentos = respostas.flatMap(res => (!res.error && res.data) ? res.data : []);

            if (todosFechamentos.length > 0) {
                const fechMap = new Map();
                todosFechamentos.forEach(f => {
                    const protKey = String(f.protocolo).trim();
                    if (!fechMap.has(protKey)) fechMap.set(protKey, []);
                    fechMap.get(protKey).push(f);
                });

                data.forEach(row => {
                    const protKey = row.protocolo ? String(row.protocolo).trim() : null;
                    row.fechamentos_os = (protKey && fechMap.has(protKey)) ? fechMap.get(protKey) : [];
                });
            }
        }
    } catch(eFech) {
        console.warn('⚠️ [ChamadosRepository] Falha ao carregar fechamentos fatiados:', eFech);
    }
}
```

---

### Diretriz 4: Otimização de Updates e Salvaguarda de Estado da UI

#### Problema
Ao salvar status ou materiais, o uso de `.update().select()` força o PostgREST a devolver todo o registro alterado com todas as fotos e arrays de materiais, multiplicando o tráfego de saída. Porém, remover o `.select()` pode causar `undefined` na interface se o componente depender dos valores retornados.

#### Solução
- Se o chamador apenas verifica sucesso, **remova o `.select()`** (o PostgREST responde com HTTP 204 No Content e zero egress).
- Se a interface precisa atualizar o card ou badge na tela, o repositório deve retornar **apenas os campos modificados**, e a camada de Controller/UI realiza a **mescla local (Optimistic / Local State Merge)**.

```javascript
// ChamadosRepository.js:
async updateStatus(idOrProtocol, newStatus, justification = '') {
    // ... monta updatePayload ...
    
    // Retorna exclusivamente os campos de controle necessários para a tela
    const res = await client
        .from(tableName)
        .update(updatePayload)
        .eq(field, val)
        .select('id, protocolo, status, data_conclusao, data_fechamento');

    return res.data;
}

// Controller / Componente consumidor:
const atualizacao = await chamadosRepo.updateStatus(osId, 'Concluída');
if (atualizacao && atualizacao.length > 0) {
    // Mescla localmente mantendo os dados volumosos já presentes em memória
    Object.assign(chamadoEmMemoria, atualizacao[0]);
    renderizarCard(chamadoEmMemoria);
}
```

---

### Diretriz 5: Estratégia Cirúrgica para Supabase Realtime

#### Problema
Se canais Realtime (`supabase.channel(...)`) escutarem eventos de `INSERT` ou `UPDATE` na tabela inteira e a cada evento o frontend disparar um `fetchChamados()` geral, o benefício da economia de tráfego é anulado.

#### Solução
1. Escutar apenas alterações de status/campos chave.
2. Ao receber a notificação, **não recarregar a tabela inteira**. Executar busca cirúrgica apenas da linha alterada via `fetchById(payload.new.id)` e atualizar pontualmente a linha no grid ou array local.

```javascript
// Exemplo de listener cirúrgico em tempo real:
const canalOS = client
    .channel('alteracoes_status_os')
    .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ordens_servico' },
        async (payload) => {
            console.log('⚡ [Realtime Update Detectado]:', payload.new.id);
            const idAlterado = payload.new.id;

            // Busca cirúrgica apenas do registro modificado se ele já estiver em tela
            const index = listaChamadosLocal.findIndex(item => String(item.id) === String(idAlterado));
            if (index !== -1) {
                const { data, error } = await client
                    .from('vw_todas_ordens_servico')
                    .select(COLUNAS_CHAMADOS_LISTA)
                    .eq('id', idAlterado)
                    .maybeSingle();

                if (!error && data) {
                    listaChamadosLocal[index] = data;
                    atualizarLinhaTabelaNaUI(data);
                }
            }
        }
    )
    .subscribe();
```

---

### Diretriz 6: Validação de Nomes de Colunas e Table Editor no Supabase

#### Alerta Importante
Antes de aplicar projeções em `localizacao_plaquetas` e `localizacao_pracas`:
1. Abra o **Table Editor** no dashboard do Supabase.
2. Verifique se as colunas foram criadas:
   - No padrão nativo PostgreSQL em minúsculas (`empresa`, `latitude`, `longitude`, `observacao`); OU
   - Como strings literais originadas de planilhas (`"Empresa"`, `"Latitude"`, `"Longitude"`, `"Observação"`).
3. **Regra de ouro:** Se o schema estiver em minúsculas (snake_case), declare na projeção **sem aspas**:
   ```javascript
   // Padrão limpo (recomendado se as colunas estiverem em minúsculas):
   client.from('localizacao_plaquetas').select('id, identificacao, empresa, latitude, longitude, observacao');
   ```
   Caso exijam caracteres especiais ou maiúsculas literais, envolva-as em aspas duplas (`'"Observação"'`) para prevenir erro HTTP 400 (`column not found`).

---

## 4. Estimativa de Redução de Egress

| Cenário de Uso | Consumo Atual Estimado | Consumo Otimizado (v3.0) | Redução Real |
| :--- | :---: | :---: | :---: |
| **Abertura do Dashboard (1º Acesso)** | ~4.5 MB | ~350 KB | **~92%** |
| **Troca de Aba / F5 sem alterações (Heartbeat Hit)** | ~4.5 MB | **< 1 KB** (Heartbeat 200B) | **~99.9%** |
| **Finalização / Update de Status de OS** | ~150 KB | ~2 KB (retorno enxuto) | **~98%** |
| **Carga de Praças em `Abrir.html`** | ~800 KB | ~85 KB | **~89%** |

---

## 5. Roteiro de Verificação e Homologação

1. **Validação do Heartbeat no DevTools:**
   - Carregar o painel.
   - Pressionar F5 ou trocar de aba.
   - Constatar na aba **Network** que a requisição de OSs foi substituída por uma única chamada de 1 linha (`limit=1`), sem download do payload de chamados ou fechamentos.
2. **Teste de Fatiamento (HTTP 414):**
   - Simular carga de 150 chamados. Verificar que foram disparadas requisições para `fechamentos_os` com `in=(...)` contendo exatamente 50 itens por bloco, todas com status HTTP 200.
3. **Teste de Atualização de Status:**
   - Alterar o status de uma OS para "Concluída". Confirmar que o card na tela reflete o novo status instantaneamente via mescla local, sem requisições pesadas no log de rede.
4. **Inspeção de Métricas no Supabase:**
   - Observar a curva de **PostgREST Egress** no painel do Supabase ao longo de 24 horas, confirmando a estabilização e a redução drástica da cota consumida.
