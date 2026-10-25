import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { App, updateReady } from "./ui/App";
import "./styles.css";

render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator) {
  // 新しい版があっても自動では再読み込みしない（実戦中に画面が変わらないように）。
  // 実戦の記録は保存済みなので、利用者が押して再読み込みしても続きから再開できる。
  const update = registerSW({
    onNeedRefresh() {
      updateReady.value = () => void update(true);
    },
  });
}
