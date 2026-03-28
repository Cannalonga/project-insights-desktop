# CannaConverter 2.0 — Regras de Engenharia

## Princípios Gerais

- Código simples é obrigatório
- Clareza é mais importante que abstração
- Legibilidade é prioridade
- Cada função deve ter responsabilidade única

---

## Estrutura de Código

- Evitar arquivos grandes
- Evitar funções longas
- Evitar aninhamento profundo
- Preferir funções pequenas e explícitas

---

## Nomeação

- Usar nomes claros e descritivos
- Evitar abreviações desnecessárias
- Código em inglês
- Documentação em português

---

## Lógica de Negócio

- Deve existir apenas no Core
- Não deve estar na UI
- Não deve estar no parser
- Não deve estar no export

---

## Erros e Falhas

- Nenhum erro pode ser ignorado
- Nenhum erro pode ser silencioso
- Toda falha deve ser explícita

---

## Dependências

- Usar o mínimo possível
- Evitar bibliotecas pesadas
- Não adicionar dependências sem necessidade clara

---

## Abstração

- Não criar abstrações antecipadas
- Não criar interfaces sem necessidade
- Não generalizar código cedo

---

## Testabilidade

- Código deve ser testável
- Evitar acoplamento
- Evitar dependências ocultas

---

## Organização

- Seguir a estrutura definida na arquitetura
- Não criar novas camadas
- Não misturar responsabilidades

---

## Regra Final

Se o código estiver difícil de entender, ele está errado.
