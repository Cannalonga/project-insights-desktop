# CannaConverter 2.0 — Starter Pack

## Objetivo

Este documento define como iniciar a implementação do projeto sem violar as regras arquiteturais.

---

## Princípios de Execução

- Implementar apenas o necessário para o pipeline funcionar
- Não antecipar funcionalidades futuras
- Não criar abstrações sem uso imediato
- Manter o código simples e legível
- Evitar dependências externas

---

## Ordem de Implementação

A implementação deve seguir estritamente esta ordem:

1. model
2. parser
3. validation
4. diagnostics
5. export
6. use-cases (app)
7. UI

Não alterar esta ordem.

---

## Etapa 1 — Model

Criar estruturas básicas de dados que representem:

- Project
- Task
- Resource
- Dependency

Regras:
- Estruturas simples
- Sem lógica complexa
- Sem validação embutida

---

## Etapa 2 — Parser

Criar um parser inicial capaz de:

- receber XML MSPDI
- extrair dados básicos

Regras:
- Não validar dados aqui
- Não transformar dados além do necessário
- Não tentar corrigir inconsistências

Observação:
- `.MPP` permanece como objetivo do produto
- na V1, a entrada real processada será XML MSPDI convertido localmente

---

## Etapa 3 — Validation

Implementar validações como:

- referências inexistentes
- dados obrigatórios ausentes

Regras:
- Não corrigir dados automaticamente
- Apenas identificar problemas

---

## Etapa 4 — Diagnostics

Criar estrutura de diagnóstico:

- erros
- avisos

Regras:
- Mensagens claras
- Sem ocultar problemas

---

## Etapa 5 — Export

Implementar:

- export CSV
- export JSON

Regras:
- Baseado apenas no internal model
- Sem lógica adicional

---

## Etapa 6 — Use Cases

Criar orquestração do fluxo:

- load file
- run pipeline
- return results

---

## Etapa 7 — UI

Implementar interface simples para:

- selecionar arquivo
- executar processamento
- visualizar resultados
- exportar dados

Regras:
- UI não contém lógica de negócio

---

## O que NÃO fazer

- Não criar serviços genéricos
- Não criar factories desnecessárias
- Não usar dependency injection
- Não criar camadas extras
- Não antecipar features

---

## Critério de Avanço

Cada etapa só pode avançar se:

- estiver funcional
- estiver simples
- estiver alinhada com a arquitetura
