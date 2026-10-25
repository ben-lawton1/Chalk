// Style panel: color swatches, fill/stroke/font/arrowhead options, opacity and layer actions. Owner: WP4.
import type { ReactNode } from 'react';
import {
  ARROWHEADS, BACKGROUND_COLORS, EDGES, FILL_STYLES, FONT_FAMILIES, FONT_SIZES, FONT_STACKS, ROUGHNESS_LEVELS,
  STROKE_COLORS, STROKE_STYLES, STROKE_WIDTHS, TEXT_ALIGNS,
} from '../constants';
import { applyStyle, deleteSelection, duplicateSelection, reorderSelection } from '../state/actions';
import {
  TID, tidAlign, tidBg, tidEdges, tidEndHead, tidFill, tidFont, tidFontSize, tidRoughness, tidStartHead, tidStroke,
  tidStrokeStyle, tidWidth,
} from '../testids';
import type { Arrowhead, ReorderDir, Style } from '../types';
import { shallowEqual, useAppState } from './hooks';
import { Icon } from './icons';
import { getPanelModel } from './stylePanelModel';
import type { PanelModel } from './stylePanelModel';

const FONT_SIZE_LABELS: Record<number, string> = { 16: 'S', 24: 'M', 32: 'L', 48: 'XL' };
const ROUGHNESS_LABELS = ['Architect', 'Artist', 'Cartoonist'];
const FONT_LABELS = { hand: 'Hand', sans: 'Sans', mono: 'Mono' } as const;
const FONT_TITLES = { hand: 'Hand-drawn', sans: 'Sans-serif', mono: 'Monospace' } as const;

const selectModel = (s: Parameters<typeof getPanelModel>[0]): PanelModel => getPanelModel(s);
const sameModel = (a: PanelModel, b: PanelModel): boolean =>
  a.visible === b.visible && a.values === b.values && shallowEqual(a.sections, b.sections);

function Section(props: { label: string; children: ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-label">{props.label}</div>
      {props.children}
    </div>
  );
}

