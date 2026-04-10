# Contrato Tecnico Inicial do Formato Primavera XER

## Proposito

Este documento define o contrato tecnico inicial para leitura de arquivos Primavera XER no Project Insights.

O objetivo e permitir a evolucao futura para suporte Primavera sem contaminar o core analitico atual. O XER deve entrar por uma fronteira propria de ingestao, passar por um modelo intermediario Primavera e somente depois ser convertido para o modelo canonico `Project`.

No ecossistema Primavera P6, XER deve ser tratado como formato nativo principal de intercambio, assim como MPP e o formato prioritario no ecossistema MS Project.

Este documento nao implementa parser, adapter ou integracao. Ele apenas registra as decisoes iniciais para orientar uma implementacao segura.

## Visao Geral Do Formato

XER e um formato textual tabular. Ele nao e XML.

A estrutura observada usa marcadores por linha:

- `%T`: declara uma tabela.
- `%F`: declara os campos da tabela atual.
- `%R`: declara um registro da tabela atual.

Exemplo conceitual:

```text
%T	TASK
%F	task_id	proj_id	wbs_id	task_name
%R	1001	10	200	Example activity
```

O encoding deve ser tratado explicitamente. Os fixtures analisados nao sao UTF-8 puro em todos os casos; foram observados arquivos legiveis como `latin-1` e `cp1252`. Um parser XER nao deve assumir UTF-8 ingenuamente.

## Fixtures De Referencia

### Refinery Shutdown Schedule.xer

Bom para validar:

- estrutura tabular XER;
- leitura de `PROJECT`, `PROJWBS`, `TASK`, `TASKPRED`, `TASKRSRC`, `RSRC` e `CALENDAR`;
- relacoes entre tarefas;
- recursos;
- baseline/datas planejadas;
- comportamento de arquivo sem progresso real relevante.

Resumo observado:

- 15 tabelas;
- 1 projeto;
- 482 itens de WBS;
- 2.880 atividades;
- 3.235 relacionamentos;
- 645 atribuicoes de recursos;
- 6 recursos;
- 6 calendarios.

Limitacao: forte para estrutura, mas limitado para validar progresso executado, pois as atividades estavam sem progresso real relevante.

### Baseline Zone 2 Rev.01.xer

Bom para validar:

- WBS complexa;
- codigos de atividade;
- UDFs;
- grande volume de relacoes;
- recursos e atribuicoes;
- baseline;
- integracao com narrativa tecnica externa.

Resumo observado:

- 19 tabelas;
- 1 projeto;
- 1.134 itens de WBS;
- 3.353 atividades;
- 8.938 relacionamentos;
- 8.786 atribuicoes de recursos;
- 8.817 associacoes de codigos de atividade;
- 25 recursos;
- 7 calendarios;
- 96 valores UDF.

Limitacao: tambem e forte para estrutura, mas limitado para validar progresso realizado, pois as atividades estavam como nao iniciadas e sem datas reais.

### Multipurpose Real Property Complex Narrative - Zone 2.docx

Bom para validar o contexto do XER `Baseline Zone 2 Rev.01.xer`.

A narrativa confirma:

- projeto Primavera P6;
- 3.353 atividades;
- baseline;
- caminho critico;
- calendarios;
- activity codes;
- histograms;
- cronograma resource loaded com manhours, cash flow e materiais;
- estrutura com engenharia, procurement, construction e handing over.

## Tabelas Essenciais

As tabelas abaixo formam o minimo necessario para um primeiro suporte funcional.

### PROJECT

Representa os metadados principais do projeto.

Importa porque define identificador, nome, calendario padrao e datas globais candidatas.

Deve alimentar o modelo intermediario com:

- `proj_id`;
- `proj_short_name`;
- `plan_start_date`;
- `plan_end_date`;
- `scd_end_date`;
- `last_recalc_date`;
- `next_data_date`;
- `clndr_id`;
- tipo padrao de percentual completo, quando relevante.

