# Mapa de Zonas Críticas de Lógica do Sistema

Este documento identifica as áreas críticas do Project Insights que não devem ser modificadas sem análise de impacto, testes de equivalência e validação manual. A logica abaixo existe para lidar com limitacoes reais de arquivos MPP/MSPDI, ausencia de IA e necessidade de leitura executiva confiavel.

## Fluxo protegido

```text
origem do cronograma
-> validateInputFile / leitura ou conversao MPP
-> detectInputFormat
-> adapter MPP ou MSPDI
-> Project canonico
-> analyzeProject
-> exports / relatorios / UI
```

Classificação:
- Complexidade essencial: não pode ser simplificada sem alto risco de regressão.
- Complexidade de compatibilidade: pode evoluir com cuidado e testes.
- Fora do core analítico: deve permanecer isolado e não acoplado à análise.

## Mapa das zonas criticas

| Area | Arquivos principais | Classificacao | Papel |
| --- | --- | --- | --- |
| Conversao MPP para MSPDI | `src/app/use-cases/convert-mpp-to-xml.ts`, comando Tauri `convert_mpp_to_mspdi` | Complexidade essencial | Ponte local entre `.mpp` e XML MSPDI. |
| Fallback guiado de entrada | `src/app/use-cases/process-project-file.ts`, `src/ui/hooks/use-process-mpp.ts` | Complexidade essencial | Orienta o usuario quando MPP nao pode ser convertido de forma confiavel. |
| Deteccao de formato | `src/ingestion/shared/detect-input-format.ts` | Complexidade de compatibilidade | Separa origem (`mpp`, `mspdi-xml`, `unknown`) sem contaminar o core. |
| Orquestracao de ingestao | `src/ingestion/shared/process-project-input.ts`, `src/ingestion/mpp/adapter-mpp.ts`, `src/ingestion/mspdi/adapter-mspdi.ts` | Complexidade essencial | Converte entrada em `Project` canonico. |
| Parser MSPDI | `src/core/parser/parse-mspdi.ts`, `src/core/parser/mspdi-parse-error.ts` | Complexidade essencial | Extrai tarefas, datas, baseline, recursos, assignments e dependencias com limites de seguranca. |
| Modelo canonico | `src/core/model/project.ts`, `src/core/model/task.ts`, `src/core/model/dependency.ts`, `src/core/model/resource.ts` | Complexidade essencial | Contrato interno consumido pela analise. |
| Mapper Raw -> Project | `src/core/mapper/map-project.ts` | Complexidade essencial | Normaliza campos ausentes, filtra task `0`, recupera `parentId` por outline e cria recurso `Unassigned`. |
| Validacao e diagnostics | `src/core/validation/validate-project.ts`, `src/core/diagnostics/*` | Complexidade essencial | Detecta problemas estruturais, datas, duracoes, dependencias e recursos. |
| Qualidade de entrada | `src/core/input-quality/build-mpp-input-quality.ts`, `src/core/input-quality/build-project-input-quality.ts` | Complexidade essencial | Decide se a base e analisavel ou se conclusoes devem ser limitadas. |
| Motor analitico | `src/core/analysis/analyze-project.ts` | Complexidade essencial | Ponto central que combina diagnostics, score, insights, disciplinas, pesos, curva S, status, confiabilidade e alertas. |
| Disciplinas e recortes | `src/core/disciplines/build-project-disciplines.ts` | Complexidade essencial | Usa outline/summary para recortar frentes operacionais e inferir tipos de disciplina. |
| Modelo de pesos | `src/core/weight/build-project-weight-model.ts` | Complexidade essencial | Normaliza o valor do projeto e calcula impacto, progresso usado e pendencia. |
| Status de prazo | `src/core/schedule/build-schedule-status.ts` | Complexidade essencial | Usa baseline quando possivel e inferencia controlada quando baseline nao existe. |
| Curva S | `src/core/s-curve/build-s-curve.ts` | Complexidade essencial | Distribui pesos por semanas usando baseline, datas atuais e progresso real. |
| Compensacao operacional | `src/core/compensation/*` | Complexidade essencial | Identifica capacidade de recuperacao por tarefas e disciplinas prioritarias. |
| Confiabilidade da analise | `src/core/reliability/build-analysis-reliability.ts` | Complexidade essencial | Bloqueia conclusoes fortes quando progresso, prazo ou qualidade de dados nao sustentam leitura executiva. |
| Alertas executivos | `src/core/alerts/build-executive-alerts.ts` | Complexidade essencial | Traduz sinais tecnicos em alertas curtos de decisao. |
| Score executivo | `src/core/score/build-project-score.ts` | Complexidade essencial | Penaliza riscos por diagnostics, cobertura, baseline, progresso e historico. |
| Historico e comparacao | `src/app/history/*`, `src/app/comparison/*`, `src/app/use-cases/process-mpp-with-history.ts` | Complexidade de compatibilidade | Compara snapshots e recalcula score, gap e confiabilidade com contexto historico. |
| Exports analiticos | `src/app/use-cases/build-process-exports.ts`, `src/core/export/*`, `src/ui/export/prepare-text-export.ts` | Complexidade de compatibilidade | Mantem contratos externos JSON/XML/CSV/Power BI e BOM CSV apenas na saida. |
| Relatorio executivo/PDF | `src/core/report/*`, `src/app/use-cases/build-executive-report-scope.ts`, `src/app/use-cases/export-executive-pdf.ts` | Complexidade de compatibilidade | Apresenta a leitura executiva preservando escopo global ou por disciplina. |
| Licenciamento | `src/app/license/*`, `src/core/license/*`, `src/infrastructure/license/*`, `src/ui/license/*` | Fora do core analitico, protegido | Deve permanecer isolado da ingestao e da analise. |

