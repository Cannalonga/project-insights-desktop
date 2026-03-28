# Project Insights - Baseline de Validacao em Campo

## Status

Este documento congela o marco aprovado do produto antes da validacao em campo com engenheiros e planejadores.

- produto: `Project Insights`
- repositorio: `D:\CannaConverter_2.0`
- commit de referencia: `849c8c1`
- tag de referencia: `v1.0.0-analytics-ready`
- pacote local de distribuicao: `D:\Repo_Dist_Local_Project_Insights`

## O que esta aprovado neste baseline

- parser MSPDI com leitura correta de baseline aninhado
- `delay_days` corrigido com semantica de snapshot operacional
- `discipline_name` normalizado na origem para evitar fragmentacao no BI
- pacote analitico CSV validado com:
  - `fact_tasks.csv`
  - `fact_disciplines.csv`
  - `fact_snapshots.csv`
  - `fact_compensation.csv`
  - `manifest.json`
- `project_name` preenchido corretamente no snapshot
- `schedule_status` coerente com atraso real
- executavel local empacotado e funcional fora do ambiente de dev

## Resultado esperado nesta fase

Durante a validacao em campo, o foco e coletar feedback de uso real sobre:

- clareza da interface
- entendimento da Visao Executiva
- confianca na leitura operacional
- utilidade das acoes priorizadas
- aderencia do pacote CSV ao consumo no Power BI

## O que nao deve mudar durante a validacao

Para preservar comparabilidade de feedback, este baseline deve ficar congelado em:

- pipeline analitico
- calculos principais
- estrutura dos CSVs
- chaves tecnicas e granularidade
- regras atuais da Decision Layer

Mudancas novas so devem entrar depois da rodada de campo, com base no feedback consolidado.

## Regras para feedback

Registrar feedback em tres grupos:

1. erro real
2. melhoria de clareza
3. oportunidade futura

Evitar misturar:

- bug analitico
- preferencia visual
- ideia de expansao de produto

## Criterio para proxima rodada

Ao final da validacao em campo, decidir apenas entre:

- manter como esta
- ajustar UX e narrativa
- corrigir bug real encontrado

Nao iniciar nova expansao de escopo antes de fechar essa leitura.

## Observacao final

Este baseline representa o primeiro estado do produto aprovado tecnicamente e executivamente para validacao real.
