import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang } from "../i18n";
import { startReconciler } from "../table/reconcile";
import { registerTools } from "../table/tools";

setLang(lang());
OBR.onReady(async () => {
  await registerTools();
  startReconciler();
});
