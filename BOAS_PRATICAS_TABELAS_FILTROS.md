# Diretrizes de Design & UX: Formatação de Tabelas Administrativas com Filtros Embutidos no Cabeçalho

> **Regra Geral Obrigatória para Agentes de IA e Desenvolvedores**  
> **NUNCA** crie barras horizontais avulsas ou cartões com inputs e selects acumulados acima da tabela apenas para filtrar colunas.  
> **SEMPRE** incorpore os filtros diretamente nos títulos de cada coluna (`<th>`) dentro do cabeçalho da tabela (`<thead>`), espelhando a convenção de design de produtos de alta produtividade (ex: [Painel.html](file:///c:/Projetos/Sistema%20OS/Painel.html) e [Controle-Plaquetas.html](file:///c:/Projetos/Sistema%20OS/Controle-Plaquetas.html)).

---

## 1. Princípio do Design: Por que Filtros no Cabeçalho?

1. **Economia de Espaço Vertical (Data Density):** Em dashboards corporativos e operacionais, a altura da tela deve ser maximizada para exibir dados. Cartões de filtros no topo empurram a tabela para baixo e criam poluição visual.
2. **Contexto Imediato:** O usuário associa o filtro diretamente com a coluna que ele altera (Data com data, Status com status, etc.).
3. **Padrão Unificado do Sistema:** O sistema mantém a mesma linguagem visual em todas as telas (`Painel.html`, `Controle-Plaquetas.html`, etc.).

---

## 2. Anatomia do Cabeçalho com Filtro (`<th>`)

Cada célula `<th>` que possuir filtro deve seguir a seguinte estrutura de layout e classes Tailwind:

```html
<th class="py-3 px-4 whitespace-nowrap relative overflow-visible" style="width: 170px; min-width: 170px;">
    <div class="relative inline-block text-left">
        <!-- Botão Gatilho do Filtro -->
        <button type="button" 
                class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-container-low transition-colors text-on-surface-variant hover:text-secondary cursor-pointer" 
                id="meu-filtro-trigger" 
                title="Filtrar por [Nome da Coluna]">
            <span class="font-label-md uppercase tracking-wider">[Nome da Coluna]</span>
            <!-- Ícone de filtro ou busca -->
            <span class="material-symbols-outlined text-[18px]">filter_alt</span> <!-- ou search -->
            <!-- Bolinha Indicadora Ativa (oculta por padrão com .hidden) -->
            <span class="w-2 h-2 rounded-full bg-secondary hidden" id="meu-filtro-indicator"></span>
        </button>

        <!-- Dropdown Flutuante (Portal) -->
        <div class="absolute left-0 mt-2 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl z-50 p-3 animate-fade-in-up hidden" 
             id="meu-filtro-dropdown">
            <!-- Conteúdo do filtro (Busca, Checklist, Rádios, Períodos) -->
            <div class="flex flex-col gap-2">
                <span class="text-label-sm text-on-surface-variant uppercase font-semibold">Filtrar por [Nome]</span>
                
                <!-- Exemplo de Input de Busca -->
                <div class="relative">
                    <input type="text" id="meu-filtro-input" placeholder="Digite para buscar..." 
                           class="w-full text-xs border border-outline-variant rounded-lg px-3 py-1.5 pl-8 focus:ring-1 focus:ring-secondary focus:border-secondary outline-none bg-surface-container-lowest text-on-surface" />
                    <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/60">search</span>
                </div>

                <!-- Botão Limpar Filtro -->
                <button type="button" class="text-error font-label-md hover:underline text-left cursor-pointer pt-1" 
                        onclick="window.limparMeuFiltro()">Limpar Filtro</button>
            </div>
        </div>
    </div>
</th>
```

---

## 3. Tipos de Dropdowns de Filtro

### A. Filtro de Texto / Busca Rápida (ex: Plaqueta, OS, Usuário, Protocolo)
- Input com ícone de lupa dentro de `.relative`.
- Acionamento via `input` com `debounce` (~300-350ms) para não sobrecarregar requisições nem disparar queries concorrentes.
- Botão "Limpar Filtro" em vermelho (`text-error`) que limpa o input, esconde o dropdown e recarrega a tabela.

### B. Filtro de Seleção / Checklist (ex: Status, Tipo de Problema, Origem)
- Opção `Todas` no topo (marcada por padrão).
- Lista de checkboxes estilizados com classes consistentes (`rounded text-secondary focus:ring-secondary`).
- Ou botões de rádio / botões com pills.
- Botão "Limpar Filtro".

### C. Filtro de Data / Período (ex: Data de Criação, Agendamento)
- Atalhos rápidos: *Hoje*, *Ontem*, *Últimos 7 dias*, *Últimos 30 dias*, *Todo o Período*.
- Checkmark (`check`) que se posiciona ao lado da opção ativa.
- Opcional: Seletor de intervalo personalizado (`input type="date"` Início e Fim) com botão "Aplicar".

---

## 4. Comportamento Javascript e Portal Flutuante (`fixed`)

Tabelas responsivas quase sempre possuem `overflow-x: auto` em seus containers (`#tabela-wrapper`).  
Se o dropdown estiver posicionado como `absolute` dentro de um ancestral com `overflow: hidden` ou `overflow: auto`, ele será cortado.

**Solução Obrigatória (Portal Pattern):**
```javascript
// 1. Mover dropdowns para o <body> ao inicializar:
const dropdowns = [dateDropdown, placaDropdown, statusDropdown];
dropdowns.forEach(d => {
    if (d && d.parentElement !== document.body) {
        document.body.appendChild(d);
    }
});

// 2. Ao abrir, calcular coordenadas e aplicar fixed + z-index alto:
function openFloatingDropdown(triggerBtn, dropdownEl, focusInput) {
    if (!triggerBtn || !dropdownEl) return;
    
    closeAllDropdowns();

    dropdownEl.style.position = 'fixed';
    dropdownEl.style.zIndex = '99999';
    dropdownEl.style.display = 'block';
    dropdownEl.classList.remove('hidden');

    const rect = triggerBtn.getBoundingClientRect();
    const dropdownHeight = dropdownEl.offsetHeight || 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Flip vertical automático se faltar espaço embaixo
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        dropdownEl.style.top = `${Math.max(12, rect.top - dropdownHeight - 4)}px`;
    } else {
        dropdownEl.style.top = `${rect.bottom + 4}px`;
    }

    // Flip horizontal se ultrapassar margem direita da janela
    const dropdownWidth = dropdownEl.offsetWidth || 280;
    if (rect.left + dropdownWidth > window.innerWidth - 16) {
        dropdownEl.style.left = 'auto';
        dropdownEl.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
    } else {
        dropdownEl.style.left = `${Math.max(12, rect.left)}px`;
        dropdownEl.style.right = 'auto';
    }

    if (focusInput) setTimeout(() => focusInput.focus(), 50);
}

// 3. Fechar ao clicar fora, ao rolar a página ou redimensionar:
document.addEventListener('click', (e) => {
    const clickedInsideAny = dropdowns.some(d => d && d.contains(e.target));
    const clickedTrigger = triggers.some(t => t && t.contains(e.target));
    if (!clickedInsideAny && !clickedTrigger) closeAllDropdowns();
});

window.addEventListener('scroll', () => {
    const activeEl = document.activeElement;
    if (activeEl && dropdowns.some(d => d && d.contains(activeEl))) return;
    closeAllDropdowns();
}, true);

window.addEventListener('resize', closeAllDropdowns);
```

---

## 5. Indicador Ativo no Botão (`filter-active-indicator`)

Toda vez que um filtro de cabeçalho tiver um valor diferente do padrão:
- O elemento `<span class="w-2 h-2 rounded-full bg-secondary hidden">` deve ter a classe `.hidden` removida.
- Isso dá ao usuário a visibilidade imediata de quais colunas estão filtrando os resultados exibidos.

---

## 6. O que Fazer com os Botões Globais (ex: Atualizar / Recarregar)?

- Devem ficar no rodapé da tabela (junto aos controles de paginação e contador de registros), ou de forma discreta no cabeçalho do card da tabela (`div` que envolve a tabela).
- **Nunca** crie uma linha inteira isolada apenas para acomodar um único botão de atualizar ou um campo de busca solto.
