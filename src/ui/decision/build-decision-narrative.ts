import type { DecisionAction } from "./build-decision-actions";

export type DecisionNarrative = {
  headline: string;
  shortLabel: string;
  explanation: string;
  consequence: string;
};

export type DecisionActionWithNarrative = DecisionAction & {
  narrative: DecisionNarrative;
};

function resolveDisciplineLabel(disciplineType: string): string {
  switch (disciplineType) {
    case "ELETRICA":
      return "Elétrica";
    case "MECANICA":
      return "Mecânica";
    case "CIVIL":
      return "Civil";
    case "COMISSIONAMENTO":
      return "Comissionamento";
    default:
      return disciplineType;
  }
}

function resolveOperationalSubject(action: DecisionAction): string {
  if (action.disciplineType && action.disciplineType !== "OUTRO") {
    return resolveDisciplineLabel(action.disciplineType);
  }

  return action.title.replace(/\s*\(\d+\s+tarefas?\)\s*$/i, "").trim();
}

function resolveHeadlineCause(action: DecisionAction): string {
  switch (action.cause.code) {
    case "external_block":
      return "com avanço travado por bloqueio operacional";
    case "execution_delay":
      return "com atraso pressionando o avanço";
    case "low_productivity":
      return "com avanço abaixo do necessário";
    case "critical_concentration":
      return "com impacto concentrado no progresso";
    case "dependency_block":
      return "travada por dependência de liberação";
    default:
      return "com causa ainda indefinida";
  }
}

function resolveShortLabel(action: DecisionAction): string {
  const subject = resolveOperationalSubject(action);

  switch (action.cause.code) {
    case "external_block":
      return `Bloqueio operacional - ${subject}`;
    case "execution_delay":
      return `Atraso acumulado - ${subject}`;
    case "low_productivity":
      return `Baixo avanço - ${subject}`;
    case "critical_concentration":
      return `Impacto concentrado - ${subject}`;
    case "dependency_block":
      return `Dependência operacional - ${subject}`;
    default:
      return `Sinal insuficiente - ${subject}`;
  }
}

function refineSignal(signal: string): string {
  switch (signal) {
    case "alto impacto no avanço do projeto":
      return "impacto direto no avanço do projeto";
    case "disciplina crítica no volume pendente atual":
      return "disciplina concentrando parte importante do pendente";
    case "atraso real nas tasks relacionadas":
      return "atraso real já configurado";
    case "execução incompleta":
      return "avanço ainda insuficiente";
    case "valor relativo pendente concentrado":
      return "alto valor pendente nesta frente";
    case "múltiplas tarefas com o mesmo nome operacional":
      return "mais de uma tarefa real presa no mesmo tema operacional";
    default:
      return signal;
  }
}

function resolveCauseLead(action: DecisionAction): string {
  switch (action.cause.code) {
    case "external_block":
      return "Frente iniciada com avanço mínimo e atraso acumulado, indicando bloqueio operacional.";
    case "execution_delay":
      return "A frente já acumula atraso e segue sem avanço suficiente para recuperar o cronograma.";
    case "low_productivity":
      return "A frente está em andamento, mas o ritmo de execução segue abaixo do necessário.";
    case "critical_concentration":
      return "Boa parte do avanço pendente está concentrada nesta frente.";
    case "dependency_block":
      return "A frente segue sem avanço e com sinais de dependência de liberação anterior.";
    default:
      return "Os sinais atuais ainda não sustentam uma causa operacional com segurança.";
  }
}

function resolveConsequence(action: DecisionAction): string {
  if (action.cause.code === "external_block" || action.cause.code === "dependency_block") {
    return "Sem destravar essa frente, parte do avanço do projeto continua represada.";
  }

  if (action.cause.code === "execution_delay") {
    return "Sem atuação nesta frente, o atraso tende a continuar pressionando a disciplina.";
  }

  if (action.cause.code === "low_productivity") {
    return "Sem ganho de ritmo, essa frente continua avançando abaixo do necessário.";
  }

  if (action.cause.code === "critical_concentration") {
    return "Sem avanço nessa frente, o projeto continua dependente de um ponto único de recuperação.";
  }

  return "Sem novos sinais de campo, a decisão tende a seguir apoiada em evidência limitada.";
}

export function buildDecisionNarrative(action: DecisionAction): DecisionNarrative {
  const subject = resolveOperationalSubject(action);
  const signals = action.reasons.slice(1).map(refineSignal).slice(0, 3);

  return {
    headline: `${subject} ${resolveHeadlineCause(action)}`,
    shortLabel: resolveShortLabel(action),
    explanation:
      signals.length > 0
        ? `${resolveCauseLead(action)} Baseado em: ${signals.join(" | ")}`
        : resolveCauseLead(action),
    consequence: resolveConsequence(action),
  };
}
