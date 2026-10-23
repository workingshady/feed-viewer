const KEY_MAPPING = "fv_home_workflow_mapping";
const KEY_VALIDATION = "fv_home_workflow_validation";

export function markHomeWorkflowMappingVisited(): void {
  try {
    localStorage.setItem(KEY_MAPPING, "1");
  } catch {
    /* ignore quota */
  }
}

export function markHomeWorkflowValidationVisited(): void {
  try {
    localStorage.setItem(KEY_VALIDATION, "1");
  } catch {
    /* ignore quota */
  }
}

export function getHomeWorkflowFlags(): { mapping: boolean; validation: boolean } {
  try {
    return {
      mapping: localStorage.getItem(KEY_MAPPING) === "1",
      validation: localStorage.getItem(KEY_VALIDATION) === "1",
    };
  } catch {
    return { mapping: false, validation: false };
  }
}
