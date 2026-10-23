import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang, t, type Key } from "../i18n";
import { PRESETS } from "../style/presets";
import { FOG_OFF, STYLE } from "../table/ids";
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

const fogLabel = document.createElement("label");
fogLabel.className = "check";
const fog = document.createElement("input");
fog.type = "checkbox";
fog.addEventListener("change", () => OBR.scene.setMetadata({ [FOG_OFF]: !fog.checked }));
fogLabel.append(fog, t("tableFog"));

const editorHint = document.createElement("p");
editorHint.textContent = t("obrHint");
const open = document.createElement("button");
open.textContent = t("obrOpen");
open.addEventListener("click", async () => {
  await whenReady();
  await OBR.modal.open({ id: EDITOR_MODAL, url: `${import.meta.env.BASE_URL}index.html?table=1`, fullScreen: true });
  await OBR.action.close();
});

root.append(title, tableHint, styleLabel, fogLabel, editorHint, open);

whenReady().then(async () => {
  const sync = async () => {
    const ready = await OBR.scene.isReady();
    style.disabled = fog.disabled = !ready || (await OBR.player.getRole()) !== "GM";
    if (ready) {
      style.value = (await sceneStyle()).id;
      fog.checked = (await OBR.scene.getMetadata())[FOG_OFF] !== true;
    }
  };
  await sync();
  OBR.scene.onReadyChange(sync);
  OBR.scene.onMetadataChange(sync);
});