## Detalhamento por zona

### Conversao MPP e fallback de entrada

- Faz: chama a conversao local Tauri de `.mpp` para XML MSPDI e orienta fallback para XML quando falha.
- Por que existe: `.mpp` pode variar por versao do MS Project e nao e uma fonte textual simples.
- Nao pode quebrar: classificacao `MPP_CONVERSION_FAILED`, mensagem guiada ao usuario, log tecnico exportavel, stages de processamento.
- Não pode ser substituído por erro técnico genérico.
- Exemplo esperado: se `.mpp` nao converter, o usuario recebe instrucao para exportar MSPDI XML em vez de erro generico.
- Testes: `process-project-file.test.ts`, `process-project-file.integration.test.ts`, `adapter-mpp.test.ts`, `process-mpp.test.ts`.
- Risco se alterada: usuario perde caminho de recuperacao e o app parece simplesmente "quebrado".

### Parser MSPDI

- Faz: valida XML seguro, limita tamanho/profundidade, exige raiz `Project`, le tarefas, baseline, recursos, assignments e dependencias.
- Por que existe: MSPDI real pode vir incompleto, grande, com namespaces, assignments faltantes ou campos alternativos.
- Nao pode quebrar: bloqueio de XML inseguro, limite de tamanho, limite de tasks, deteccao de `Tasks`, fallback `PercentComplete`/`PercentageComplete`, baseline primaria, assignments para resources.
- Exemplo esperado: XML sem `Tasks` falha; XML com baseline em `Baseline` ainda alimenta datas de baseline; assignment com `ResourceUID=-1` chega como recurso nao atribuido.
- Testes: `parse-mspdi.test.ts`, `adapter-mspdi.test.ts`, `detect-input-format.test.ts`.
- Risco se alterada: perda silenciosa de datas, baseline, recursos ou progresso, afetando toda a analise posterior.

### Mapper e modelo canonico

- Faz: transforma `RawProject` em `Project` com defaults seguros e recuperacao estrutural.
- Por que existe: o core nao deve depender de formato de origem nem lidar com campos opcionais crus.
- Nao pode quebrar: remocao da task `0`, preenchimento de strings/numeros padrao, `parentId` por `OutlineNumber`, filtro de dependencias invalidas, recurso `Unassigned`.
- Exemplo esperado: uma task sem `OutlineParentUID`, mas com `OutlineNumber=1.2`, recebe `parentId` do item `1`.
- Testes: `map-project.test.ts`.
- Risco se alterada: disciplinas, escopos, dependencias e recursos passam a ser calculados sobre hierarquia errada.

### Validacao, diagnostics e qualidade de entrada

