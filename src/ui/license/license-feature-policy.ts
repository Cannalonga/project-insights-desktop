import type { LicenseContextState, PremiumFeature } from "../../core/license/license-types";

type FeaturePolicyDecision = {
  allowed: boolean;
  title: string;
  description: string;
};

/**
 * Demo Protection Checklist
 * 1. Esse bloco permite inferir "o que fazer agora"? Se sim: BLOQUEAR ou REDUZIR.
 * 2. Esse bloco, combinado com outros, permite decisão operacional? Se sim: REDUZIR.
 * 3. Existe lista de tarefas, ações ou prioridades visíveis? Se sim: BLOQUEAR.
 * 4. Existe valor numérico preciso que permita cálculo operacional? Se sim: REDUZIR.
 * 5. A versão licenciada continua intacta? Deve ser SIM.
 * 6. O core analítico foi alterado? Deve ser NÃO.
 */

function getFeatureLabel(feature: PremiumFeature): string {
  switch (feature) {
    case "export_csv":
      return "Exportacao CSV completa";
    case "export_power_bi_package":
      return "Pacote Power BI";
    case "export_structured_xml":
      return "Exportacao XML estruturada";
    case "export_machine_json":
      return "Exportacao JSON analitico";
    case "export_executive_report":
      return "Relatorio executivo completo";
    case "executive_full_view":
      return "Visao executiva completa";
    case "recovery_full":
      return "Recuperacao completa";
    case "comparison_task_lists":
      return "Listas detalhadas da comparacao";
    case "trend_curve_detail":
      return "Curva S detalhada";
    default:
      return "Recurso premium";
  }
}

export function getLicenseFeatureDecision(
  state: LicenseContextState,
  feature: PremiumFeature,
): FeaturePolicyDecision {
  if (state.isLicensed) {
    return {
      allowed: true,
      title: "",
      description: "",
    };
  }

  return {
    allowed: false,
    title: `${getFeatureLabel(feature)} disponivel na versao completa`,
    description: "Insira uma licenca valida ou obtenha a versao completa para liberar este recurso.",
  };
}
