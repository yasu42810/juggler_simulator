import { parseCount } from "../core/observation";
import type { Issue } from "../core/types";
import { IssueList } from "./common";

interface Props {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  stepper?: boolean;
  unit?: string;
  placeholder?: string;
  issues?: Issue[];
  issueField?: string;
  large?: boolean;
}

export function NumberField({ id, label, value, onInput, stepper, unit, placeholder, issues, issueField, large }: Props) {
  const step = (d: number) => {
    const cur = parseCount(value);
    const base = cur === null || Number.isNaN(cur) ? 0 : cur;
    onInput(String(Math.max(0, base + d)));
  };
  const hasError = issues?.some((i) => i.field === (issueField ?? id) && i.level === "error");
  return (
    <div class={`field ${large ? "large" : ""}`}>
      <label for={id}>{label}</label>
      <div class="field-row">
        {stepper && <button type="button" class="step" onClick={() => step(-1)} aria-label={`${label}を1減らす`}>−</button>}
        <input
          id={id}
          inputMode="numeric"
          autocomplete="off"
          enterKeyHint="next"
          class={hasError ? "invalid" : ""}
          aria-invalid={hasError ? "true" : undefined}
          value={value}
          placeholder={placeholder}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        />
        {unit && <span class="unit">{unit}</span>}
        {stepper && <button type="button" class="step" onClick={() => step(1)} aria-label={`${label}を1増やす`}>＋</button>}
      </div>
      {issues && <IssueList issues={issues} field={issueField ?? id} />}
    </div>
  );
}