- Faz: separa problemas fatais de limitacoes toleraveis e agrega diagnostics repetitivos.
- Por que existe: sem IA, o sistema precisa saber quando uma conclusao e forte, limitada ou indevida.
- Nao pode quebrar: projeto vazio como fatal, ausencia de tasks operacionais como fatal, cobertura de datas/progresso/baseline como limitacao, agrupamento de erros massivos.
- Exemplo esperado: cronograma sem datas atuais validas nao deve gerar leitura executiva forte.
- Testes: `validate-project.test.ts`, `build-diagnostics.test.ts`, `build-diagnostics-aggregation.test.ts`, `build-project-input-quality.test.ts`, `build-mpp-input-quality.test.ts`.
- Risco se alterada: conclusoes executivas podem ser apresentadas com confiabilidade falsa.

### Motor analitico central

- Faz: recebe `Project` e produz o resultado analitico completo.
- Por que existe: concentra a regra de negocio independente da origem do arquivo.
- Nao pode quebrar: ordem logica de validacao -> diagnostics -> qualidade -> insights -> score -> disciplinas -> pesos -> progresso -> curva S -> prazo -> compensacao -> confiabilidade -> alertas -> relatorio.
- Não pode conhecer origem do arquivo (MPP, MSPDI, Primavera etc.).
- Exemplo esperado: input fatal dispara `ProjectAnalysisFatalError`, convertido no wrapper para erro compativel.
- Testes: `analyze-project.test.ts`, `project-processing-equivalence.test.ts`, `process-mpp.test.ts`.
- Risco se alterada: regressao sistemica em score, insights, exportacoes e PDF.

### Disciplinas, pesos, progresso e curva S

- Faz: cria recortes por outline, calcula peso normalizado, progresso usado e distribuicao temporal.
- Por que existe: cronograma MPP nao traz uma leitura executiva pronta; o app precisa inferir impacto operacional sem custo real.
- Nao pode quebrar: raiz de disciplina por summary level 1, classificacao por texto (`civil`, `mec`, `ele`, `comiss`), prioridade de progresso `percentComplete -> physicalPercentComplete -> actualEndDate`, valor normalizado `1.000.000`, ajuste do ultimo item para fechar 100%.
- Exemplo esperado: task concluida por `ActualFinish` pode contar como 100% quando nao ha percentual informado.
- Testes: `build-project-disciplines.test.ts`, `build-project-weight-model.test.ts`, `build-discipline-progress.test.ts`, `build-s-curve.test.ts`.
- Risco se alterada: prioridades e percentuais executivos deixam de representar impacto realista.

### Status de prazo, compensacao, confiabilidade e alertas

- Faz: calcula atraso/gap, capacidade de recuperacao, confiabilidade e alertas de decisao.
- Por que existe: substitui analise manual de planejador, sem IA, com regras deterministicas.
- Nao pode quebrar: baseline preferencial, inferencia controlada sem baseline, limites de gap, top 3/top 5 de compensacao, blocked conclusions, limites de alertas.
- Exemplo esperado: sem baseline valida, o status de prazo deve declarar inferencia e reduzir confiabilidade.
- Testes: `build-schedule-status.test.ts`, `build-operational-compensation.test.ts`, `build-gap-vs-compensation.test.ts`, `build-analysis-reliability.test.ts`, `build-executive-alerts.test.ts`.
- Risco se alterada: o app passa a recomendar acao errada ou forte demais para dados fracos.

### Historico, snapshots e comparacao

- Faz: identifica projeto, salva snapshot e compara evolucao entre leituras.
- Por que existe: leitura de evolucao depende de identidade estavel e delta historico.
- Nao pode quebrar: chave por nome normalizado + data ancora, comparacao apenas com snapshot anterior compativel, calculo de delta de progresso, warnings, errors e finish date.
- Exemplo esperado: projetos diferentes nao devem ser comparados como evolucao.
- Testes: `snapshot-history.test.ts`, `compare-project-versions.test.ts`, `process-mpp-with-history.test.ts`.
- Risco se alterada: gap e score historico podem ser calculados contra base errada.

### Exports, Power BI e PDF