function Opt(props: { testId: string; pressed: boolean; title: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={`opt${props.className ? ' ' + props.className : ''}`}
      data-testid={props.testId}
      aria-pressed={props.pressed}
      aria-label={props.title}
      title={props.title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function Glyph(props: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}

function FillGlyph({ fill }: { fill: Style['fillStyle'] }) {
  return (
    <Glyph>
      <rect x="3" y="3" width="14" height="14" rx="2" strokeWidth="1.2" />
      {fill === 'solid' && <rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" stroke="none" />}
      {(fill === 'hachure' || fill === 'cross-hatch') && <path d="M5 11L11 5 M5 16L16 5 M9 17L17 9" strokeWidth="1.3" />}
      {fill === 'cross-hatch' && <path d="M15 11L9 5 M15 16L4 5 M11 17L3 9" strokeWidth="1.3" />}
    </Glyph>
  );
}

function WidthGlyph({ width }: { width: number }) {
  return <Glyph><path d="M3 10h14" strokeWidth={width * 1.1 + 0.4} /></Glyph>;
}

function StrokeStyleGlyph({ kind }: { kind: Style['strokeStyle'] }) {
  const dash = kind === 'dashed' ? '4 3' : kind === 'dotted' ? '0.1 3.4' : undefined;
  return <Glyph><path d="M3 10h14" strokeWidth="2" strokeDasharray={dash} /></Glyph>;
}

function EdgesGlyph({ edges }: { edges: Style['edges'] }) {
  return <Glyph><rect x="3.5" y="4.5" width="13" height="11" rx={edges === 'round' ? 4 : 0} /></Glyph>;
}

const ALIGN_PATHS: Record<Style['textAlign'], string> = {
  left: 'M3 5h14 M3 10h9 M3 15h12',
  center: 'M3 5h14 M6 10h8 M4 15h12',
  right: 'M3 5h14 M8 10h9 M5 15h12',
};
function AlignGlyph({ align }: { align: Style['textAlign'] }) {
  return <Glyph><path d={ALIGN_PATHS[align]} /></Glyph>;
}

function HeadGlyph({ head, side }: { head: Arrowhead; side: 'start' | 'end' }) {
  // drawn for the end, mirrored for the start
  return (
    <svg width="24" height="20" viewBox="0 0 24 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={side === 'start' ? { transform: 'scaleX(-1)' } : undefined}>
      <path d={head === 'none' ? 'M3 10h18' : 'M3 10h16'} />
      {head === 'arrow' && <path d="M15 5l5 5-5 5" />}
      {head === 'triangle' && <path d="M21 10l-6-4.5v9z" fill="currentColor" />}
    </svg>
  );
}

const isHex = (c: string): boolean => /^#[0-9a-f]{6}$/i.test(c);

export function StylePanel() {
  const model = useAppState(selectModel, sameModel);
  if (!model.visible) return null;
  const { sections: sec, values: v } = model;

  const strokeInPalette = STROKE_COLORS.some((c) => c.toLowerCase() === v.strokeColor.toLowerCase());
  const bgInPalette = BACKGROUND_COLORS.some((c) => c.toLowerCase() === v.backgroundColor.toLowerCase());

  const layerButton = (testId: string, dir: ReorderDir, icon: 'back' | 'backward' | 'forward' | 'front', title: string) => (
    <button
      key={testId}
      type="button"
      className="icon-btn"
      data-testid={testId}
      aria-label={title}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => reorderSelection(dir)}
    >
      <Icon name={icon} size={18} />
    </button>
  );

  return (
    <aside className="island style-panel" data-testid={TID.stylePanel} aria-label="Style">
      {sec.stroke && (
        <Section label="Stroke">
          <div className="panel-row">
            {STROKE_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                className="swatch"
                data-testid={tidStroke(i)}
                aria-pressed={v.strokeColor.toLowerCase() === c.toLowerCase()}
                aria-label={`Stroke ${c}`}
                title={`Stroke ${c}`}
                style={{ background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle({ strokeColor: c })}
              />
            ))}
            <input
              type="color"
              className={`swatch-custom${strokeInPalette ? '' : ' custom-set'}`}
              data-testid={TID.strokeCustom}
              title="Custom stroke color"
              aria-label="Custom stroke color"
              value={isHex(v.strokeColor) ? v.strokeColor : '#000000'}
              onChange={(e) => applyStyle({ strokeColor: e.target.value }, 'stroke-custom')}
            />
          </div>
        </Section>
      )}

      {sec.background && (
        <Section label="Background">
          <div className="panel-row">
            {BACKGROUND_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === 'transparent' ? ' checker' : ''}`}
                data-testid={tidBg(i)}
                aria-pressed={v.backgroundColor.toLowerCase() === c.toLowerCase()}
                aria-label={c === 'transparent' ? 'No background' : `Background ${c}`}
                title={c === 'transparent' ? 'No background' : `Background ${c}`}
                style={c === 'transparent' ? undefined : { background: c }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyStyle({ backgroundColor: c })}
              />
            ))}
            <input
              type="color"
              className={`swatch-custom${bgInPalette ? '' : ' custom-set'}`}
              data-testid={TID.bgCustom}
              title="Custom background color"
              aria-label="Custom background color"
              value={isHex(v.backgroundColor) ? v.backgroundColor : '#ffffff'}
              onChange={(e) => applyStyle({ backgroundColor: e.target.value }, 'bg-custom')}
            />
          </div>
        </Section>
      )}

      {sec.fill && (
        <Section label="Fill">
          <div className="panel-row">
            {FILL_STYLES.map((f) => (
              <Opt key={f} testId={tidFill(f)} pressed={v.fillStyle === f} title={`Fill: ${f}`} onClick={() => applyStyle({ fillStyle: f })}>
                <FillGlyph fill={f} />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.strokeWidth && (
        <Section label="Stroke width">
          <div className="panel-row">
            {STROKE_WIDTHS.map((w) => (
              <Opt key={w} testId={tidWidth(w)} pressed={v.strokeWidth === w} title={`Stroke width ${w}`} onClick={() => applyStyle({ strokeWidth: w })}>
                <WidthGlyph width={w} />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.strokeStyle && (
        <Section label="Stroke style">
          <div className="panel-row">
            {STROKE_STYLES.map((st) => (
              <Opt key={st} testId={tidStrokeStyle(st)} pressed={v.strokeStyle === st} title={`Stroke style: ${st}`} onClick={() => applyStyle({ strokeStyle: st })}>
                <StrokeStyleGlyph kind={st} />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.roughness && (
        <Section label="Sloppiness">
          <div className="panel-row nowrap">
            {ROUGHNESS_LEVELS.map((r) => (
              <Opt key={r} className="grow small-text" testId={tidRoughness(r)} pressed={v.roughness === r} title={ROUGHNESS_LABELS[r]} onClick={() => applyStyle({ roughness: r })}>
                {ROUGHNESS_LABELS[r]}
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.edges && (
        <Section label="Edges">
          <div className="panel-row">
            {EDGES.map((ed) => (
              <Opt key={ed} testId={tidEdges(ed)} pressed={v.edges === ed} title={ed === 'sharp' ? 'Sharp corners' : 'Rounded corners'} onClick={() => applyStyle({ edges: ed })}>
                <EdgesGlyph edges={ed} />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.arrowheads && (
        <Section label="Arrow start">
          <div className="panel-row">
            {ARROWHEADS.map((h) => (
              <Opt key={h} testId={tidStartHead(h)} pressed={v.startArrowhead === h} title={`Start: ${h}`} onClick={() => applyStyle({ startArrowhead: h })}>
                <HeadGlyph head={h} side="start" />
              </Opt>
            ))}
          </div>
        </Section>
      )}
      {sec.arrowheads && (
        <Section label="Arrow end">
          <div className="panel-row">
            {ARROWHEADS.map((h) => (
              <Opt key={h} testId={tidEndHead(h)} pressed={v.endArrowhead === h} title={`End: ${h}`} onClick={() => applyStyle({ endArrowhead: h })}>
                <HeadGlyph head={h} side="end" />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.fontSize && (
        <Section label="Font size">
          <div className="panel-row">
            {FONT_SIZES.map((fs) => (
              <Opt key={fs} className="grow" testId={tidFontSize(fs)} pressed={v.fontSize === fs} title={`Font size ${fs}`} onClick={() => applyStyle({ fontSize: fs })}>
                {FONT_SIZE_LABELS[fs] ?? String(fs)}
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.fontFamily && (
        <Section label="Font">
          <div className="panel-row nowrap">
            {FONT_FAMILIES.map((ff) => (
              <Opt key={ff} className="grow" testId={tidFont(ff)} pressed={v.fontFamily === ff} title={FONT_TITLES[ff]} onClick={() => applyStyle({ fontFamily: ff })}>
                <span style={{ fontFamily: FONT_STACKS[ff], fontSize: ff === 'hand' ? 16 : 12 }}>{FONT_LABELS[ff]}</span>
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.textAlign && (
        <Section label="Text align">
          <div className="panel-row">
            {TEXT_ALIGNS.map((al) => (
              <Opt key={al} testId={tidAlign(al)} pressed={v.textAlign === al} title={`Align ${al}`} onClick={() => applyStyle({ textAlign: al })}>
                <AlignGlyph align={al} />
              </Opt>
            ))}
          </div>
        </Section>
      )}

      {sec.opacity && (
        <Section label="Opacity">
          <div className="opacity-row">
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              data-testid={TID.opacity}
              aria-label="Opacity"
              value={v.opacity}
              onChange={(e) => applyStyle({ opacity: Number(e.target.value) }, 'opacity')}
            />
            <span className="opacity-value">{Math.round(v.opacity)}</span>
          </div>
        </Section>
      )}

      {sec.layers && (
        <>
          <Section label="Layers">
            <div className="layer-row">
              {layerButton(TID.actionBack, 'back', 'back', 'Send to back — Ctrl+Shift+[')}
              {layerButton(TID.actionBackward, 'backward', 'backward', 'Send backward — Ctrl+[')}
              {layerButton(TID.actionForward, 'forward', 'forward', 'Bring forward — Ctrl+]')}
              {layerButton(TID.actionFront, 'front', 'front', 'Bring to front — Ctrl+Shift+]')}
            </div>
            <div className="layer-row">
              <button type="button" className="icon-btn" data-testid={TID.actionDuplicate} aria-label="Duplicate" title="Duplicate — Ctrl+D"
                onMouseDown={(e) => e.preventDefault()} onClick={() => duplicateSelection()}>
                <Icon name="duplicate" size={18} />
              </button>
              <button type="button" className="icon-btn danger" data-testid={TID.actionDelete} aria-label="Delete" title="Delete — Del"
                onMouseDown={(e) => e.preventDefault()} onClick={() => deleteSelection()}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          </Section>
        </>
      )}
    </aside>
  );
}
