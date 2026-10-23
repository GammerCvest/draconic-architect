import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang, t, type Key } from "../i18n";
import { PRESETS } from "../style/presets";
import { STYLE } from "../table/ids";
import { sceneStyle } from "../table/reconcile";
import { EDITOR_MODAL, whenReady } from "./table";
import "./popover.css";

setLang(lang());
const root = document.getElementById("popover")!;

const title = document.createElement("h1");
title.textContent = t("appName");

const tableHint = document.createElement("p");
tableHint.textContent = t("tableHint");

const styleLabel = document.createElement("label");
styleLabel.textContent = t("tableStyle");
const style = document.createElement("select");
for (const p of PRESETS) style.append(new Option(t(p.name as Key), p.id));
style.addEventListener("change", () => OBR.scene.setMetadata({ [STYLE]: style.value }));
styleLabel.append(style);

const editorHint = document.createElement("p");
editorHint.textContent = t("obrHint");
const open = document.createElement("button");
open.textContent = t("obrOpen");
open.addEventListener("click", async () => {
  await whenReady();
  await OBR.modal.open({ id: EDITOR_MODAL, url: `${import.meta.env.BASE_URL}index.html?table=1`, fullScreen: true });
  await OBR.action.close();
});

root.append(title, tableHint, styleLabel, editorHint, open);

whenReady().then(async () => {
  const sync = async () => {
    style.disabled = !(await OBR.scene.isReady()) || (await OBR.player.getRole()) !== "GM";
    if (await OBR.scene.isReady()) style.value = (await sceneStyle()).id;
  };
  await sync();
  OBR.scene.onReadyChange(sync);
  OBR.scene.onMetadataChange(sync);
});