- Faz: serializa resultado para JSON/XML/CSV/Power BI/PDF sem mudar o resultado analitico.
- Por que existe: contratos externos precisam ser estaveis para auditoria, BI e reunioes.
- Nao pode quebrar: nomes de arquivos Power BI, delimitador `;`, separador decimal `,`, ids/snapshots estaveis, BOM apenas no salvamento CSV, schema JSON/XML.
- Exemplo esperado: CSV interno continua sem mudanca estrutural; ao salvar no Windows recebe BOM para Excel.
- Testes: `export-formats.test.ts`, `export-power-bi-package.test.ts`, `prepare-text-export.test.ts`, `build-executive-report.test.ts`, `build-executive-report-scope.test.ts`.
- Risco se alterada: usuario perde compatibilidade com Excel/Power BI/PDF ou contratos de exportacao.

### Licenciamento

- Faz: ativa, valida, persiste e resolve estado de licenca.
- Por que existe: controle comercial do app, independente do core analitico.
- Nao pode quebrar: contrato `approved/denied`, ausencia de `expiresAt` em negadas, checkpoints de ativacao, classificacao de erro HTTP, bootstrap local.
- Exemplo esperado: licenca invalida retorna estado negado de negocio, nao erro inesperado.
- Testes: `licensing-contract.test.ts`, `activate-license.test.ts`, `license-service.test.ts`, `resolve-license-state.test.ts`, `validate-license.test.ts`, `verify-license.test.ts`.
- Risco se alterada: app pode bloquear usuario valido ou aceitar estado invalido.

## Padroes perigosos

- Trocar fallback guiado de MPP por erro generico.
- Remover validacoes de XML por parecerem defensivas demais.
- Substituir `parseMSPDI` no detector por extensao `.xml` simples.
- Tratar `sourceFormat` como regra de analise dentro do core.
- Remover defaults do mapper achando que valores vazios sao redundantes.
- Eliminar a task `0` sem entender o contrato MSPDI.
- Ignorar `OutlineNumber`/`OutlineLevel` e tentar inferir disciplinas apenas por nome.
- Mudar prioridade de progresso sem teste de equivalencia.
- Trocar peso normalizado por contagem simples de tasks.
- Remover inferencia sem baseline ou apresentar inferencia como certeza.
- Limpar mensagens/diagnostics sem preservar ids e testes.
- Alterar exports por estetica e quebrar contratos externos.
- Misturar licenciamento com ingestao, analise ou exportacao.
- Reescrever lógica intrincada sem entender o problema de domínio que ela resolve.

## Regras operacionais futuras

- Pode mexer apenas quando houver bug comprovado OU ganho claro de produto, sempre com testes cobrindo o comportamento atual.
- Nao pode mexer por simplificacao visual, gosto de nomenclatura ou tentativa de "limpar" heuristicas sem entender o dominio.
- Precisa teste de equivalencia quando tocar parser, mapper, `analyzeProject`, pesos, disciplinas, prazo, compensacao, confiabilidade ou exports.
- Precisa validacao manual quando tocar conversao MPP, fallback de entrada, PDF, Power BI, licenciamento ou fluxo Tauri.
- Toda mudanca em regra analitica deve declarar impacto esperado em score, insights, exportacoes e relatorio.
- Toda mudanca em parser/ingestao deve provar que MPP e MSPDI XML continuam chegando ao mesmo contrato `Project`.
- Toda mudanca em exportacao deve preservar contrato de arquivo, schema, delimitador, encoding e nomes de campos.
- Licenciamento deve continuar isolado. Se um ajuste de analise exigir mudanca em licenciamento, a premissa provavelmente esta errada.

## Recomendacao objetiva

- Proteger com prioridade: `parse-mspdi.ts`, `map-project.ts`, `analyze-project.ts`, `build-project-weight-model.ts`, `build-schedule-status.ts`, `build-analysis-reliability.ts`, `process-project-file.ts`.
- Evoluir com cuidado: exports Power BI, relatorio PDF, historico/snapshots e mensagens de fallback.
- Nao vale mexer agora: renomeacoes cosmeticas, reorganizacao de pastas, abstracoes adicionais, generalizacao para Primavera antes de existir fixture real.

Este documento deve ser consultado antes de qualquer alteração em lógica de ingestão, análise ou exportação. Alterações em zonas críticas sem referência a este mapa são consideradas de alto risco.