Risco se ignorada ou mal interpretada: o projeto pode perder identidade, datas de referencia e contexto de baseline.

### PROJWBS

Representa a Work Breakdown Structure do Primavera.

Importa porque e a fonte primaria da hierarquia estrutural no XER.

Deve alimentar o modelo intermediario com:

- `wbs_id`;
- `proj_id`;
- `parent_wbs_id`;
- `wbs_short_name`;
- `wbs_name`;
- `seq_num`;
- `proj_node_flag`;
- `status_code`.

Risco se ignorada ou mal interpretada: o adapter perde agrupamentos executivos, disciplinas, blocos, frentes e escopos.

### TASK

Representa as atividades do cronograma.

Importa porque contem as tarefas operacionais, datas, duracoes, status e progresso.

Deve alimentar o modelo intermediario com:

- `task_id`;
- `proj_id`;
- `wbs_id`;
- `clndr_id`;
- `task_code`;
- `task_name`;
- `task_type`;
- `status_code`;
- `phys_complete_pct`;
- `complete_pct_type`;
- `target_drtn_hr_cnt`;
- `remain_drtn_hr_cnt`;
- `act_work_qty`;
- `remain_work_qty`;
- `target_work_qty`;
- `target_start_date`;
- `target_end_date`;
- `early_start_date`;
- `early_end_date`;
- `restart_date`;
- `reend_date`;
- `act_start_date`;
- `act_end_date`;
- `total_float_hr_cnt`;
- `free_float_hr_cnt`.

Risco se ignorada ou mal interpretada: datas, duracoes, marcos, progresso e leitura operacional ficam incorretos.

### TASKPRED

Representa os relacionamentos entre atividades.

Importa porque preserva a rede logica do cronograma.

Deve alimentar o modelo intermediario com:

- `task_pred_id`;
- `task_id`;
- `pred_task_id`;
- `proj_id`;
- `pred_proj_id`;
- `pred_type`;
- `lag_hr_cnt`.

Risco se ignorada ou mal interpretada: o sistema perde leitura de dependencias, sequenciamento e caminho logico.

### TASKRSRC

Representa atribuicoes de recursos nas atividades.

Importa porque liga atividades a recursos e ajuda a entender cronogramas resource loaded.

Deve alimentar o modelo intermediario com:

- `taskrsrc_id`;
- `task_id`;
- `proj_id`;
- `rsrc_id`;
- `role_id`;
- `remain_qty`;
- `target_qty`;
- `act_reg_qty`;
- `act_ot_qty`;
- `remain_cost`;
- `target_cost`;
- `act_start_date`;
- `act_end_date`;
- `target_start_date`;
- `target_end_date`.

Risco se ignorada ou mal interpretada: perde-se parte da leitura de recursos, manhours, custos e carga operacional.

### RSRC

Representa recursos.

Importa porque nomeia e classifica recursos usados em `TASKRSRC`.

Deve alimentar o modelo intermediario com:

- `rsrc_id`;
- `parent_rsrc_id`;
- `clndr_id`;
- `role_id`;
- `rsrc_name`;
- `rsrc_short_name`;
- `rsrc_type`.

Risco se ignorada ou mal interpretada: atribuicoes ficam anonimas ou parecem referencias quebradas.

### CALENDAR

Representa calendarios.

Importa porque o Primavera pode usar calendarios de projeto, recurso e base.

Deve alimentar o modelo intermediario com:

- `clndr_id`;
- `clndr_name`;
- `proj_id`;
- `base_clndr_id`;
- `clndr_type`;
- `day_hr_cnt`;
- `week_hr_cnt`;
- `month_hr_cnt`;
- `year_hr_cnt`;
- `clndr_data`.

Risco se ignorada ou mal interpretada: duracoes em horas podem ser entendidas fora do contexto de calendario.

Na primeira fase, e aceitavel capturar os metadados do calendario sem interpretar toda a estrutura interna de `clndr_data`.

