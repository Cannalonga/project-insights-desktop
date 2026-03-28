# CannaConverter 2.0 — Arquitetura

## Visão Geral

A arquitetura do sistema é baseada em um pipeline linear de processamento de dados.

O sistema é dividido em duas camadas principais:

- Core (processamento)
- UI (interface)

Toda lógica de negócio reside exclusivamente no Core.

---

## Pipeline do Sistema

O fluxo interno segue a sequência:

MPP -> parse -> internal model -> validate -> diagnostics -> export

Cada etapa é isolada e possui responsabilidade única.

Na V1, a entrada real do parser será XML MSPDI.

Arquivos `.MPP` continuam dentro do escopo do produto, mas dependem de conversão local prévia nesta fase.

---

## Estrutura de Diretórios

```text
src/
  core/
    parser/
    model/
    validation/
    diagnostics/
    export/
    insights/
  app/
    use-cases/
  ui/
```
