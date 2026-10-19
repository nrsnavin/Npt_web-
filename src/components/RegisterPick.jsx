import { useCallback } from 'react';
import Combobox from './Combobox.jsx';

/** What each register is called in a picker's words. */
const REGISTER_WORDS = { moulds: 'model', materials: 'material', hooks: 'hook', clips: 'clip', prints: 'print' };

/**
 * A model, material, hook, clip or print picked from its register — a dropdown that narrows as
 * you type [components/Combobox.jsx]. A name the register does not know yet is kept as typed:
 * a request is often about exactly the thing that is not on a register yet.
 */
export default function RegisterPick({ field, register, value, onChange }) {
  const word = REGISTER_WORDS[field.register] || field.register;
  const loadOptions = useCallback(async (search) => {
    const term = String(search || '').trim().toLowerCase();
    const matches = term ? register.filter((name) => name.toLowerCase().includes(term)) : register;
    return { data: matches.slice(0, 60), pagination: { total: matches.length } };
  }, [register]);
  const loadOne = useCallback(async (name) => name, []);
  const toOption = useCallback((name) => ({ value: name, label: name }), []);
  return (
    <Combobox
      value={value || ''}
      onChange={(next) => onChange(next || '')}
      loadOptions={loadOptions}
      loadOne={loadOne}
      toOption={toOption}
      placeholder={register.length ? `Pick or type a ${word}…` : 'Type it in'}
      emptyLabel="None"
      noMatchLabel={`No ${word} on the register matches`}
      onCreate={(typed) => { if (typed) onChange(typed); }}
      createLabel="Use as typed"
      aria-label={field.label}
    />
  );
}

