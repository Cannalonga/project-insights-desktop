# CannaConverter 2.0 — Contexto Central

## Visão Geral

O CannaConverter 2.0 é uma aplicação desktop local, offline-first, criada para transformar arquivos Microsoft Project (.MPP) em dados estruturados, utilizáveis e confiáveis.

O foco do projeto não é apenas converter arquivos, mas extrair valor real dos dados contidos em MPP e disponibilizá-los em formatos úteis para análise, integração local e consumo em ferramentas de BI.

Este projeto não é um SaaS, não possui backend e não depende de infraestrutura externa.

Na V1, o primeiro formato real de entrada processado será XML MSPDI, por ser um formato aberto do ecossistema Microsoft Project.

Arquivos `.MPP` permanecem no objetivo do produto, mas nesta fase dependem de conversão local prévia para XML MSPDI.

---

## Tipo de Projeto

- Aplicação desktop local
- Execução offline-first
- Sem backend
- Sem serviços externos
- Sem banco de dados
- Sem autenticação
- Sem arquitetura distribuída

---

## Objetivo Central

Transformar dados de cronogramas do ecossistema Microsoft Project em informações estruturadas e utilizáveis por meio de um pipeline confiável, transparente e previsível.

Saídas esperadas:
- CSV limpo
- JSON estruturado
- dados preparados para consumo em BI

---

## Pipeline Principal

O sistema deve seguir rigorosamente o seguinte fluxo:

```text
MPP -> parse -> internal model -> validate -> diagnostics -> export
```