## Tabelas Importantes Para Fases Futuras

### ACTVTYPE, ACTVCODE e TASKACTV

Essas tabelas representam tipos de codigos, valores de codigos e associacoes de codigos por atividade.

Sao valiosas para:

- areas;
- blocos;
- predios;
- niveis;
- disciplinas;
- fases;
- frentes de controle.

Nao devem substituir a WBS como verdade estrutural primaria na primeira fase. Devem entrar como enriquecimento complementar depois que a base estrutural estiver correta.

### UDFTYPE e UDFVALUE

Representam campos customizados.

Sao valiosos porque podem carregar informacoes especificas do cliente, contrato ou metodologia de planejamento.

Devem ser preservados no modelo intermediario quando possivel, mas nao devem bloquear a primeira versao do adapter.

## Hierarquia Estrutural

Este ponto e critico.

No Primavera, `PROJWBS` e a fonte primaria da hierarquia. A tabela `TASK` depende de `wbs_id` para organizacao executiva.

`TASKPRED` representa relacoes entre atividades, nao hierarquia.

Activity Codes nao devem ser tratados como verdade estrutural primaria na primeira fase. Eles sao enriquecimento complementar e podem ajudar em agrupamentos alternativos, mas nao substituem a WBS.

Um futuro adapter deve preservar:

- raiz do projeto;
- arvore WBS;
- ordem por `seq_num`;
- relacao `TASK -> WBS`;
- relacao `TASK -> TASKPRED`;
- relacao `TASK -> TASKRSRC -> RSRC`.

## Modelo Intermediario Recomendado

O parser XER deve produzir um modelo intermediario Primavera antes de qualquer conversao para `Project`.

Modelo conceitual recomendado:

```text
XerProjectRaw
  projects: XerProjectRecord[]
  wbs: XerWbsRaw[]
  tasks: XerTaskRaw[]
  relationships: XerRelationshipRaw[]
  resources: XerResourceRaw[]
  taskResources: XerTaskResourceRaw[]
  calendars: XerCalendarRaw[]
  activityCodes?: XerActivityCodeRaw[]
  taskActivityCodes?: XerTaskActivityCodeRaw[]
  udfTypes?: XerUdfTypeRaw[]
  udfValues?: XerUdfValueRaw[]
  sourceEncoding: string
  sourceTables: string[]
```

Blocos conceituais:

- `XerProjectRecord`: metadados de `PROJECT`.
- `XerWbsRaw`: itens de `PROJWBS`.
- `XerTaskRaw`: atividades de `TASK`.
- `XerRelationshipRaw`: relacoes de `TASKPRED`.
- `XerResourceRaw`: recursos de `RSRC`.
- `XerTaskResourceRaw`: atribuicoes de `TASKRSRC`.
- `XerCalendarRaw`: calendarios de `CALENDAR`.
- `XerActivityCodeRaw`: tipos e valores de codigos de atividade.
- `XerTaskActivityCodeRaw`: associacoes entre tarefa e codigo.

Esse modelo intermediario deve ser especifico de Primavera. Ele nao deve vazar para o core analitico.

## Mapeamento Para Project Canonico

O mapeamento inicial deve ser conservador.

Ja esta claro:

- `PROJECT` alimenta metadados do projeto.
- `PROJWBS` alimenta hierarquia e agrupamento estrutural.
- `TASK` alimenta tarefas.
- `TASKPRED` alimenta dependencias.
- `RSRC` e `TASKRSRC` alimentam recursos e assignments.
- Activity Codes podem alimentar metadados complementares.

Ainda depende de fixtures futuros:

- escolha definitiva entre `target_start/end`, `early_start/end`, `restart/reend` para datas atuais;
- regra de baseline Primavera mais fiel;
- uso de `last_recalc_date`, `next_data_date` ou outra data como status date;
- interpretacao completa de calendarios;
- peso por recursos/custos versus duracao;
- uso de UDFs para informacoes de negocio.

