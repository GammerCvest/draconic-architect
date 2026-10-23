import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang, t } from "../i18n";
import { EDITOR_MODAL, whenReady } from "./table";
import "./popover.css";

setLang(lang());
const root = document.getElementById("popover")!;
const title = document.createElement("h1");
title.textContent = t("appName");
const hint = document.createElement("p");
hint.textContent = t("obrHint");
const open = document.createElement("button");
open.textContent = t("obrOpen");
open.addEventListener("click", async () => {
  await whenReady();
  await OBR.modal.open({ id: EDITOR_MODAL, url: `${import.meta.env.BASE_URL}index.html?table=1`, fullScreen: true });
  await OBR.action.close();
});
root.append(title, hint, open);
