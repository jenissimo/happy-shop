import type { ReactNode } from 'react'
import {
  BLEND_MODES,
  CONTOUR_PRESETS,
  PATTERN_KINDS,
  type LayerEffect,
} from '../../../core/document'
import { AngleField } from '../../base/AngleField'
import { ColorField } from '../../base/ColorField'
import { SliderField } from '../../base/SliderField'
import { GradientRamp } from './GradientRamp'
import styles from './LayerStyleDialog.module.css'
import { PatternGrid } from './PatternGrid'

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

function SelectField({
  label,
  value,
  disabled,
  onChange,
  options,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <select
        className={styles.select}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function BlendSelect({
  label = 'Blend Mode',
  value,
  disabled,
  onChange,
}: {
  label?: string
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <SelectField
      label={label}
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={BLEND_MODES.map((m) => ({ value: m, label: m }))}
    />
  )
}

function ContourSelect({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <SelectField
      label="Contour"
      value={value}
      disabled={disabled}
      onChange={onChange}
      options={CONTOUR_PRESETS.map((c) => ({ value: c, label: c }))}
    />
  )
}

function CheckRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className={styles.checkRow}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function EffectParamPanels({ active, disabled, onChange }: Props) {
  const d = disabled

  if (active.type === 'drop-shadow') {
    return (
      <>
        <Section title="Structure">
          <BlendSelect
            value={active.blendMode}
            disabled={d}
            onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
          />
          <ColorField
            alpha
            label="Color"
            value={active.color}
            disabled={d}
            onChange={(v) => onChange({ color: v })}
          />
          <SliderField
            label="Opacity"
            value={Math.round(active.opacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ opacity: v / 100 })}
          />
          <AngleField
            label="Angle"
            value={active.angle}
            disabled={d}
            onChange={(v) => onChange({ angle: v })}
          />
          <CheckRow
            label="Use Global Light"
            checked={active.useGlobalLight}
            disabled={d}
            onChange={(v) => onChange({ useGlobalLight: v })}
          />
          <SliderField
            label="Distance"
            value={active.distance}
            min={0}
            max={300}
            disabled={d}
            onChange={(v) => onChange({ distance: Math.max(0, v) })}
          />
          <SliderField
            label="Spread"
            value={active.spread}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ spread: v })}
          />
          <SliderField
            label="Size"
            value={active.size}
            min={0}
            max={250}
            disabled={d}
            onChange={(v) => onChange({ size: Math.max(0, v) })}
          />
        </Section>
        <Section title="Quality">
          <ContourSelect
            value={active.contour}
            disabled={d}
            onChange={(v) => onChange({ contour: v as typeof active.contour })}
          />
          <SliderField
            label="Noise"
            value={Math.round(active.noise * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ noise: v / 100 })}
          />
          <CheckRow
            label="Layer Knocks Out Drop Shadow"
            checked={active.layerKnocksOutDropShadow}
            disabled={d}
            onChange={(v) => onChange({ layerKnocksOutDropShadow: v })}
          />
        </Section>
      </>
    )
  }

  if (active.type === 'inner-shadow') {
    return (
      <>
        <Section title="Structure">
          <BlendSelect
            value={active.blendMode}
            disabled={d}
            onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
          />
          <ColorField
            alpha
            label="Color"
            value={active.color}
            disabled={d}
            onChange={(v) => onChange({ color: v })}
          />
          <SliderField
            label="Opacity"
            value={Math.round(active.opacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ opacity: v / 100 })}
          />
          <AngleField
            label="Angle"
            value={active.angle}
            disabled={d}
            onChange={(v) => onChange({ angle: v })}
          />
          <SliderField
            label="Distance"
            value={active.distance}
            min={0}
            max={300}
            disabled={d}
            onChange={(v) => onChange({ distance: Math.max(0, v) })}
          />
          <SliderField
            label="Choke"
            value={active.choke}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ choke: v })}
          />
          <SliderField
            label="Size"
            value={active.size}
            min={0}
            max={250}
            disabled={d}
            onChange={(v) => onChange({ size: Math.max(0, v) })}
          />
        </Section>
        <Section title="Quality">
          <ContourSelect
            value={active.contour}
            disabled={d}
            onChange={(v) => onChange({ contour: v as typeof active.contour })}
          />
          <SliderField
            label="Noise"
            value={Math.round(active.noise * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ noise: v / 100 })}
          />
        </Section>
      </>
    )
  }

  if (active.type === 'outer-glow' || active.type === 'inner-glow') {
    return (
      <>
        <Section title="Structure">
          <BlendSelect
            value={active.blendMode}
            disabled={d}
            onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
          />
          <ColorField
            alpha
            label="Color"
            value={active.color}
            disabled={d}
            onChange={(v) => onChange({ color: v })}
          />
          <SliderField
            label="Opacity"
            value={Math.round(active.opacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ opacity: v / 100 })}
          />
          <SelectField
            label="Technique"
            value={active.technique}
            disabled={d}
            onChange={(v) =>
              onChange({ technique: v as 'softer' | 'precise' })
            }
            options={[
              { value: 'softer', label: 'Softer' },
              { value: 'precise', label: 'Precise' },
            ]}
          />
          {active.type === 'inner-glow' && (
            <SelectField
              label="Source"
              value={active.source}
              disabled={d}
              onChange={(v) => onChange({ source: v as 'center' | 'edge' })}
              options={[
                { value: 'edge', label: 'Edge' },
                { value: 'center', label: 'Center' },
              ]}
            />
          )}
          {active.type === 'outer-glow' ? (
            <SliderField
              label="Spread"
              value={active.spread}
              min={0}
              max={100}
              disabled={d}
              onChange={(v) => onChange({ spread: v })}
            />
          ) : (
            <SliderField
              label="Choke"
              value={active.choke}
              min={0}
              max={100}
              disabled={d}
              onChange={(v) => onChange({ choke: v })}
            />
          )}
          <SliderField
            label="Size"
            value={active.size}
            min={0}
            max={250}
            disabled={d}
            onChange={(v) => onChange({ size: Math.max(0, v) })}
          />
        </Section>
        <Section title="Quality">
          <ContourSelect
            value={active.contour}
            disabled={d}
            onChange={(v) => onChange({ contour: v as typeof active.contour })}
          />
          <SliderField
            label="Range"
            value={active.range}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ range: v })}
          />
          <SliderField
            label="Noise"
            value={Math.round(active.noise * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ noise: v / 100 })}
          />
        </Section>
      </>
    )
  }

  if (active.type === 'bevel-emboss') {
    return (
      <>
        <Section title="Structure">
          <SelectField
            label="Style"
            value={active.style}
            disabled={d}
            onChange={(v) => onChange({ style: v as typeof active.style })}
            options={[
              { value: 'outer-bevel', label: 'Outer Bevel' },
              { value: 'inner-bevel', label: 'Inner Bevel' },
              { value: 'emboss', label: 'Emboss' },
              { value: 'pillow-emboss', label: 'Pillow Emboss' },
              { value: 'stroke-emboss', label: 'Stroke Emboss' },
            ]}
          />
          <SelectField
            label="Technique"
            value={active.technique}
            disabled={d}
            onChange={(v) =>
              onChange({ technique: v as typeof active.technique })
            }
            options={[
              { value: 'smooth', label: 'Smooth' },
              { value: 'chisel-hard', label: 'Chisel Hard' },
              { value: 'chisel-soft', label: 'Chisel Soft' },
            ]}
          />
          <SliderField
            label="Depth"
            value={active.depth}
            min={0}
            max={1000}
            disabled={d}
            onChange={(v) => onChange({ depth: v })}
          />
          <SelectField
            label="Direction"
            value={active.direction}
            disabled={d}
            onChange={(v) => onChange({ direction: v as 'up' | 'down' })}
            options={[
              { value: 'up', label: 'Up' },
              { value: 'down', label: 'Down' },
            ]}
          />
          <SliderField
            label="Size"
            value={active.size}
            min={0}
            max={250}
            disabled={d}
            onChange={(v) => onChange({ size: Math.max(0, v) })}
          />
          <SliderField
            label="Soften"
            value={active.soften}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ soften: Math.max(0, v) })}
          />
        </Section>
        <Section title="Shading">
          <AngleField
            label="Angle"
            value={active.angle}
            disabled={d}
            onChange={(v) => onChange({ angle: v })}
          />
          <SliderField
            label="Altitude"
            value={active.altitude}
            min={0}
            max={90}
            disabled={d}
            onChange={(v) => onChange({ altitude: v })}
          />
          <ColorField
            alpha
            label="Highlight"
            value={active.highlightColor}
            disabled={d}
            onChange={(v) => onChange({ highlightColor: v })}
          />
          <BlendSelect
            label="Highlight Blend"
            value={active.highlightMode}
            disabled={d}
            onChange={(v) =>
              onChange({ highlightMode: v as typeof active.highlightMode })
            }
          />
          <SliderField
            label="Hi Opacity"
            value={Math.round(active.highlightOpacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ highlightOpacity: v / 100 })}
          />
          <ColorField
            alpha
            label="Shadow"
            value={active.shadowColor}
            disabled={d}
            onChange={(v) => onChange({ shadowColor: v })}
          />
          <BlendSelect
            label="Shadow Blend"
            value={active.shadowMode}
            disabled={d}
            onChange={(v) => onChange({ shadowMode: v as typeof active.shadowMode })}
          />
          <SliderField
            label="Sh Opacity"
            value={Math.round(active.shadowOpacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ shadowOpacity: v / 100 })}
          />
        </Section>
        <Section title="Contour & Texture">
          <CheckRow
            label="Contour"
            checked={active.contour.enabled}
            disabled={d}
            onChange={(v) =>
              onChange({
                contour: { ...active.contour, enabled: v },
              })
            }
          />
          <CheckRow
            label="Texture"
            checked={active.texture.enabled}
            disabled={d}
            onChange={(v) =>
              onChange({
                texture: { ...active.texture, enabled: v },
              })
            }
          />
          {active.contour.enabled && (
            <>
              <ContourSelect
                value={active.contour.contour}
                disabled={d}
                onChange={(v) =>
                  onChange({
                    contour: {
                      ...active.contour,
                      contour: v as typeof active.contour.contour,
                    },
                  })
                }
              />
              <SliderField
                label="Contour Range"
                value={active.contour.range}
                min={0}
                max={100}
                disabled={d}
                onChange={(v) =>
                  onChange({ contour: { ...active.contour, range: v } })
                }
              />
              <CheckRow
                label="Anti-aliased"
                checked={active.contour.antiAliased}
                disabled={d}
                onChange={(v) =>
                  onChange({
                    contour: { ...active.contour, antiAliased: v },
                  })
                }
              />
            </>
          )}
          {active.texture.enabled && (
            <>
              <SelectField
                label="Pattern"
                value={active.texture.pattern}
                disabled={d}
                onChange={(v) =>
                  onChange({
                    texture: {
                      ...active.texture,
                      pattern: v as typeof active.texture.pattern,
                    },
                  })
                }
                options={PATTERN_KINDS.map((p) => ({ value: p, label: p }))}
              />
              <SliderField
                label="Scale"
                value={active.texture.scale}
                min={1}
                max={1000}
                disabled={d}
                onChange={(v) =>
                  onChange({ texture: { ...active.texture, scale: v } })
                }
              />
              <SliderField
                label="Depth"
                value={active.texture.depth}
                min={0}
                max={100}
                disabled={d}
                onChange={(v) =>
                  onChange({ texture: { ...active.texture, depth: v } })
                }
              />
              <CheckRow
                label="Invert"
                checked={active.texture.invert}
                disabled={d}
                onChange={(v) =>
                  onChange({ texture: { ...active.texture, invert: v } })
                }
              />
              <CheckRow
                label="Align with Layer"
                checked={active.texture.alignWithLayer}
                disabled={d}
                onChange={(v) =>
                  onChange({
                    texture: { ...active.texture, alignWithLayer: v },
                  })
                }
              />
            </>
          )}
        </Section>
      </>
    )
  }

  if (active.type === 'satin') {
    return (
      <Section title="Structure">
        <BlendSelect
          value={active.blendMode}
          disabled={d}
          onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
        />
        <ColorField
          alpha
          label="Color"
          value={active.color}
          disabled={d}
          onChange={(v) => onChange({ color: v })}
        />
        <SliderField
          label="Opacity"
          value={Math.round(active.opacity * 100)}
          min={0}
          max={100}
          disabled={d}
          onChange={(v) => onChange({ opacity: v / 100 })}
        />
        <AngleField
          label="Angle"
          value={active.angle}
          disabled={d}
          onChange={(v) => onChange({ angle: v })}
        />
        <SliderField
          label="Distance"
          value={active.distance}
          min={0}
          max={300}
          disabled={d}
          onChange={(v) => onChange({ distance: Math.max(0, v) })}
        />
        <SliderField
          label="Size"
          value={active.size}
          min={0}
          max={250}
          disabled={d}
          onChange={(v) => onChange({ size: Math.max(0, v) })}
        />
        <ContourSelect
          value={active.contour}
          disabled={d}
          onChange={(v) => onChange({ contour: v as typeof active.contour })}
        />
        <CheckRow
          label="Invert"
          checked={active.invert}
          disabled={d}
          onChange={(v) => onChange({ invert: v })}
        />
      </Section>
    )
  }

  if (active.type === 'stroke') {
    return (
      <Section title="Structure">
        <BlendSelect
          value={active.blendMode}
          disabled={d}
          onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
        />
        <ColorField
          alpha
          label="Color"
          value={active.color}
          disabled={d}
          onChange={(v) => onChange({ color: v })}
        />
        <SliderField
          label="Opacity"
          value={Math.round(active.opacity * 100)}
          min={0}
          max={100}
          disabled={d}
          onChange={(v) => onChange({ opacity: v / 100 })}
        />
        <SliderField
          label="Size"
          value={active.size}
          min={0}
          max={250}
          disabled={d}
          onChange={(v) => onChange({ size: Math.max(0, v) })}
        />
        <SelectField
          label="Position"
          value={active.position}
          disabled={d}
          onChange={(v) =>
            onChange({
              position: v as 'inside' | 'center' | 'outside',
            })
          }
          options={[
            { value: 'outside', label: 'Outside' },
            { value: 'center', label: 'Center' },
            { value: 'inside', label: 'Inside' },
          ]}
        />
        <SelectField
          label="Fill Type"
          value={active.fillType}
          disabled={d}
          onChange={(v) =>
            onChange({
              fillType: v as 'color' | 'gradient' | 'pattern',
            })
          }
          options={[
            { value: 'color', label: 'Color' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'pattern', label: 'Pattern' },
          ]}
        />
        <CheckRow
          label="Overprint"
          checked={active.overprint}
          disabled={d}
          onChange={(v) => onChange({ overprint: v })}
        />
      </Section>
    )
  }

  if (active.type === 'color-overlay') {
    return (
      <Section title="Structure">
        <BlendSelect
          value={active.blendMode}
          disabled={d}
          onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
        />
        <ColorField
          alpha
          label="Color"
          value={active.color}
          disabled={d}
          onChange={(v) => onChange({ color: v })}
        />
        <SliderField
          label="Opacity"
          value={Math.round(active.opacity * 100)}
          min={0}
          max={100}
          disabled={d}
          onChange={(v) => onChange({ opacity: v / 100 })}
        />
      </Section>
    )
  }

  if (active.type === 'gradient-overlay') {
    return (
      <>
        <Section title="Structure">
          <BlendSelect
            value={active.blendMode}
            disabled={d}
            onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
          />
          <SliderField
            label="Opacity"
            value={Math.round(active.opacity * 100)}
            min={0}
            max={100}
            disabled={d}
            onChange={(v) => onChange({ opacity: v / 100 })}
          />
          <GradientRamp
            gradient={active.gradient}
            disabled={d}
            onChange={(gradient) => onChange({ gradient })}
          />
          <SelectField
            label="Style"
            value={active.style}
            disabled={d}
            onChange={(v) => onChange({ style: v as typeof active.style })}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
              { value: 'angle', label: 'Angle' },
              { value: 'reflected', label: 'Reflected' },
              { value: 'diamond', label: 'Diamond' },
            ]}
          />
          <AngleField
            label="Angle"
            value={active.angle}
            disabled={d}
            onChange={(v) => onChange({ angle: v })}
          />
          <SliderField
            label="Scale"
            value={active.scale}
            min={1}
            max={150}
            disabled={d}
            onChange={(v) => onChange({ scale: v })}
          />
          <CheckRow
            label="Reverse"
            checked={active.reverse}
            disabled={d}
            onChange={(v) => onChange({ reverse: v })}
          />
        </Section>
      </>
    )
  }

  if (active.type === 'pattern-overlay') {
    return (
      <Section title="Structure">
        <BlendSelect
          value={active.blendMode}
          disabled={d}
          onChange={(v) => onChange({ blendMode: v as typeof active.blendMode })}
        />
        <SliderField
          label="Opacity"
          value={Math.round(active.opacity * 100)}
          min={0}
          max={100}
          disabled={d}
          onChange={(v) => onChange({ opacity: v / 100 })}
        />
        <PatternGrid
          pattern={active.pattern}
          scale={active.scale}
          angle={active.angle}
          invert={active.invert}
          disabled={d}
          onChange={onChange}
        />
        <SliderField
          label="Offset X"
          value={active.offsetX}
          min={-500}
          max={500}
          disabled={d}
          onChange={(v) => onChange({ offsetX: v })}
        />
        <SliderField
          label="Offset Y"
          value={active.offsetY}
          min={-500}
          max={500}
          disabled={d}
          onChange={(v) => onChange({ offsetY: v })}
        />
      </Section>
    )
  }

  return null
}
