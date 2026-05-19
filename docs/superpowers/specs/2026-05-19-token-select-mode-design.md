# Design: Modo de seleção múltipla de tokens

**Data:** 2026-05-19
**Arquivo alvo:** `admin/index.html`
**Status:** aprovado

---

## Contexto

A tabela de tokens exibia checkboxes nativos do browser sempre visíveis na coluna esquerda — esteticamente ruins e confusos (ocupam espaço mesmo quando o usuário não quer fazer ações em lote). A aba Vagas já resolve isso com um padrão de "modo de seleção" (`_vagasSelecting`) ativado por botão. Este spec aplica o mesmo padrão aos tokens com checkboxes customizados.

---

## Decisões de design

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Ativação | Botão toggle no toolbar | Hover reveal (não funciona mobile), ícone sempre visível |
| Estilo checkbox | Custom `div` quadrado arredondado | Nativo accent-color (varia por browser), círculo |

---

## Comportamento

### Botão "Selecionar"

- Posição: toolbar de tokens, à esquerda de "Limpar expirados"
- Estado inativo: borda sutil, texto `☑ Selecionar`, cor `--text-dim`
- Estado ativo: borda cyan, fundo `--cyan-soft`, texto cyan
- ID sugerido: `tokenSelectBtn`

### Modo de seleção (`_tokenSelecting`)

- `_tokenSelecting = false` por padrão — coluna de checkbox oculta
- Ao ativar: coluna aparece, botão fica active, linhas ficam clicáveis para toggle
- Ao desativar: `_tokenSelected.clear()`, rerenderiza tabela, esconde bulk bar
- Trocar de aba desativa automaticamente (mesmo padrão que `switchTab` faz com Vagas)

### Checkbox custom

```css
/* desmarcado */
.token-cb {
  width: 16px; height: 16px;
  border-radius: 5px;
  border: 1.5px solid #3a3a55;
  background: transparent;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: border-color .15s, background .15s;
}

/* marcado */
.token-cb.checked {
  background: var(--cyan);
  border-color: var(--cyan);
}
.token-cb.checked::after {
  content: '';
  width: 9px; height: 5px;
  border-left: 2px solid #000;
  border-bottom: 2px solid #000;
  transform: rotate(-45deg) translateY(-1px);
  display: block;
}

/* header — indeterminate */
.token-cb.indeterminate {
  background: var(--cyan); border-color: var(--cyan);
}
.token-cb.indeterminate::after {
  content: '';
  width: 8px; height: 2px;
  background: #000;
  display: block;
}
```

### Header checkbox (selecionar todos)

- Desmarcado: vazio
- Parcial (1 ≤ n < total): estado indeterminate (traço)
- Todos: marcado
- Clicar no header alterna entre "selecionar todos visíveis" e "desmarcar todos"

### Seleção por linha

Clicar em qualquer célula da linha (exceto botões de ação) togla o checkbox — mesmo comportamento de Vagas.

### Bulk bar

`#token-bulk-bar` já existe. Exibição controlada por:
```js
_tokenSelecting && _tokenSelected.size > 0
```
Botões existentes (Estender +24h, Revogar) não mudam.

---

## Estado

```js
let _tokenSelecting = false;
let _tokenSelected  = new Set(); // Set de token IDs (strings)
```

---

## Funções novas / modificadas

| Função | Ação |
|---|---|
| `toggleTokenSelectMode()` | Alterna `_tokenSelecting`, limpa seleção, rerenderiza |
| `toggleTokenSelect(id)` | Adiciona/remove ID do Set, atualiza visual da linha e bulk bar |
| `toggleSelectAllTokens()` | Seleciona/desmarca todos os tokens filtrados visíveis |
| `renderTokens()` | Gera `<td>` com `.token-cb` quando `_tokenSelecting`, sem `<td>` quando não |
| `_updateTokenBulkBar()` | Mostra/oculta `#token-bulk-bar` e atualiza contagem |
| `switchTab()` | Já existente — adicionar: se `name !== 'tokens' && _tokenSelecting`, chamar `toggleTokenSelectMode()` |

---

## HTML — coluna do header

O `<thead>` é gerado via JS dentro de `renderTokens()` (mesmo padrão das outras tabelas dinâmicas do painel). Quando `_tokenSelecting`, inclui o `<th>` com o checkbox de "selecionar todos"; quando não, omite a coluna inteiramente.

```js
// dentro de renderTokens()
const selectAllTh = _tokenSelecting
  ? `<th style="width:36px;padding-right:4px">
       <div class="token-cb" id="tokenSelectAllCb" onclick="toggleSelectAllTokens()"></div>
     </th>`
  : '';
```

---

## O que NÃO muda

- Botões de ação individuais por linha (copiar link, regenerar, deletar) — continuam visíveis no modo de seleção
- Bulk bar existente (`#token-bulk-bar`) — só o trigger de exibição muda
- Drawer de detalhes do token — continua funcionando normalmente (clicar em linha abre drawer apenas fora do modo de seleção)

---

## Escopo fora deste spec

- Estilização dos checkboxes em outras abas (CVs)
- Novas ações de bulk (além das já existentes)
