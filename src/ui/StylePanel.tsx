import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { presetCopy, type Editor } from "../editor";
import { t, type Key } from "../i18n";
import { imageFileToData, loadLibrary, pickFile, saveLibrary, styleFromFile, styleToFile } from "../style/library";
import { PRESETS } from "../style/presets";
import type { GridKind, MapStyle, ShadeKind, WallKind } from "../style/types";
import { say } from "./dialogs";
import { download } from "./download";

const WALL_KINDS: [WallKind, Key][] = [
  ["sketch", "wallSketch"],
  ["pencil", "wallPencil"],
  ["ink", "wallInk"],
  ["none", "none"],
];
const SHADE_KINDS: [ShadeKind, Key][] = [
  ["diagonal", "shadeDiagonal"],
  ["crosshatch", "shadeCrosshatch"],
  ["clusters", "shadeClusters"],
  ["stipple", "shadeStipple"],
  ["contours", "shadeContours"],
  ["stamps", "shadeStamps"],
  ["none", "none"],
];
const GRID_KINDS: [GridKind, Key][] = [
  ["lines", "gridLines"],
  ["dots", "gridDots"],
  ["none", "none"],
];

export function StylePanel({ editor }: { editor: Editor }) {
  const doc = editor.doc;
  const [editingId, setEditingId] = useState(doc.settings.style);
  const [library, setLibrary] = useState(loadLibrary);
  const style = doc.styles.find((s) => s.id === editingId) ?? editor.style(doc.settings.style);
  const isMapStyle = style.id === doc.settings.style;

  const storeLibrary = (list: MapStyle[]) => {
    if (saveLibrary(list)) setLibrary(list);
    else say(t("libraryFull"), "ERROR");
  };
  const toLibrary = () => storeLibrary([...library.filter((s) => s.id !== style.id), structuredClone(style)]);
  const importStyle = async () => {
    const [file] = await pickFile(".json,application/json");
    if (!file) return;
    try {
      const imported = styleFromFile(await file.text());
      setEditingId(editor.addStyle(imported));
      storeLibrary([...library, imported]);
    } catch {
      say(t("badStyleFile"), "ERROR");
    }
  };
  const duplicate = () => {
    const id = editor.addStyle({ ...style, name: `${style.name} ${t("copySuffix")}` }, true);
    setEditingId(id);
  };
  const edit = (fn: (s: MapStyle) => MapStyle) => editor.updateStyle(style.id, fn);

  return (
    <div class="style-panel">
      <div class="panel-head">
        <h2>{t("styles")}</h2>
        <button onClick={() => editor.setStylesOpen(false)}>{t("close")}</button>
      </div>

      <section>
        <h3>{t("stylesInMap")}</h3>
        {doc.styles.map((s) => (
          <div key={s.id} class={`row${s.id === style.id ? " current" : ""}`} onClick={() => setEditingId(s.id)}>
            <span class="swatch" style={{ background: s.paper.color, borderColor: s.walls.color }} />
            <span class="row-name">{s.name}</span>
            {s.id === doc.settings.style && <span class="tag">{t("mapStyleTag")}</span>}
          </div>
        ))}
        <div class="button-row">
          <button onClick={duplicate}>{t("styleDuplicate")}</button>
          <button disabled={isMapStyle} onClick={() => editor.setMapStyle(style.id)}>
            {t("makeMapStyle")}
          </button>
          <button disabled={isMapStyle || doc.styles.length <= 1} onClick={() => editor.removeStyle(style.id)}>
            {t("removeFromMap")}
          </button>
        </div>
        <div class="button-row">
          <button onClick={() => download(styleToFile(style), `${style.name}.style.json`)}>{t("styleExport")}</button>
          <button onClick={importStyle}>{t("styleImport")}</button>
          <button onClick={toLibrary}>{t("toLibrary")}</button>
        </div>
      </section>

      <section>
        <h3>{t("presets")}</h3>
        {PRESETS.map((p) => (
          <div key={p.id} class="row" onClick={() => setEditingId(editor.addStyle(presetCopy(p.id)))}>
            <span class="swatch" style={{ background: p.paper.color, borderColor: p.walls.color }} />
            <span class="row-name">{t(p.name as Key)}</span>
            <span class="muted small">{t("addToMap")}</span>
          </div>
        ))}
        {library.length > 0 && <h3>{t("library")}</h3>}
        {library.map((s) => (
          <div key={s.id} class="row" onClick={() => setEditingId(editor.addStyle(s))}>
            <span class="swatch" style={{ background: s.paper.color, borderColor: s.walls.color }} />
            <span class="row-name">{s.name}</span>
            <button
              class="icon-btn"
              title={t("removeFromLibrary")}
              onClick={(e) => {
                e.stopPropagation();
                storeLibrary(library.filter((x) => x.id !== s.id));
              }}
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <section class="style-editor">
        <label class="field">
          <span>{t("name")}</span>
          <input
            key={style.id}
            defaultValue={style.name}
            onChange={(e) => {
              const name = e.currentTarget.value.trim();
              if (name) edit((s) => ({ ...s, name }));
            }}
          />
        </label>

        <Group title="paper">
          <Color
            label="color"
            value={style.paper.color}
            onChange={(v) => edit((s) => ({ ...s, paper: { ...s.paper, color: v } }))}
          />
          <Slider
            label="grain"
            min={0}
            max={1}
            step={0.05}
            value={style.paper.grain}
            onChange={(v) => edit((s) => ({ ...s, paper: { ...s.paper, grain: v } }))}
          />
          <Texture
            value={style.paper.texture}
            onChange={(v) => edit((s) => ({ ...s, paper: { ...s.paper, texture: v } }))}
          />
          {style.paper.texture && (
            <Slider
              label="textureScale"
              min={1}
              max={16}
              step={0.5}
              value={style.paper.textureScale}
              onChange={(v) => edit((s) => ({ ...s, paper: { ...s.paper, textureScale: v } }))}
            />
          )}
        </Group>

        <Group title="floorPart">
          <Color
            label="color"
            value={style.floor.color}
            onChange={(v) => edit((s) => ({ ...s, floor: { ...s.floor, color: v } }))}
          />
          <Texture
            value={style.floor.texture}
            onChange={(v) => edit((s) => ({ ...s, floor: { ...s.floor, texture: v } }))}
          />
          {style.floor.texture && (
            <>
              <Slider
                label="textureScale"
                min={0.5}
                max={16}
                step={0.5}
                value={style.floor.textureScale}
                onChange={(v) => edit((s) => ({ ...s, floor: { ...s.floor, textureScale: v } }))}
              />
              <Slider
                label="textureOpacity"
                min={0}
                max={1}
                step={0.05}
                value={style.floor.textureOpacity}
                onChange={(v) => edit((s) => ({ ...s, floor: { ...s.floor, textureOpacity: v } }))}
              />
            </>
          )}
        </Group>

        <Group title="wallsPart">
          <Choice
            options={WALL_KINDS}
            value={style.walls.kind}
            onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, kind: v } }))}
          />
          <Color
            label="color"
            value={style.walls.color}
            onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, color: v } }))}
          />
          <Slider
            label="thickness"
            min={0.02}
            max={0.3}
            step={0.005}
            value={style.walls.width}
            onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, width: v } }))}
          />
          <Slider
            label="wobble"
            min={0}
            max={0.08}
            step={0.005}
            value={style.walls.wobble}
            onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, wobble: v } }))}
          />
          {style.walls.kind === "sketch" && (
            <Slider
              label="overshoot"
              min={0}
              max={0.6}
              step={0.02}
              value={style.walls.overshoot}
              onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, overshoot: v } }))}
            />
          )}
          <Slider
            label="passes"
            min={1}
            max={3}
            step={1}
            value={style.walls.passes}
            onChange={(v) => edit((s) => ({ ...s, walls: { ...s.walls, passes: v } }))}
          />
        </Group>

        <Group title="shadePart">
          <Choice
            options={SHADE_KINDS}
            value={style.shade.kind}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, kind: v } }))}
          />
          <Color
            label="color"
            value={style.shade.color}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, color: v } }))}
          />
          <Slider
            label="band"
            min={0}
            max={1.5}
            step={0.05}
            value={style.shade.band}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, band: v } }))}
          />
          <Slider
            label="density"
            min={0}
            max={1}
            step={0.05}
            value={style.shade.density}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, density: v } }))}
          />
          {(style.shade.kind === "diagonal" || style.shade.kind === "crosshatch") && (
            <Slider
              label="angle"
              min={0}
              max={180}
              step={5}
              value={style.shade.angle}
              onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, angle: v } }))}
            />
          )}
          <Slider
            label="strokeWidth"
            min={0.005}
            max={0.08}
            step={0.005}
            value={style.shade.lineWidth}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, lineWidth: v } }))}
          />
          <Slider
            label="smudge"
            min={0}
            max={1}
            step={0.05}
            value={style.shade.smudge}
            onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, smudge: v } }))}
          />
          {style.shade.kind === "stamps" && (
            <>
              <Stamps
                value={style.shade.stamps}
                onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, stamps: v } }))}
              />
              <Slider
                label="stampSize"
                min={0.1}
                max={1.5}
                step={0.05}
                value={style.shade.stampSize}
                onChange={(v) => edit((s) => ({ ...s, shade: { ...s.shade, stampSize: v } }))}
              />
            </>
          )}
        </Group>

        <Group title="gridPart">
          <Choice
            options={GRID_KINDS}
            value={style.grid.kind}
            onChange={(v) => edit((s) => ({ ...s, grid: { ...s.grid, kind: v } }))}
          />
          <Color
            label="color"
            value={style.grid.color}
            onChange={(v) => edit((s) => ({ ...s, grid: { ...s.grid, color: v } }))}
          />
          <Slider
            label="opacity"
            min={0}
            max={1}
            step={0.05}
            value={style.grid.opacity}
            onChange={(v) => edit((s) => ({ ...s, grid: { ...s.grid, opacity: v } }))}
          />
        </Group>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: Key; children: ComponentChildren }) {
  return (
    <fieldset class="style-group">
      <legend>{t(title)}</legend>
      {children}
    </fieldset>
  );
}

