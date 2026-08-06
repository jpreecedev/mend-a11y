import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useFocusTrap } from '../hooks/a11y';
import { CloseIcon } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  footer,
  closing = false,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  closing?: boolean;
}) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div class="modal-backdrop" data-state={closing ? 'closing' : 'open'} onClick={onClose}>
      <div
        class="modal"
        data-state={closing ? 'closing' : 'open'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal-head">
          <h2>{title}</h2>
          <button class="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="segment" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            class="seg"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Switch({
  name,
  desc,
  checked,
  onChange,
}: {
  name: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div class="field">
      <div class="switch-row">
        <div class="switch-text">
          <div class="switch-name">{name}</div>
          {desc && <div class="switch-desc">{desc}</div>}
        </div>
        <button
          class="switch"
          role="switch"
          aria-checked={checked}
          aria-label={name}
          onClick={() => onChange(!checked)}
        >
          <span class="knob" />
        </button>
      </div>
    </div>
  );
}

export function TextField({
  label,
  desc,
  value,
  placeholder,
  type = 'text',
  commitOn = 'input',
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  // 'blur' (opt-in) keeps keystrokes local and only calls onChange on blur
  // or Enter -- for fields whose every commit has a side effect (e.g. an API
  // key that triggers an upload attempt on each keystroke while it's typed
  // rather than pasted). Defaults to 'input' so every existing caller keeps
  // committing on each keystroke, unchanged.
  commitOn?: 'input' | 'blur';
  onChange: (v: string) => void;
}) {
  const id = useId();
  const descId = desc ? `${id}-desc` : undefined;

  // In blur mode the input is a local draft, not a direct mirror of `value`.
  // `committed` tracks the value this field itself last sent upstream; when
  // `value` changes to something other than that, the change came from
  // outside (e.g. the account-page key relay, or a background settings
  // refresh) and the draft is resynced. A value change caused by our own
  // commit is a no-op here since committed is updated in lockstep.
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    if (commitOn === 'blur' && value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [commitOn, value]);

  const commit = () => {
    committed.current = draft;
    onChange(draft);
  };

  const blurHandlers =
    commitOn === 'blur'
      ? {
          onBlur: commit,
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') commit();
          },
        }
      : {};

  return (
    <div class="field">
      <label class="field-label" for={id}>
        {label}
      </label>
      <input
        id={id}
        class="text-input"
        type={type}
        value={commitOn === 'blur' ? draft : value}
        placeholder={placeholder}
        autocomplete="off"
        spellcheck={false}
        aria-describedby={descId}
        onInput={(e) => {
          const next = (e.target as HTMLInputElement).value;
          if (commitOn === 'blur') {
            setDraft(next);
          } else {
            onChange(next);
          }
        }}
        {...blurHandlers}
      />
      {desc && (
        <div class="switch-desc" id={descId}>
          {desc}
        </div>
      )}
    </div>
  );
}

export function RadioList<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="radio-list" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            class="radio-item"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            <span class="radio-mark" />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
