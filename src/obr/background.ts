import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang } from "../i18n";
import { listenForPlayerDoors } from "../table/modes";
import { isLeader, startReconciler } from "../table/reconcile";
import { registerTools } from "../table/tools";

setLang(lang());
OBR.onReady(async () => {
  await registerTools();
  startReconciler();
  listenForPlayerDoors(isLeader);
});
