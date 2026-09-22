# 🛡️ GUIA DEFINITIVO: Otimização de Egress e Uso Seguro do Supabase no Sistema OS

> **IMPORTANTE: LEITURA OBRIGATÓRIA PARA TODOS OS AGENTES DE IA E DESENVOLVEDORES**
> Este documento define os mandamentos técnicos indispensáveis para interagir com o Supabase (`@supabase/supabase-js`, PostgREST e PostgreSQL) no projeto **Sistema OS**. O descumprimento destas regras causa esgotamento do plano de **PostgREST Egress** ou quebra silenciosa de módulos vitais como **Medicao.html**, **Painel.html**, **Mapa.html** e **Auditoria.html**.

---

## 📌 1. O que é o Egress e onde estava o gargalo real?

O estouro de **PostgREST Egress** (`/rest/v1/...`) **NÃO** era causado por colunas de texto simples (como listas de materiais em formato texto ou JSON de sessões de trabalho). 
O verdadeiro consumidor de Gigabytes de tráfego eram:
1. **Fotos em Base64** gravadas diretamente em colunas legadas (`pontos_final` contendo fotos inline ou payloads de imagens sem envio para CDN).
2. **Campos volumosos de OCR** (`texto_auditoria_ocr` com transcrições brutas de imagens).
3. **Downloads totais indiscriminados** (`.select('*')`) em tabelas históricas a cada refresh ou navegação entre abas.
4. **Fechamentos complementares em lote massivo** (`fechamentos_os` baixando arrays de fotos de todas as OSs de uma vez).

---

## 📜 2. Os 7 Mandamentos do Supabase no Sistema OS