function Slider(props: {
  label: Key;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const [live, setLive] = useState<number | null>(null);
  const shown = live ?? props.value;
  return (
    <label class="slider">
      <span>{t(props.label)}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={shown}
        onInput={(e) => setLive(Number(e.currentTarget.value))}
        onChange={(e) => {
          setLive(null);
          props.onChange(Number(e.currentTarget.value));
        }}
      />
      <span class="value">{Number(shown.toFixed(3))}</span>
    </label>
  );
}

function Color(props: { label: Key; value: string; onChange: (v: string) => void }) {
  return (
    <label class="slider">
      <span>{t(props.label)}</span>
      <input type="color" value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} />
    </label>
  );
}

function Choice<T extends string>(props: { options: [T, Key][]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="segmented wrap">
      {props.options.map(([v, key]) => (
        <button key={v} class={props.value === v ? "active" : ""} onClick={() => props.onChange(v)}>
          {t(key)}
        </button>
      ))}
    </div>
  );
}

function Texture(props: { value: string | null; onChange: (v: string | null) => void }) {
  const upload = async () => {
    const [file] = await pickFile("image/*");
    if (!file) return;
    try {
      props.onChange(await imageFileToData(file));
    } catch {
      say(t("badImage"), "ERROR");
    }
  };
  return (
    <div class="slider">
      <span>{t("texture")}</span>
      {props.value && <img class="thumb" src={props.value} alt="" />}
      <button onClick={upload}>{t(props.value ? "replace" : "upload")}</button>
      {props.value && <button onClick={() => props.onChange(null)}>×</button>}
    </div>
  );
}

function Stamps(props: { value: string[]; onChange: (v: string[]) => void }) {
  const add = async () => {
    const files = await pickFile("image/*", true);
    const added: string[] = [];
    for (const f of files) {
      try {
        added.push(await imageFileToData(f));
      } catch {
        say(t("badImage"), "ERROR");
      }
    }
    if (added.length) props.onChange([...props.value, ...added]);
  };
  return (
    <div class="stamps">
      <span>{t("stampImages")}</span>
      <div class="stamp-list">
        {props.value.map((src, i) => (
          <button
            key={i}
            class="stamp"
            title={t("removeImage")}
            onClick={() => props.onChange(props.value.filter((_, j) => j !== i))}
          >
            <img src={src} alt="" />
          </button>
        ))}
        <button onClick={add}>{t("upload")}</button>
      </div>
      {props.value.length === 0 && <div class="muted small">{t("stampsHint")}</div>}
    </div>
  );
}