O adapter `XER -> Project` deve evitar decisao irreversivel cedo demais. Onde houver incerteza, deve preservar dados no modelo intermediario e mapear apenas o que for seguro.

## Campos E Temas Sensiveis

### Encoding

Nao assumir UTF-8 puro. O parser deve detectar ou aceitar encoding explicitamente. `cp1252` e `latin-1` ja apareceram em fixtures reais.

### Multiplos campos de data

Primavera possui varias familias de datas. A primeira versao deve documentar claramente qual campo foi usado para cada papel no `Project` canonico.

Nao assumir que `target_*`, `early_*`, `restart/reend` e `act_*` significam a mesma coisa.

### Baseline

Baseline em Primavera pode nao corresponder diretamente ao baseline MSPDI. A primeira versao deve mapear com cautela e validar contra narrativa/fixtures.

### Progresso fisico e ausencia de progresso real

Os fixtures atuais sao baselines com progresso real ausente. Eles validam estrutura, mas nao validam bem execucao.

Antes de liberar leitura Primavera completa, sera necessario fixture com progresso real, datas reais ou atualizacao de obra.

### Datas atuais vs planejadas

Nao apresentar inferencia como certeza. Quando a fonte de data for limitada, a confiabilidade deve refletir essa limitacao.

### Calendarios

Calendarios devem ser capturados desde o inicio, mas a interpretacao completa de `clndr_data` pode ser fase futura se nao for necessaria para o primeiro mapeamento seguro.

### UDFs

UDFs devem ser preservados como metadados quando possivel, mas nao devem ser dependencia obrigatoria da primeira versao.

### Activity Codes

Activity Codes sao importantes para enriquecimento, filtros e agrupamentos complementares. Na primeira fase, nao devem substituir WBS.

### Resource-loaded schedule

`TASKRSRC` e `RSRC` indicam que o cronograma pode carregar recursos, horas e custos. A primeira fase pode usar recursos para assignments, deixando pesos por custo/hora para etapa posterior.

## Faseamento Recomendado

### Fase 1: Parser tabular XER

Criar leitor isolado de `%T`, `%F`, `%R`, com encoding explicito e validacoes basicas.

### Fase 2: Modelo intermediario Primavera

Criar modelo `XerProjectRaw` e estruturas relacionadas, sem converter ainda para `Project`.

### Fase 3: Adapter experimental XER -> Project

Mapear apenas campos seguros para o `Project` canonico, preservando WBS, tasks, dependencias e recursos.

### Fase 4: Testes com fixtures reais

Usar os fixtures ja analisados e adicionar pelo menos um fixture futuro com progresso real.

### Fase 5: Integracao controlada

Somente depois de parser, modelo intermediario, adapter e testes, integrar ao detector e ao pipeline oficial.

Nao plugar XER direto no app principal cedo demais.

## Regras De Protecao

- Nao tratar XER como XML.
- Nao tentar parsear Primavera como MPP.
- Nao duplicar `analyzeProject`.
- Nao usar Activity Codes como estrutura primaria no comeco.
- Nao integrar ao fluxo oficial sem fixtures suficientes.
- Nao simplificar WBS.
- Nao assumir que todos os XER virao com o mesmo encoding.
- Nao assumir que todos os XER terao os mesmos campos preenchidos.
- Nao descartar tabelas desconhecidas sem registrar sua existencia.
- Nao transformar limitacao de dados em conclusao executiva forte.

## Recomendacao Final

XER deve ser a prioridade do ecossistema Primavera no Project Insights.

O suporte Primavera e viavel na arquitetura atual porque a ingestao ja esta separada e o motor analitico opera sobre `Project`.

A chave do sucesso sera preservar WBS, relacoes, recursos e mapeamento estrutural antes de tentar enriquecer a analise com Activity Codes, UDFs ou calendarios completos.

O motor analitico deve permanecer intacto. Primavera deve entrar por adapter proprio, transformando XER em `Project` sem duplicar regra de negocio.