### 1º Mandamento: NUNCA remova `materiais` ou `historico_sessoes` das listagens gerais
- **Por que:** Telas como **[Medicao.html](file:///c:/Projetos/Sistema%20OS/Medicao.html)** e **[RelatorioController.js](file:///c:/Projetos/Sistema%20OS/js/controllers/RelatorioController.js)** calculam a apuração mensal do contrato, horas de eletricista em praças e KPIs consolidados lendo `item.materiaisConsolidados` e `item.sessoesList`.
- **Peso real:** As colunas `materiais` e `historico_sessoes` são textos/JSONs minúsculos (média de **100 a 300 bytes** por linha). Elas **NÃO contêm imagens**.
- **Regra:** Em `ChamadosRepository.COLUNAS_VIEW` e `COLUNAS_TABELA_OS`, mantenha sempre presentes:
  ```javascript
  'materiais', 'historico_sessoes', 'pontos_inicial', 'glosas', 'praca_nome', 'problemas', 'endereco'
  ```

---

### 2º Mandamento: Imagens e Base64 DEVEM ser estritamente SOB DEMANDA (`fetchById`)
- **Colunas pesadas proibidas em listagens gerais:**
  - `pontos_final` (contém fotos e dados extensos de encerramento);
  - `texto_auditoria_ocr` (texto bruto de reconhecimento óptico de fotos);
  - `fotos` da tabela `fechamentos_os`.
- **Como carregar:** Ao abrir o modal de detalhes da OS (no Painel, Mapa ou Auditoria), utilize sempre `repo.fetchById(protocoloOuId)` com `COLUNAS_COMPLETAS_DETALHE`.

---

### 3º Mandamento: Sempre use o Heartbeat Cache no `ChamadosRepository`
- **Como funciona:** Antes de consultar 500+ registros, o repositório consulta apenas 1 linha e 1 coluna (`select('data_abertura').limit(1)`), gastando menos de 150 bytes.
- Se o timestamp mais recente for idêntico ao do cache em `sessionStorage`, a consulta volumosa é **abortada** e os dados locais são reaproveitados instantaneamente.
- **Regra:** Nunca desative o `verificarHeartbeatCache()` no `fetchAllChamados()` sem justificativa explícita.

---

### 4º Mandamento: Respeite a Janela Temporal de Abertura (45 dias)
- Grids operacionais diários não devem puxar chamados de 2 anos atrás por padrão.
- A consulta padrão utiliza:
  ```javascript
  const filtroOrTemporal = `data_abertura.gte.${dataCorteIso},status.neq.Concluída,status.neq.Concluida`;
  ```
- Isso garante que:
  1. Qualquer OS que ainda esteja **em aberto / pendente** continue aparecendo no grid, independente de quando foi aberta.
  2. OSs concluídas há mais de 45 dias não onerem o carregamento inicial. (Filtros de relatórios que precisem de períodos antigos devem especificar o intervalo de datas explicitamente).

---

### 5º Mandamento: Fatiamento em Lotes de 50 no `.in()` (Prevenção de HTTP 414)
- Ao consultar tabelas relacionadas com `.in('protocolo', arrayDeProtocolos)` (ex: `fechamentos_os` ou `logs_protocolos`):
  - **Limite máximo:** 50 itens por requisição (`CHUNK_SIZE = 50`).
  - **Preservação de Case:** Protocolos no PostgreSQL são case-sensitive. Não force `.toLowerCase()` nem `.toUpperCase()` sem garantir correspondência exata no banco.
  - Mais de 50 protocolos em uma query URL estouram o limite de 2.048 caracteres do gateway Supabase, gerando erro **HTTP 414 (URI Too Long)**.

---

### 6º Mandamento: Updates SEM `.select()` e com Mescla Local de Estado
- Ao atualizar status, aprovação de auditoria ou dados de uma OS:
  - **Evite:** `.update(payload).select('*')` (força o PostgREST a devolver a tupla inteira com fotos).
  - **Prefira:**
    ```javascript
    // 1. Apenas confirmação de sucesso (HTTP 204 No Content - ZERO Egress):
    await client.from('ordens_servico').update(payload).eq('id', id);

    // 2. Ou projeção estrita apenas dos campos modificados:
    const { data } = await client.from('ordens_servico').update(payload).eq('id', id).select('id, status, updated_at');
    ```
  - **Na UI:** Atualize o objeto em memória via mescla local (`Object.assign(itemEmMemoria, novosCampos)`).

---

### 7º Mandamento: Atualize o Cache-Busting (`?v=XX`) ao alterar Scripts
- O Sistema OS utiliza Service Workers e cache agressivo de navegador para assets estáticos.
- Se você editar qualquer arquivo em `js/` (`ChamadosRepository.js`, `MedicaoController.js`, `PainelController.js`, `ChamadoModel.js`, etc.):
  - **É OBRIGATÓRIO** incrementar a versão nos arquivos HTML consumidores:
    - [Painel.html](file:///c:/Projetos/Sistema%20OS/Painel.html)
    - [Medicao.html](file:///c:/Projetos/Sistema%20OS/Medicao.html)
    - [Mapa.html](file:///c:/Projetos/Sistema%20OS/Mapa.html)
    - [Auditoria.html](file:///c:/Projetos/Sistema%20OS/Auditoria.html)
  - Exemplo: `MedicaoController.js?v=14` -> `MedicaoController.js?v=15`.
  - Sem isso, o usuário continuará rodando a versão em cache do navegador e reportará que a alteração não funcionou.

---

## 📊 3. Tabela de Referência de Colunas por Finalidade

| Finalidade | Onde usar | Colunas Permitidas |
| :--- | :--- | :--- |
| **Grid / Listagem Principal** | `COLUNAS_VIEW` e `COLUNAS_TABELA_OS` | `id, protocolo, status, prioridade, telefone_fixo, telefone_celular, quantidade, descricao, data_abertura, data_fechamento, cpf_solicitante, municipe_nome, user_id, user_email, origem_login, operador, status_auditoria, data_conclusao_auditoria, motivo_aprovacao, operador_finalizacao, glosas, praca_nome, problemas, endereco, coordenada, plaqueta_inicial, plaqueta_final, coordenada_reparo, qtd_eletricistas, tempo_total_minutos, foto_entrada, observacao_final, tipo_os, pontos_inicial, materiais, historico_sessoes` |
| **Detalhes do Modal (Sob Demanda)** | `COLUNAS_COMPLETAS_DETALHE` (`fetchById`) | Todas as colunas acima **+** `pontos_final, texto_auditoria_ocr, fotos` |
| **Heartbeat / Verificação Leve** | `verificarHeartbeatCache` | Apenas `data_abertura` ou `updated_at` com `.limit(1)` |
| **Catálogo de Materiais** | `materiais_contrato` | Carregado uma única vez e armazenado em `localStorage('os_cached_materiais_raw')` |

---

## 🚫 4. O que NUNCA fazer (Anti-Patterns)

1. ❌ **Nunca dar `.select('*')` em `vw_todas_ordens_servico` ou `ordens_servico` em massa.**
2. ❌ **Nunca remover colunas do modelo sem inspecionar todos os controllers que o utilizam** (ex.: `MedicaoController` usa `materiais` e `historico_sessoes`; remover essas colunas zera toda a medição financeira do contrato).
3. ❌ **Nunca salvar imagens Base64 no banco de dados.** Todas as imagens devem subir para o **Cloudinary** e apenas a URL segura do CDN deve ser persistida.
4. ❌ **Nunca disparar `fetchAllChamados()` dentro de loops de renderização ou eventos frequentes de mouse/scroll.**

---

*Arquivo de referência técnica mantido na raiz do projeto para orientar manutenções futuras.*
