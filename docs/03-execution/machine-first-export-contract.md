# Machine-First Export Contract

## Objetivo

O arquivo `project_insights_export.json` passa a ser o contrato analítico principal do Project Insights / CannaConverter 2.0.

Ele foi desenhado para:

- servir como fonte única de verdade para a próxima ferramenta de leitura executiva;
- reduzir inferência do consumidor;
- manter serialização estável, tipada e machine-first;
- preservar compatibilidade temporária com `fact_*.csv` e `manifest.json`.

## Arquivo principal

- `project_insights_export.json`

## Regras do contrato

- números são exportados como número JSON;
- percentuais usam escala `0_100`;
- datas usam ISO 8601;
- booleanos usam `true` / `false`;
- enums e reason codes usam inglês técnico estável;
- não há frases prontas para UI dentro do contrato.

## Estrutura raiz

- `schema_version`
- `package_type`
- `generated_at`
- `generator_name`
- `generator_version`
- `project`
- `conventions`
- `snapshot`
- `disciplines`
- `tasks`
- `compensation`

## Decisões de compatibilidade

- os CSVs existentes continuam sendo gerados nesta fase;
- `manifest.json` continua sendo gerado como artefato de compatibilidade;
- `manifest.json` agora aponta para `project_insights_export.json` como `primary_machine_file`;
- o novo JSON não depende dos CSVs para leitura futura;
- os CSVs permanecem úteis para Power BI e transição controlada.

## Campos novos relevantes

- raiz:
  - `schema_version`
  - `package_type`
  - `generator_name`
  - `generator_version`
- `snapshot`:
  - `project_status_code`
  - `schedule_status_code`
  - `data_confidence_code`
  - `project_health_band`
  - `status_reason_codes`
  - `project_progress_planned_percent`
  - `schedule_reference_code`
- `disciplines`:
  - `display_name`
  - `meeting_rank`
  - `impact_rank`
  - `is_critical`
  - `is_attention_now`
  - `attention_reason_codes`
  - `planned_progress_percent`
  - `delay_days`
- `tasks`:
  - `display_name`
  - `task_type`
  - `is_operational_task`
  - `planned_progress_percent`
  - `is_delayed_relevant`
  - `is_in_current_window`
  - `is_in_next_window`
  - `is_attention_now`
  - `attention_reason_codes`
  - `progress_source_code`
- `compensation`:
  - `meeting_rank`
  - `selection_reason_codes`

## Campos reaproveitados

- IDs estáveis:
  - `project_id`
  - `snapshot_id`
  - `discipline_id`
  - `discipline_snapshot_id`
  - `task_snapshot_id`
- métricas centrais:
  - `project_score`
  - `progress_gap_percent`
  - `remaining_weight_percent`
  - `delay_days`
  - `impact_rank`
  - `priority_rank`

## Campos renomeados ou reinterpretados

- `fact_snapshots.schedule_status` -> `snapshot.schedule_status_code`
- `fact_snapshots.overall_status` -> `snapshot.project_status_code`
- `fact_disciplines.score_status` -> `disciplines[].score_status_code`
- `fact_tasks.progress_source` -> `tasks[].progress_source_code`
- `fact_tasks.is_summary` + `fact_tasks.is_milestone` -> `tasks[].task_type`

## Campos deliberadamente não levados como texto final

- mensagens de resumo para UI;
- frases de recomendação;
- mensagens decorativas de compensação;
- descrições verbais que podem ser traduzidas por outra camada.

## Limitações atuais

- `timezone` foi explicitado como `SOURCE_OR_UTC` porque o app preserva datas do arquivo de origem e gera `generated_at` em UTC;
- `delay_days` em tasks e compensation segue a semântica operacional atual do snapshot;
- `discipline.delay_days` usa agregação `MAX_TASK_DELAY_DAYS`.

## Próximo passo recomendado

Quando a próxima ferramenta estiver pronta para consumir apenas JSON:

1. tornar `project_insights_export.json` o caminho oficial único;
2. reduzir a dependência dos CSVs a compatibilidade legada;
3. só então avaliar retirada gradual de `fact_*.csv`.
