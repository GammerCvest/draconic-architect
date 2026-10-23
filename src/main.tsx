import { render } from "preact";
import "./style.css";
import { Editor } from "./editor";
import { lang, setLang } from "./i18n";
import { Stage } from "./stage";
import { App } from "./ui/App";

setLang(lang());
const editor = new Editor();
const stage = new Stage(editor);
render(<App editor={editor} stage={stage} />, document.getElementById("app")!);
