import type { ReactNode } from 'react'
import type { LayerEffect } from '../../../core/document'
import { SliderField } from '../../base/SliderField'
import { NumericField } from '../../base/NumericField'
import styles from '../layer-style/LayerStyleDialog.module.css'

type Props = {
  active: LayerEffect
  disabled: boolean
  onChange: (patch: Partial<LayerEffect>) => void
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className={styles.paramSection}>
      <h4 className={styles.paramSectionTitle}>{title}</h4>
      <div className={styles.paramSectionBody}>{children}</div>
    </section>
  )
}

export function ContentEffectParamPanels({ active, disabled, onChange }: Props) {
  const d = disabled

  if (active.type === 'gaussian-blur') {
    return (
      <Section title="Blur">
        <SliderField
          label="Radius"
          value={active.radius}
          min={0}
          max={100}
          step={0.1}
          disabled={d}
          onChange={(v) => onChange({ radius: Math.max(0, v) })}
        />
      </Section>
    )
  }

  if (active.type === 'sharpen') {
    return (
      <Section title="Sharpen">
        <SliderField
          label="Amount"
          value={active.amount}
          min={0}
          max={2}
          step={0.1}
          disabled={d}
          onChange={(v) => onChange({ amount: Math.max(0, v) })}
        />
        <SliderField
          label="Radius"
          value={active.radius}
          min={0}
          max={20}
          step={0.1}
          disabled={d}
          onChange={(v) => onChange({ radius: Math.max(0, v) })}
        />
      </Section>
    )
  }

  if (active.type === 'noise') {
    return (
      <Section title="Noise">
        <SliderField
          label="Amount"
          value={Math.round(active.amount * 100)}
          min={0}
          max={400}
          step={1}
          disabled={d}
          onChange={(v) => onChange({ amount: Math.max(0, v / 100) })}
        />
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Distribution</span>
          <select
            className={styles.select}
            value={active.distribution}
            disabled={d}
            onChange={(e) =>
              onChange({
                distribution: e.target.value as 'uniform' | 'gaussian',
              })
            }
          >
            <option value="uniform">Uniform</option>
            <option value="gaussian">Gaussian</option>
          </select>
        </div>
        <label className={styles.field}>
          <input
            type="checkbox"
            checked={active.monochromatic}
            disabled={d}
            onChange={(e) => onChange({ monochromatic: e.target.checked })}
          />{' '}
          Monochromatic
        </label>
      </Section>
    )
  }

  if (active.type === 'adjustment') {
    const adj = active.adjustment
    if (adj.type === 'brightness-contrast') {
      return (
        <Section title="Brightness/Contrast">
          <SliderField
            label="Brightness"
            value={Math.round(adj.brightness * 100)}
            min={-100}
            max={100}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'brightness-contrast',
                  brightness: v / 100,
                  contrast: adj.contrast,
                },
              })
            }
          />
          <SliderField
            label="Contrast"
            value={Math.round(adj.contrast * 100)}
            min={-100}
            max={100}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'brightness-contrast',
                  brightness: adj.brightness,
                  contrast: v / 100,
                },
              })
            }
          />
        </Section>
      )
    }

    if (adj.type === 'hue-saturation') {
      return (
        <Section title="Hue/Saturation">
          <NumericField
            label="Hue"
            value={adj.hueDeg}
            min={-180}
            max={180}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'hue-saturation',
                  hueDeg: v,
                  saturation: adj.saturation,
                  lightness: adj.lightness,
                },
              })
            }
          />
          <SliderField
            label="Saturation"
            value={Math.round(adj.saturation * 100)}
            min={-100}
            max={100}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'hue-saturation',
                  hueDeg: adj.hueDeg,
                  saturation: v / 100,
                  lightness: adj.lightness,
                },
              })
            }
          />
          <SliderField
            label="Lightness"
            value={Math.round(adj.lightness * 100)}
            min={-100}
            max={100}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'hue-saturation',
                  hueDeg: adj.hueDeg,
                  saturation: adj.saturation,
                  lightness: v / 100,
                },
              })
            }
          />
        </Section>
      )
    }

    if (adj.type === 'levels') {
      return (
        <Section title="Levels">
          <NumericField
            label="Black"
            value={adj.black}
            min={0}
            max={255}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'levels',
                  black: v,
                  white: adj.white,
                  gamma: adj.gamma,
                },
              })
            }
          />
          <NumericField
            label="White"
            value={adj.white}
            min={0}
            max={255}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'levels',
                  black: adj.black,
                  white: v,
                  gamma: adj.gamma,
                },
              })
            }
          />
          <SliderField
            label="Gamma"
            value={adj.gamma}
            min={0.1}
            max={10}
            step={0.01}
            disabled={d}
            onChange={(v) =>
              onChange({
                adjustment: {
                  type: 'levels',
                  black: adj.black,
                  white: adj.white,
                  gamma: Math.max(0.01, v),
                },
              })
            }
          />
        </Section>
      )
    }

    if (adj.type === 'curves') {
      return (
        <Section title="Curves">
          <div style={{ fontSize: 11, color: 'var(--color-text-subtle)' }}>
            Curves points: {adj.master.length}
          </div>
        </Section>
      )
    }

    return null
  }

  return null
}

export function isContentEffectParamsType(type: LayerEffect['type']): boolean {
  return (
    type === 'gaussian-blur' ||
    type === 'sharpen' ||
    type === 'noise' ||
    type === 'adjustment'
  )
}
